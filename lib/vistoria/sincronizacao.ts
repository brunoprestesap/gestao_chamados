import 'server-only';

import { Types } from 'mongoose';

import { gravarHistoricoOuDesfazer } from '@/lib/ativos/auditoria';
import { criarAtivo } from '@/lib/ativos/cadastro';
import { normalizarCodigo } from '@/lib/ativos/codigo';
import { ehChaveDuplicada } from '@/lib/ativos/erros';
import { AtivoModel } from '@/models/Ativo';
import { AtivoHistoryModel } from '@/models/AtivoHistory';
import { CampanhaVistoriaModel } from '@/models/CampanhaVistoria';
import { ConferenciaVistoriaModel } from '@/models/ConferenciaVistoria';
import { LocalizacaoModel } from '@/models/Localizacao';
import { UserModel } from '@/models/user.model';
import { SEM_LOCAL } from '@/shared/ativos/ativo.constants';
import {
  avisoJaExistia,
  CAMPO_TECNICO_LABELS,
  CAMPOS_TECNICOS,
  type CampoTecnico,
  ERRO_ATIVO_INEXISTENTE,
  ERRO_ATIVO_NAO_VISTORIAVEL,
  ERRO_CAMPANHA_ENCERRADA,
  ERRO_CAMPANHA_INEXISTENTE,
  ERRO_LOCAL_INVALIDO,
  ERRO_OPERACAO_INVALIDA,
} from '@/shared/vistoria/vistoria.constants';
import {
  type OperacaoCadastro,
  type OperacaoConferencia,
  type OperacaoVistoria,
  OperacaoVistoriaSchema,
  papelDoPerfil,
  type ResultadoOperacao,
} from '@/shared/vistoria/vistoria.schemas';

import { ehVistoriavel } from './filtro';

/**
 * Sincronização da fila do celular (spec 0012, AC-5 a AC-13). Cada operação
 * é processada sozinha e em ordem; uma malformada volta `recusada` e não trava
 * as outras. Toda escrita no `Ativo` é por `updateOne` com `$set` por campo,
 * para não pisar na importação nem na edição da ficha.
 *
 * Erro inesperado sobe: a rota responde 500, o aparelho mantém tudo
 * `pendente`, e o reenvio é seguro porque cada `clientOpId` produz no máximo
 * um efeito (passo 2 da spec).
 */

export type SessaoVistoria = { userId: string; role: string };

type ConferenciaLean = {
  _id: Types.ObjectId;
  campanhaId: Types.ObjectId;
  ativoId: Types.ObjectId;
  autorId: Types.ObjectId;
  localizacaoId: Types.ObjectId;
  fabricante?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;
  conferidoEm: Date;
  cadastradoEmCampo?: boolean;
  efeitoAplicadoEm?: Date | null;
};

type AtivoLean = {
  _id: Types.ObjectId;
  codigo: string;
  tierManutencao: string;
  status: string;
  localizacaoId?: Types.ObjectId | null;
  fabricante?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;
  statusCadastro: string;
};

function recusada(clientOpId: string, mensagem: string): ResultadoOperacao {
  return { clientOpId, estado: 'recusada', mensagem };
}

/** O `clientOpId` de uma operação que pode estar malformada, para o aparelho achar o item. */
function clientOpIdDe(bruta: unknown): string {
  if (typeof bruta === 'object' && bruta !== null) {
    const v = (bruta as { clientOpId?: unknown }).clientOpId;
    if (typeof v === 'string') return v.slice(0, 64);
  }
  return '';
}

function duplicouCampo(e: unknown, campo: string): boolean {
  const k = (e as { keyPattern?: Record<string, unknown> }).keyPattern;
  return !!k && campo in k;
}

export async function processarLote(
  operacoes: unknown[],
  sessao: SessaoVistoria,
): Promise<ResultadoOperacao[]> {
  const resultados: ResultadoOperacao[] = [];
  for (const bruta of operacoes) {
    resultados.push(await processarOperacao(bruta, sessao));
  }
  return resultados;
}

