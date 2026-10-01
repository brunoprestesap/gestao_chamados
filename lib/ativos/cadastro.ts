import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { AtivoHistoryModel } from '@/models/AtivoHistory';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ContadorModel } from '@/models/Contador';
import { LocalizacaoModel } from '@/models/Localizacao';
import {
  ATIVO_STATUS_LABELS,
  type AtivoStatus,
  CONTADOR_ATIVO_MNT,
  type Criticidade,
  erroCodigoRepetido,
  type OrigemCodigo,
  SEM_LOCAL,
  STATUS_QUE_EXIGEM_OBSERVACAO,
  type TierManutencao,
} from '@/shared/ativos/ativo.constants';

import { gravarHistoricoOuDesfazer } from './auditoria';
import { formatarCodigoInterno, normalizarCodigo } from './codigo';
import { ehChaveDuplicada, falha, type Resultado } from './erros';

/**
 * Cadastro e edição do ativo (spec 0011, AC-4 a AC-7). Toda escrita grava
 * `AtivoHistory` com o autor da sessão. `codigo`, `origemCodigo` e
 * `tombamento` nunca mudam depois do cadastro.
 */

type CamposEditaveis = {
  descricao: string;
  categoriaId: string;
  localizacaoId?: string;
  tierManutencao: TierManutencao;
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  dataInstalacao?: Date;
};

export type CriarAtivoDados = CamposEditaveis & {
  origemCodigo: OrigemCodigo;
  tombamento?: string;
  criticidade?: Criticidade;
};

export type EditarAtivoDados = CamposEditaveis & { id: string; criticidade: Criticidade };

/** Rótulos dos campos livres, para a observação da `edicao`. */
const ROTULO_CAMPO: Record<string, string> = {
  descricao: 'descrição',
  tierManutencao: 'tier de manutenção',
  fabricante: 'fabricante',
  modelo: 'modelo',
  numeroSerie: 'número de série',
  dataInstalacao: 'data de instalação',
  criticidade: 'criticidade',
};

/**
 * Próximo `MNT-####`. `$inc` com upsert é atômico; dois upserts simultâneos
 * na primeira vez podem dar E11000 no `_id`, e aí basta repetir uma vez.
 */
export async function proximoCodigoInterno(): Promise<string> {
  const incrementar = () =>
    ContadorModel.findOneAndUpdate(
      { _id: CONTADOR_ATIVO_MNT },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    ).lean<{ seq: number }>();
  let doc;
  try {
    doc = await incrementar();
  } catch (e) {
    if (!ehChaveDuplicada(e)) throw e;
    doc = await incrementar();
  }
  if (!doc) throw new Error('Contador de código interno indisponível.');
  return formatarCodigoInterno(doc.seq);
}

async function categoriaAtiva(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return CategoriaAtivoModel.findOne({ _id: id, isActive: true })
    .select('nome criticidadePadrao')
    .lean<{ _id: Types.ObjectId; nome: string; criticidadePadrao: Criticidade }>();
}

async function localAtivo(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return LocalizacaoModel.findOne({ _id: id, isActive: true })
    .select('caminho')
    .lean<{ _id: Types.ObjectId; caminho: string }>();
}