export async function processarOperacao(
  bruta: unknown,
  sessao: SessaoVistoria,
): Promise<ResultadoOperacao> {
  // 1. Schema.
  const parsed = OperacaoVistoriaSchema.safeParse(bruta);
  if (!parsed.success) return recusada(clientOpIdDe(bruta), ERRO_OPERACAO_INVALIDA);
  const op = parsed.data;

  // 2. Reenvio da mesma operação.
  const repetida = await retomar(op.clientOpId, sessao.userId, op.tipo);
  if (repetida) return repetida;

  // 3. Campanha e local (o ativo, na conferência, logo abaixo).
  const recebidoEm = new Date();
  // Relógio do aparelho adiantado não grava hora no futuro (AC-9).
  const conferidoEm = op.conferidoEm > recebidoEm ? recebidoEm : op.conferidoEm;

  const campanha = Types.ObjectId.isValid(op.campanhaId)
    ? await CampanhaVistoriaModel.findById(op.campanhaId)
        .select('nome status encerradaEm')
        .lean<{ nome: string; status: string; encerradaEm?: Date | null }>()
    : null;
  if (!campanha) return recusada(op.clientOpId, ERRO_CAMPANHA_INEXISTENTE);
  if (
    campanha.status !== 'aberta' &&
    (!campanha.encerradaEm || conferidoEm.getTime() > campanha.encerradaEm.getTime())
  ) {
    return recusada(op.clientOpId, ERRO_CAMPANHA_ENCERRADA);
  }

  const local = await LocalizacaoModel.exists({ _id: op.localizacaoId, isActive: true });
  if (!local) return recusada(op.clientOpId, ERRO_LOCAL_INVALIDO);

  const ctx: Contexto = { sessao, nomeCampanha: campanha.nome, conferidoEm, recebidoEm };
  if (op.tipo === 'cadastro') return processarCadastro(op, ctx);
  return conferir(op, ctx);
}

type Contexto = {
  sessao: SessaoVistoria;
  nomeCampanha: string;
  conferidoEm: Date;
  recebidoEm: Date;
};

/** O que uma conferência grava, venha de uma `conferencia` ou de um cadastro que virou conferência. */
type DadosConferencia = Pick<
  OperacaoConferencia,
  'clientOpId' | 'campanhaId' | 'ativoId' | 'localizacaoId' | CampoTecnico
>;

type AtivoCriado = { _id: Types.ObjectId; codigo: string };

/** Confere um ativo que já existe (AC-5, AC-8, AC-10); `aviso` vai junto quando aceita. */
async function conferir(
  dados: DadosConferencia,
  ctx: Contexto,
  aviso?: string,
): Promise<ResultadoOperacao> {
  const ativo = Types.ObjectId.isValid(dados.ativoId)
    ? await AtivoModel.findById(dados.ativoId)
        .select('codigo tierManutencao status')
        .lean<Pick<AtivoLean, '_id' | 'codigo' | 'tierManutencao' | 'status'>>()
    : null;
  if (!ativo) return recusada(dados.clientOpId, ERRO_ATIVO_INEXISTENTE);
  if (!ehVistoriavel(ativo)) return recusada(dados.clientOpId, ERRO_ATIVO_NAO_VISTORIAVEL);

  // 5. A conferência; o índice único decide quem chegou primeiro.
  let conferencia: ConferenciaLean;
  try {
    const doc = await ConferenciaVistoriaModel.create(montarConferencia(dados, ctx, false));
    conferencia = doc.toObject() as unknown as ConferenciaLean;
  } catch (e) {
    const r = await tratarDuplicada(e, dados, ctx.sessao.userId, ativo.codigo, aviso);
    if (r) return r;
    throw e;
  }

  // 6. O efeito no ativo.
  await aplicarEfeito(conferencia, ctx.nomeCampanha);
  return {
    clientOpId: dados.clientOpId,
    estado: 'aceita',
    ativoId: String(ativo._id),
    codigo: ativo.codigo,
    ...(aviso && { mensagem: aviso }),
  };
}

/**
 * Cadastro em campo (AC-11 a AC-13). O ativo nasce `validado` com o
 * `clientOpId` em `origemOpId`; a conferência já sai com o efeito aplicado,
 * porque o efeito foi a criação. Tombo que o servidor já tem vira conferência.
 */
async function processarCadastro(op: OperacaoCadastro, ctx: Contexto): Promise<ResultadoOperacao> {
  const tombo =
    op.origemCodigo === 'patrimonio' && op.tombamento ? normalizarCodigo(op.tombamento) : null;
  const tecnicos = { fabricante: op.fabricante, modelo: op.modelo, numeroSerie: op.numeroSerie };
  const comoConferencia = (existente: AtivoCriado) =>
    conferir(
      {
        clientOpId: op.clientOpId,
        campanhaId: op.campanhaId,
        ativoId: String(existente._id),
        localizacaoId: op.localizacaoId,
        ...tecnicos,
      },
      ctx,
      avisoJaExistia(existente.codigo),
    );
  const porCodigo = () =>
    tombo ? AtivoModel.findOne({ codigo: tombo }).select('codigo').lean<AtivoCriado>() : null;
  const porOrigem = () =>
    AtivoModel.findOne({ origemOpId: op.clientOpId }).select('codigo').lean<AtivoCriado>();

  // 4. Retomada: uma queda depois de criar o ativo e antes da conferência.
  let criado = await porOrigem();
  if (!criado) {
    const existente = await porCodigo();
    if (existente) return comoConferencia(existente);

    const r = await criarAtivo(
      {
        origemCodigo: op.origemCodigo,
        tombamento: tombo ?? undefined,
        descricao: op.descricao,
        categoriaId: op.categoriaId,
        localizacaoId: op.localizacaoId,
        tierManutencao: op.tierManutencao,
        ...tecnicos,
      },
      ctx.sessao.userId,
      {
        origemOpId: op.clientOpId,
        validado: true,
        observacao: `Cadastro em campo: ${ctx.nomeCampanha}`,
      },
    );
    if (r.ok) {
      criado = { _id: new Types.ObjectId(r.id), codigo: r.codigo };
    } else {
      // Corrida: o mesmo reenvio ao mesmo tempo, ou o mesmo tombo cadastrado
      // por outra pessoa no mesmo instante (E11000 em `codigo`).
      criado = await porOrigem();
      if (!criado) {
        const outro = await porCodigo();
        if (outro) return comoConferencia(outro);
        return recusada(op.clientOpId, r.error);
      }
    }
  }

  // 5. A conferência do ativo novo, já com o efeito aplicado.
  const dados: DadosConferencia = {
    clientOpId: op.clientOpId,
    campanhaId: op.campanhaId,
    ativoId: String(criado._id),
    localizacaoId: op.localizacaoId,
    ...tecnicos,
  };
  try {
    await ConferenciaVistoriaModel.create(montarConferencia(dados, ctx, true));
  } catch (e) {
    const r = await tratarDuplicada(e, dados, ctx.sessao.userId, criado.codigo);
    if (r) return r;
    throw e;
  }
  return {
    clientOpId: op.clientOpId,
    estado: 'aceita',
    ativoId: String(criado._id),
    codigo: criado.codigo,
  };
}

/** E11000 ao gravar a conferência: o mesmo `clientOpId` (reenvio) ou o ativo já conferido. */
async function tratarDuplicada(
  e: unknown,
  dados: DadosConferencia,
  userId: string,
  codigo: string,
  aviso?: string,
): Promise<ResultadoOperacao | null> {
  if (!ehChaveDuplicada(e)) return null;
  if (duplicouCampo(e, 'clientOpId')) {
    return retomar(dados.clientOpId, userId, aviso ? 'cadastro' : 'conferencia');
  }
  return jaConferido(dados.clientOpId, dados.campanhaId, dados.ativoId, codigo);
}

function montarConferencia(dados: DadosConferencia, ctx: Contexto, cadastradoEmCampo: boolean) {
  return {
    campanhaId: new Types.ObjectId(dados.campanhaId),
    ativoId: new Types.ObjectId(dados.ativoId),
    autorId: new Types.ObjectId(ctx.sessao.userId),
    papelAutor: papelDoPerfil(ctx.sessao.role),
    localizacaoId: new Types.ObjectId(dados.localizacaoId),
    fabricante: dados.fabricante ?? null,
    modelo: dados.modelo ?? null,
    numeroSerie: dados.numeroSerie ?? null,
    cadastradoEmCampo,
    conferidoEm: ctx.conferidoEm,
    recebidoEm: ctx.recebidoEm,
    clientOpId: dados.clientOpId,
    // No cadastro, o efeito foi a própria criação do ativo.
    efeitoAplicadoEm: cadastradoEmCampo ? new Date() : null,
  };
}

/**
 * O `clientOpId` já tem conferência gravada (AC-7): devolve o mesmo
 * resultado da primeira vez. Se a escrita no ativo não chegou a terminar,
 * termina agora.
 */
async function retomar(
  clientOpId: string,
  userId: string,
  tipo: OperacaoVistoria['tipo'],
): Promise<ResultadoOperacao | null> {
  const c = await ConferenciaVistoriaModel.findOne({ clientOpId }).lean<ConferenciaLean>();
  if (!c) return null;
  // Um identificador de outra pessoa nunca devolve o resultado dela.
  if (String(c.autorId) !== userId) return recusada(clientOpId, ERRO_OPERACAO_INVALIDA);

  if (!c.efeitoAplicadoEm) {
    const campanha = await CampanhaVistoriaModel.findById(c.campanhaId)
      .select('nome')
      .lean<{ nome: string }>();
    await aplicarEfeito(c, campanha?.nome ?? '');
  }
  const ativo = await AtivoModel.findById(c.ativoId).select('codigo').lean<{ codigo: string }>();
  // Um cadastro que virou conferência repete o aviso da primeira vez (AC-13).
  const virouConferencia = tipo === 'cadastro' && !c.cadastradoEmCampo;
  return {
    clientOpId,
    estado: 'aceita',
    ativoId: String(c.ativoId),
    ...(ativo && { codigo: ativo.codigo }),
    ...(ativo && virouConferencia && { mensagem: avisoJaExistia(ativo.codigo) }),
  };
}