export async function criarAtivo(
  dados: CriarAtivoDados,
  autorId: string,
): Promise<Resultado<{ id: string; codigo: string }>> {
  const categoria = await categoriaAtiva(dados.categoriaId);
  if (!categoria) return falha('Categoria inexistente ou desativada.');
  const local = dados.localizacaoId ? await localAtivo(dados.localizacaoId) : null;
  if (dados.localizacaoId && !local) return falha('Local inexistente ou desativado.');

  let codigo: string;
  let tombamento: string | null = null;
  if (dados.origemCodigo === 'patrimonio') {
    if (!dados.tombamento || !/^\d+$/.test(dados.tombamento)) {
      return falha('O tombamento só tem números.');
    }
    codigo = normalizarCodigo(dados.tombamento);
    tombamento = codigo;
    if (await AtivoModel.exists({ codigo })) return falha(erroCodigoRepetido(codigo));
  } else {
    codigo = await proximoCodigoInterno();
  }

  let id: Types.ObjectId;
  try {
    const doc = await AtivoModel.create({
      codigo,
      origemCodigo: dados.origemCodigo,
      tombamento,
      descricao: dados.descricao,
      categoriaId: categoria._id,
      localizacaoId: local?._id ?? null,
      fabricante: dados.fabricante ?? null,
      modelo: dados.modelo ?? null,
      numeroSerie: dados.numeroSerie ?? null,
      dataInstalacao: dados.dataInstalacao ?? null,
      criticidade: dados.criticidade ?? categoria.criticidadePadrao,
      tierManutencao: dados.tierManutencao,
      status: 'em_operacao',
      statusCadastro: 'em_vistoria',
    });
    id = doc._id;
  } catch (e) {
    if (ehChaveDuplicada(e)) return falha(erroCodigoRepetido(codigo));
    throw e;
  }

  // Ativo sem histórico de cadastro não fica: acabou de nascer, ninguém o usou.
  await gravarHistoricoOuDesfazer(
    () =>
      AtivoHistoryModel.create({
        ativoId: id,
        acao: 'cadastro',
        actorType: 'usuario',
        autorId: new Types.ObjectId(autorId),
        para: codigo,
        observacao: 'Cadastro manual',
      }),
    () => AtivoModel.deleteOne({ _id: id }),
  );
  return { ok: true, id: String(id), codigo };
}

type AtivoAtual = {
  _id: Types.ObjectId;
  descricao: string;
  categoriaId: Types.ObjectId;
  localizacaoId?: Types.ObjectId | null;
  tierManutencao: TierManutencao;
  fabricante?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;
  dataInstalacao?: Date | null;
  criticidade: Criticidade;
  status: AtivoStatus;
  statusCadastro: string;
};

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : null;
    const tb = b instanceof Date ? b.getTime() : null;
    return ta === tb;
  }
  return (a ?? null) === (b ?? null);
}

export async function editarAtivo(dados: EditarAtivoDados, autorId: string): Promise<Resultado> {
  if (!Types.ObjectId.isValid(dados.id)) return falha('Ativo inexistente.');
  const atual = await AtivoModel.findById(dados.id).lean<AtivoAtual>();
  if (!atual) return falha('Ativo inexistente.');

  const autor = new Types.ObjectId(autorId);
  const set: Record<string, unknown> = {};
  const historicos: Record<string, unknown>[] = [];

  if (dados.categoriaId !== String(atual.categoriaId)) {
    const nova = await categoriaAtiva(dados.categoriaId);
    if (!nova) return falha('Categoria inexistente ou desativada.');
    const antiga = await CategoriaAtivoModel.findById(atual.categoriaId).select('nome').lean();
    set.categoriaId = nova._id;
    historicos.push({ acao: 'alteracao_categoria', de: antiga?.nome ?? null, para: nova.nome });
  }

  const localAtual = atual.localizacaoId ? String(atual.localizacaoId) : undefined;
  if ((dados.localizacaoId ?? undefined) !== localAtual) {
    if (!dados.localizacaoId && atual.statusCadastro === 'validado') {
      return falha('Ativo validado precisa de local.');
    }
    const novo = dados.localizacaoId ? await localAtivo(dados.localizacaoId) : null;
    if (dados.localizacaoId && !novo) return falha('Local inexistente ou desativado.');
    const antigo = atual.localizacaoId
      ? await LocalizacaoModel.findById(atual.localizacaoId).select('caminho').lean()
      : null;
    set.localizacaoId = novo?._id ?? null;
    historicos.push({
      acao: 'alteracao_localizacao',
      de: antigo?.caminho ?? SEM_LOCAL,
      para: novo?.caminho ?? SEM_LOCAL,
    });
  }

  const livres = {
    descricao: dados.descricao,
    tierManutencao: dados.tierManutencao,
    fabricante: dados.fabricante ?? null,
    modelo: dados.modelo ?? null,
    numeroSerie: dados.numeroSerie ?? null,
    dataInstalacao: dados.dataInstalacao ?? null,
    criticidade: dados.criticidade,
  };
  const mudaram: string[] = [];
  for (const [campo, valor] of Object.entries(livres)) {
    if (!igual(atual[campo as keyof AtivoAtual], valor)) {
      set[campo] = valor;
      mudaram.push(ROTULO_CAMPO[campo] ?? campo);
    }
  }
  if (mudaram.length) {
    historicos.push({ acao: 'edicao', observacao: `Campos alterados: ${mudaram.join(', ')}` });
  }

  if (historicos.length === 0) return { ok: true };

  const antes = Object.fromEntries(
    Object.keys(set).map((campo) => [campo, atual[campo as keyof AtivoAtual] ?? null]),
  );
  // Ids escolhidos antes: se o `insertMany` gravar só parte, o desfazer apaga essa parte.
  const docsHistorico = historicos.map((h) => ({
    ...h,
    _id: new Types.ObjectId(),
    ativoId: atual._id,
    actorType: 'usuario',
    autorId: autor,
  }));

  await AtivoModel.updateOne({ _id: atual._id }, { $set: set });
  await gravarHistoricoOuDesfazer(
    () => AtivoHistoryModel.insertMany(docsHistorico),
    async () => {
      await AtivoHistoryModel.deleteMany({ _id: { $in: docsHistorico.map((d) => d._id) } });
      await AtivoModel.updateOne({ _id: atual._id }, { $set: antes });
    },
  );
  return { ok: true };
}