async function jaConferido(
  clientOpId: string,
  campanhaId: string,
  ativoId: string,
  codigo: string,
): Promise<ResultadoOperacao> {
  const vencedora = await ConferenciaVistoriaModel.findOne({ campanhaId, ativoId })
    .select('autorId conferidoEm')
    .lean<{ autorId: Types.ObjectId; conferidoEm: Date }>();
  const autor = vencedora
    ? await UserModel.findById(vencedora.autorId).select('name').lean<{ name: string }>()
    : null;
  return {
    clientOpId,
    estado: 'ja_conferido',
    ativoId,
    codigo,
    conferidoPor: autor?.name ?? 'outra pessoa',
    ...(vencedora && { conferidoEm: vencedora.conferidoEm.toISOString() }),
  };
}

/**
 * Escreve no ativo o local e os campos técnicos que vieram preenchidos,
 * valida o cadastro se ainda não estava e grava o histórico do que mudou de
 * fato (AC-5). Só no fim marca `efeitoAplicadoEm`: uma queda no meio faz o
 * reenvio refazer este passo.
 */
async function aplicarEfeito(conferencia: ConferenciaLean, nomeCampanha: string): Promise<void> {
  const ativo = await AtivoModel.findById(conferencia.ativoId)
    .select('localizacaoId fabricante modelo numeroSerie statusCadastro')
    .lean<AtivoLean>();
  if (!ativo) throw new Error(`Ativo ${String(conferencia.ativoId)} sumiu durante a vistoria.`);

  const set: Record<string, unknown> = {};
  const antes: Record<string, unknown> = {};
  const historicos: Record<string, unknown>[] = [];

  const localAtual = ativo.localizacaoId ? String(ativo.localizacaoId) : null;
  const localNovo = String(conferencia.localizacaoId);
  let historicoLocal: Record<string, unknown> | null = null;
  if (localAtual !== localNovo) {
    const [antigo, novo] = await Promise.all([
      localAtual
        ? LocalizacaoModel.findById(localAtual).select('caminho').lean<{ caminho: string }>()
        : null,
      LocalizacaoModel.findById(localNovo).select('caminho').lean<{ caminho: string }>(),
    ]);
    set.localizacaoId = conferencia.localizacaoId;
    antes.localizacaoId = ativo.localizacaoId ?? null;
    historicoLocal = {
      acao: 'alteracao_localizacao',
      de: antigo?.caminho ?? SEM_LOCAL,
      para: novo?.caminho ?? SEM_LOCAL,
    };
  }

  const mudaram: string[] = [];
  for (const campo of CAMPOS_TECNICOS) {
    const informado = conferencia[campo as CampoTecnico];
    // Em branco (ou não enviado) mantém o valor atual.
    if (!informado || informado === (ativo[campo] ?? null)) continue;
    set[campo] = informado;
    antes[campo] = ativo[campo] ?? null;
    mudaram.push(CAMPO_TECNICO_LABELS[campo]);
  }

  historicos.push({
    acao: 'conferencia',
    para: nomeCampanha || null,
    observacao: mudaram.length ? `Campos alterados: ${mudaram.join(', ')}` : null,
  });
  if (historicoLocal) historicos.push(historicoLocal);

  if (Object.keys(set).length) {
    await AtivoModel.updateOne({ _id: ativo._id }, { $set: set });
  }

  let validou = false;
  if (ativo.statusCadastro !== 'validado') {
    // Só a passagem para `validado` escreve quem validou e quando.
    const r = await AtivoModel.updateOne(
      { _id: ativo._id, statusCadastro: { $ne: 'validado' } },
      {
        $set: {
          statusCadastro: 'validado',
          validadoPor: conferencia.autorId,
          validadoEm: new Date(),
        },
      },
    );
    validou = r.modifiedCount === 1;
    if (validou) historicos.push({ acao: 'validacao' });
  }

  // Ids escolhidos antes: se o `insertMany` gravar só parte, o desfazer apaga essa parte.
  const docs = historicos.map((h) => ({
    ...h,
    _id: new Types.ObjectId(),
    ativoId: ativo._id,
    actorType: 'usuario',
    autorId: conferencia.autorId,
  }));
  await gravarHistoricoOuDesfazer(
    () => AtivoHistoryModel.insertMany(docs),
    async () => {
      await AtivoHistoryModel.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
      if (Object.keys(antes).length) {
        await AtivoModel.updateOne({ _id: ativo._id }, { $set: antes });
      }
      if (validou) {
        await AtivoModel.updateOne(
          { _id: ativo._id, statusCadastro: 'validado' },
          { $set: { statusCadastro: ativo.statusCadastro, validadoPor: null, validadoEm: null } },
        );
      }
    },
  );

  await ConferenciaVistoriaModel.updateOne(
    { _id: conferencia._id },
    { $set: { efeitoAplicadoEm: new Date() } },
  );
}