export async function alterarStatusAtivo(
  dados: { id: string; status: AtivoStatus; observacao?: string },
  autorId: string,
): Promise<Resultado> {
  if (!Types.ObjectId.isValid(dados.id)) return falha('Ativo inexistente.');
  if (STATUS_QUE_EXIGEM_OBSERVACAO.includes(dados.status) && !dados.observacao) {
    return falha(`Explique por que o ativo vai para "${ATIVO_STATUS_LABELS[dados.status]}".`);
  }
  const atual = await AtivoModel.findById(dados.id).select('status').lean<AtivoAtual>();
  if (!atual) return falha('Ativo inexistente.');
  if (atual.status === dados.status) return { ok: true };

  await AtivoModel.updateOne({ _id: atual._id }, { $set: { status: dados.status } });
  await gravarHistoricoOuDesfazer(
    () =>
      AtivoHistoryModel.create({
        ativoId: atual._id,
        acao: 'alteracao_status',
        actorType: 'usuario',
        autorId: new Types.ObjectId(autorId),
        de: ATIVO_STATUS_LABELS[atual.status],
        para: ATIVO_STATUS_LABELS[dados.status],
        observacao: dados.observacao ?? null,
      }),
    () =>
      AtivoModel.updateOne(
        { _id: atual._id, status: dados.status },
        { $set: { status: atual.status } },
      ),
  );
  return { ok: true };
}

export async function validarAtivo(id: string, autorId: string): Promise<Resultado> {
  if (!Types.ObjectId.isValid(id)) return falha('Ativo inexistente.');
  const atual = await AtivoModel.findById(id)
    .select('localizacaoId statusCadastro')
    .lean<AtivoAtual>();
  if (!atual) return falha('Ativo inexistente.');
  if (atual.statusCadastro === 'validado') return { ok: true };
  if (!atual.localizacaoId) return falha('Defina o local do ativo antes de validar.');

  // O filtro repete a exigência de local: uma edição que tire o local no
  // meio do caminho não deixa um `validado` sem local.
  const r = await AtivoModel.updateOne(
    { _id: atual._id, localizacaoId: { $type: 'objectId' }, statusCadastro: { $ne: 'validado' } },
    {
      $set: {
        statusCadastro: 'validado',
        validadoPor: new Types.ObjectId(autorId),
        validadoEm: new Date(),
      },
    },
  );
  if (r.modifiedCount === 0) return falha('Defina o local do ativo antes de validar.');

  await gravarHistoricoOuDesfazer(
    () =>
      AtivoHistoryModel.create({
        ativoId: atual._id,
        acao: 'validacao',
        actorType: 'usuario',
        autorId: new Types.ObjectId(autorId),
      }),
    () =>
      AtivoModel.updateOne(
        { _id: atual._id, statusCadastro: 'validado' },
        { $set: { statusCadastro: atual.statusCadastro, validadoPor: null, validadoEm: null } },
      ),
  );
  return { ok: true };
}
