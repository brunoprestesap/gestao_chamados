import 'server-only';

import { Types } from 'mongoose';

import { dbConnect } from '@/lib/db';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { DECISAO_CORRECOES_MAX, DecisaoIaModel } from '@/models/DecisaoIa';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { UserModel } from '@/models/user.model';
import {
  DECISAO_CAMPO_LABELS,
  DECISAO_CAMPOS_DA_IA,
  type DecisaoCampo,
  type DecisaoSituacao,
  type IaSituacao,
} from '@/shared/conversas/conversa.constants';
import {
  DECISAO_CORRECAO_MOTIVO_MAX,
  DECISAO_ROTULO_MAX,
  decisaoMotivoSchema,
  objectIdSchema,
  valorAtivoSchema,
  type ValorDecisao,
  type ValorDecisaoInput,
  valorPrioridadeSchema,
  valorServicoSchema,
  valorTecnicoSchema,
} from '@/shared/conversas/conversa.schemas';

import type { CorrecaoLida, DecisaoEntrada, DecisaoLida, Falha, Resultado, Viewer } from './types';

/**
 * Decisões da IA: gravação, veredito da gestão e leitura (spec 0002).
 *
 * Saída do modelo é dado não confiável: todo id é conferido no banco antes de
 * qualquer gravação, e o rótulo exibido é lido de lá, nunca do texto do modelo.
 */

const falha = (reason: Falha['reason']): Falha => ({ ok: false, reason });

const VALOR_VAZIO = {
  catalogServiceId: null,
  subtypeId: null,
  tipoServico: null,
  prioridade: null,
  tecnicoId: null,
  ativoId: null,
};

/** Rótulo gravado quando a gestão tira o equipamento do chamado (spec 0014, AC-12). */
export const ROTULO_SEM_ATIVO = 'Nenhum equipamento';

/**
 * Confere o valor decidido contra o banco e devolve o `ValorDecisao` com o
 * rótulo lido de lá. `null` quando o valor não passa (AC-7).
 */
export async function resolverValorNoBanco(
  campo: DecisaoCampo,
  valor: ValorDecisaoInput,
): Promise<ValorDecisao | null> {
  if (campo === 'servico') {
    const parsed = valorServicoSchema.safeParse(valor);
    if (!parsed.success) return null;

    const catalogo = await ServiceCatalogModel.findById(parsed.data.catalogServiceId)
      .select('name subtypeId typeId')
      .lean();
    if (!catalogo) return null;
    // O serviço tem que pertencer ao subtipo informado: id inventado não passa.
    if (String(catalogo.subtypeId) !== parsed.data.subtypeId) return null;

    return {
      ...VALOR_VAZIO,
      catalogServiceId: parsed.data.catalogServiceId,
      subtypeId: parsed.data.subtypeId,
      tipoServico: parsed.data.tipoServico ?? null,
      rotulo: String(catalogo.name).slice(0, DECISAO_ROTULO_MAX),
    };
  }

  if (campo === 'prioridade') {
    const parsed = valorPrioridadeSchema.safeParse(valor);
    if (!parsed.success) return null;
    return { ...VALOR_VAZIO, prioridade: parsed.data.prioridade, rotulo: parsed.data.prioridade };
  }

  if (campo === 'ativo') {
    const parsed = valorAtivoSchema.safeParse(valor);
    if (!parsed.success) return null;
    if (parsed.data.ativoId === null) return { ...VALOR_VAZIO, rotulo: ROTULO_SEM_ATIVO };

    const ativo = await AtivoModel.findById(parsed.data.ativoId).select('codigo').lean();
    if (!ativo) return null;
    return {
      ...VALOR_VAZIO,
      ativoId: parsed.data.ativoId,
      rotulo: String(ativo.codigo).slice(0, DECISAO_ROTULO_MAX),
    };
  }

  const parsed = valorTecnicoSchema.safeParse(valor);
  if (!parsed.success) return null;

  const tecnico = await UserModel.findById(parsed.data.tecnicoId).select('name role').lean();
  if (!tecnico || tecnico.role !== 'Técnico') return null;

  return {
    ...VALOR_VAZIO,
    tecnicoId: parsed.data.tecnicoId,
    rotulo: String(tecnico.name).slice(0, DECISAO_ROTULO_MAX),
  };
}

/** Compara pelos identificadores; o rótulo muda se o catálogo for renomeado. */
export function mesmoValor(a: ValorDecisao, b: ValorDecisao): boolean {
  return (
    String(a.catalogServiceId ?? '') === String(b.catalogServiceId ?? '') &&
    String(a.subtypeId ?? '') === String(b.subtypeId ?? '') &&
    String(a.prioridade ?? '') === String(b.prioridade ?? '') &&
    String(a.tecnicoId ?? '') === String(b.tecnicoId ?? '') &&
    String(a.ativoId ?? '') === String(b.ativoId ?? '')
  );
}

/** `situacao` sai sempre daqui, na mesma gravação que muda o que ela resume. */
export function derivarSituacao(
  valorIa: ValorDecisao,
  valorFinal: ValorDecisao,
  revisadaEm: Date | null,
): DecisaoSituacao {
  if (!mesmoValor(valorIa, valorFinal)) return 'corrigida';
  return revisadaEm ? 'confirmada' : 'sem_revisao';
}

/**
 * `Chamado.iaSituacao` no momento da abertura. A decisão `ativo` é da regra do
 * cartão, não da IA, e não conta (spec 0014, AC-11).
 */
export function derivarIaSituacao(
  decisoes: Pick<DecisaoEntrada, 'campo' | 'efeito'>[],
): IaSituacao {
  const daIa = decisoes.filter((d) => d.campo !== 'ativo');
  if (daIa.length === 0) return 'sem_ia';
  return daIa.some((d) => d.efeito === 'aplicado') ? 'decidida' : 'sugerida';
}

function erroChaveDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export type GravarDecisaoParams = DecisaoEntrada & {
  chamadoId: string;
  conversaId?: string | null;
  /** Usuário que confirmou, quando `valorConfirmado` difere do proposto. */
  confirmadoPorUserId?: string | null;
};

/**
 * Gravação repetível: devolve `criada: false` quando a decisão daquele
 * `{ chamadoId, campo }` já existe, em vez de falhar. É o que deixa
 * `abrirChamadoDaConversa` rodar de novo sem efeito duplo.
 */
export async function gravarDecisao(
  params: GravarDecisaoParams,
): Promise<{ id: string; criada: boolean; valorFinal: ValorDecisao } | null> {
  const motivo = decisaoMotivoSchema.safeParse(params.motivo);
  if (!motivo.success) return null;
  if (!objectIdSchema.safeParse(params.chamadoId).success) return null;

  const valorIa = await resolverValorNoBanco(params.campo, params.valor);
  if (!valorIa) return null;

  // O solicitante pode confirmar um valor diferente do proposto (AC-8).
  let valorFinal = valorIa;
  const correcoes: CorrecaoLida[] = [];
  if (params.valorConfirmado) {
    const confirmado = await resolverValorNoBanco(params.campo, params.valorConfirmado);
    if (!confirmado) return null;
    if (!mesmoValor(valorIa, confirmado) && params.confirmadoPorUserId) {
      valorFinal = confirmado;
      correcoes.push({
        anterior: valorIa,
        novo: confirmado,
        userId: params.confirmadoPorUserId,
        origem: 'solicitante',
        motivo: '',
        em: new Date(),
      });
    }
  }

  const daIa = params.decididoPor === 'ia';
  const doc = {
    chamadoId: new Types.ObjectId(params.chamadoId),
    conversaId: params.conversaId ? new Types.ObjectId(params.conversaId) : null,
    campo: params.campo,
    decididoPor: params.decididoPor,
    efeito: params.efeito,
    valorIa,
    valorFinal,
    confianca: daIa ? (params.confianca ?? null) : null,
    motivo: motivo.data,
    modelo: daIa ? (params.meta?.model ?? null) : null,
    promptVersion: daIa ? (params.meta?.promptVersion ?? null) : null,
    task: daIa ? (params.meta?.task ?? null) : null,
    llmCallId: daIa && params.meta?.callId ? new Types.ObjectId(params.meta.callId) : null,
    correcoes,
    revisadaEm: null,
    revisadaPorUserId: null,
    situacao: derivarSituacao(valorIa, valorFinal, null),
  };

  try {
    const criada = await DecisaoIaModel.create(doc);
    return { id: String(criada._id), criada: true, valorFinal };
  } catch (err) {
    if (!erroChaveDuplicada(err)) throw err;
    // O índice único `{ chamadoId, campo }` já guardava esta decisão.
    const existente = await DecisaoIaModel.findOne({
      chamadoId: params.chamadoId,
      campo: params.campo,
    })
      .select('_id valorFinal')
      .lean();
    if (!existente) return null;
    return {
      id: String(existente._id),
      criada: false,
      valorFinal: existente.valorFinal as unknown as ValorDecisao,
    };
  }
}

/**
 * Registra uma decisão da IA sobre um campo do chamado (AC-6).
 * Só código de servidor chama isto.
 */
export async function registrarDecisao(
  params: GravarDecisaoParams,
): Promise<Resultado<{ decisaoId: string }>> {
  try {
    await dbConnect();
    const gravada = await gravarDecisao(params);
    if (!gravada) return falha('invalida');
    if (!gravada.criada) return falha('ja_existe');
    return { ok: true, decisaoId: gravada.id };
  } catch (err) {
    console.error(
      '[conversa]',
      JSON.stringify({
        operacao: 'registrarDecisao',
        chamadoId: params.chamadoId,
        campo: params.campo,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return falha('erro');
  }
}

function paraDecisaoLida(doc: Record<string, unknown>): DecisaoLida {
  const correcoes = (doc.correcoes as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: String(doc._id),
    campo: doc.campo as DecisaoCampo,
    decididoPor: doc.decididoPor as DecisaoLida['decididoPor'],
    efeito: doc.efeito as DecisaoLida['efeito'],
    valorIa: doc.valorIa as ValorDecisao,
    valorFinal: doc.valorFinal as ValorDecisao,
    confianca: (doc.confianca as number | null) ?? null,
    motivo: String(doc.motivo ?? ''),
    modelo: (doc.modelo as string | null) ?? null,
    promptVersion: (doc.promptVersion as string | null) ?? null,
    task: (doc.task as string | null) ?? null,
    llmCallId: doc.llmCallId ? String(doc.llmCallId) : null,
    correcoes: correcoes.map((c) => ({
      anterior: c.anterior as ValorDecisao,
      novo: c.novo as ValorDecisao,
      userId: String(c.userId),
      origem: c.origem as CorrecaoLida['origem'],
      motivo: String(c.motivo ?? ''),
      em: c.em as Date,
    })),
    revisadaEm: (doc.revisadaEm as Date | null) ?? null,
    revisadaPorUserId: doc.revisadaPorUserId ? String(doc.revisadaPorUserId) : null,
    situacao: doc.situacao as DecisaoSituacao,
    createdAt: doc.createdAt as Date,
  };
}

/** Confiança, motivo e correções são de Preposto e Admin, mais ninguém (AC-14). */
export async function lerDecisoes(
  viewer: Viewer,
  chamadoId: string,
): Promise<Resultado<{ decisoes: DecisaoLida[] }>> {
  if (viewer.role !== 'Preposto' && viewer.role !== 'Admin') return falha('sem_permissao');
  if (!objectIdSchema.safeParse(chamadoId).success) return falha('nao_encontrada');

  try {
    await dbConnect();
    const docs = await DecisaoIaModel.find({ chamadoId }).sort({ campo: 1 }).lean();
    return { ok: true, decisoes: docs.map((d) => paraDecisaoLida(d as Record<string, unknown>)) };
  } catch (err) {
    console.error(
      '[conversa]',
      JSON.stringify({
        operacao: 'lerDecisoes',
        chamadoId,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return falha('erro');
  }
}

export { paraDecisaoLida };

/**
 * Texto do histórico. Traz o campo e o rótulo, nunca a confiança nem o motivo:
 * o detalhe da decisão é de Preposto e Admin, o fato é de todos (AC-11).
 */
export function textoDecisao(campo: DecisaoCampo, rotulo: string): string {
  return `${DECISAO_CAMPO_LABELS[campo]}: ${rotulo}`;
}

export function textoCorrecao(campo: DecisaoCampo, anterior: string, novo: string): string {
  return `${DECISAO_CAMPO_LABELS[campo]}: ${anterior} → ${novo}`;
}

/**
 * O valor atual do chamado, no formato que `resolverValorNoBanco` espera
 * (spec 0009, AC-5). `null` quando o campo está vazio no chamado (sem
 * serviço, sem prioridade ou sem técnico): aí não há o que comparar.
 */
export function valorParaInput(
  campo: DecisaoCampo,
  chamado: {
    catalogServiceId?: unknown;
    subtypeId?: unknown;
    finalPriority?: string | null;
    assignedToUserId?: unknown;
    ativoId?: unknown;
  },
): ValorDecisaoInput | null {
  if (campo === 'servico') {
    if (!chamado.catalogServiceId || !chamado.subtypeId) return null;
    return {
      catalogServiceId: String(chamado.catalogServiceId),
      subtypeId: String(chamado.subtypeId),
    };
  }
  if (campo === 'prioridade') {
    const parsed = valorPrioridadeSchema.safeParse({ prioridade: chamado.finalPriority });
    return parsed.success ? parsed.data : null;
  }
  if (campo === 'ativo') {
    return { ativoId: chamado.ativoId ? String(chamado.ativoId) : null };
  }
  if (!chamado.assignedToUserId) return null;
  return { tecnicoId: String(chamado.assignedToUserId) };
}

export type ResolverDecisaoParams = {
  viewer: Viewer;
  chamadoId: string;
  campo: DecisaoCampo;
  valor: ValorDecisaoInput;
  origem: 'gestao' | 'solicitante';
  motivo?: string;
};

/**
 * O veredito da gestão sobre uma decisão da IA (AC-9).
 *
 * Valor igual ao que está valendo só marca a revisão; valor diferente acrescenta
 * uma correção e troca o `valorFinal`. A `situacao` sai sempre de
 * `derivarSituacao`, na mesma gravação que muda o que ela resume, então um
 * segundo gestor que volta ao valor da IA deixa a decisão `confirmada`.
 */
export async function resolverDecisao(
  params: ResolverDecisaoParams,
): Promise<Resultado<{ situacao: DecisaoSituacao; houveCorrecao: boolean }>> {
  if (params.viewer.role !== 'Preposto' && params.viewer.role !== 'Admin') {
    return falha('sem_permissao');
  }

  try {
    await dbConnect();

    const decisao = await DecisaoIaModel.findOne({
      chamadoId: params.chamadoId,
      campo: params.campo,
    }).lean();
    if (!decisao) return falha('nao_encontrada');

    const novo = await resolverValorNoBanco(params.campo, params.valor);
    if (!novo) return falha('invalida');

    const valorIa = decisao.valorIa as unknown as ValorDecisao;
    const valorAtual = decisao.valorFinal as unknown as ValorDecisao;
    const agora = new Date();
    const houveCorrecao = !mesmoValor(valorAtual, novo);
    const situacao = derivarSituacao(valorIa, houveCorrecao ? novo : valorAtual, agora);

    const mudanca: Record<string, unknown> = {
      $set: {
        revisadaEm: agora,
        revisadaPorUserId: new Types.ObjectId(params.viewer.userId),
        situacao,
        ...(houveCorrecao ? { valorFinal: novo } : {}),
      },
    };
    if (houveCorrecao) {
      mudanca.$push = {
        correcoes: {
          $each: [
            {
              anterior: valorAtual,
              novo,
              userId: new Types.ObjectId(params.viewer.userId),
              origem: params.origem,
              motivo: (params.motivo ?? '').slice(0, DECISAO_CORRECAO_MOTIVO_MAX),
              em: agora,
            },
          ],
          $slice: -DECISAO_CORRECOES_MAX,
        },
      };
    }

    await DecisaoIaModel.updateOne({ _id: decisao._id }, mudanca);
    await ChamadoModel.updateOne({ _id: params.chamadoId }, { $set: { iaSituacao: 'revisada' } });

    if (houveCorrecao) {
      await ChamadoHistoryModel.create({
        chamadoId: new Types.ObjectId(params.chamadoId),
        userId: new Types.ObjectId(params.viewer.userId),
        actorType: 'usuario',
        action: 'correcao_ia',
        decisaoIaId: decisao._id,
        observacoes: textoCorrecao(params.campo, valorAtual.rotulo, novo.rotulo),
      });
    }

    return { ok: true, situacao, houveCorrecao };
  } catch (err) {
    console.error(
      '[conversa]',
      JSON.stringify({
        operacao: 'resolverDecisao',
        chamadoId: params.chamadoId,
        campo: params.campo,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return falha('erro');
  }
}

/**
 * A gestão vinculou, trocou ou tirou o equipamento de um chamado que tem
 * decisão `ativo` (spec 0014, AC-12). Um `updateOne` direto, sem passar por
 * `resolverDecisao`: não muda `iaSituacao` nem grava `correcao_ia`, porque o
 * `vinculo_ativo` já é o registro da troca. Chamado sem a decisão sai em
 * silêncio. Nunca lança: falha aqui não desfaz o vínculo, só loga.
 */
export async function corrigirDecisaoDoAtivo(params: {
  chamadoId: string;
  ativoId: string | null;
  codigo: string | null;
  userId: string;
}): Promise<void> {
  try {
    const decisao = await DecisaoIaModel.findOne({ chamadoId: params.chamadoId, campo: 'ativo' })
      .select('_id valorIa valorFinal')
      .lean();
    if (!decisao) return;

    const novo: ValorDecisao = {
      ...VALOR_VAZIO,
      ativoId: params.ativoId,
      rotulo:
        params.ativoId && params.codigo
          ? params.codigo.slice(0, DECISAO_ROTULO_MAX)
          : ROTULO_SEM_ATIVO,
    };
    const valorIa = decisao.valorIa as unknown as ValorDecisao;
    const valorAtual = decisao.valorFinal as unknown as ValorDecisao;
    if (mesmoValor(valorAtual, novo)) return;

    await DecisaoIaModel.updateOne(
      { _id: decisao._id },
      {
        $set: {
          valorFinal: novo,
          situacao: mesmoValor(valorIa, novo) ? 'sem_revisao' : 'corrigida',
        },
        $push: {
          correcoes: {
            $each: [
              {
                anterior: valorAtual,
                novo,
                userId: new Types.ObjectId(params.userId),
                origem: 'gestao',
                motivo: '',
                em: new Date(),
              },
            ],
            $slice: -DECISAO_CORRECOES_MAX,
          },
        },
      },
    );
  } catch (err) {
    console.error(
      '[conversa]',
      JSON.stringify({
        operacao: 'corrigirDecisaoDoAtivo',
        chamadoId: params.chamadoId,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
  }
}

export type ConfirmarDecisaoParams = {
  viewer: Viewer;
  chamadoId: string;
  campo: DecisaoCampo;
};

/**
 * O Preposto (ou Admin) confirma que a decisão da IA continua valendo, sem
 * corrigir nada (spec 0009, AC-5). Só confirma decisão `efeito: 'aplicado'`
 * e `situacao: 'sem_revisao'`, e só se o valor final da decisão ainda for o
 * valor atual do chamado; caso contrário recusa (`divergente`) em vez de
 * confirmar um estado que já mudou.
 *
 * A gravação é um único `updateOne` condicional nas mesmas duas condições:
 * confirmar duas vezes, ou em duas abas, não bate na segunda vez (não casa o
 * filtro) e não duplica a entrada `confirmacao_ia`.
 */
export async function confirmarDecisao(
  params: ConfirmarDecisaoParams,
): Promise<Resultado<{ situacao: DecisaoSituacao }>> {
  if (params.viewer.role !== 'Preposto' && params.viewer.role !== 'Admin') {
    return falha('sem_permissao');
  }
  if (!objectIdSchema.safeParse(params.chamadoId).success) return falha('nao_encontrada');

  try {
    await dbConnect();

    const decisao = await DecisaoIaModel.findOne({
      chamadoId: params.chamadoId,
      campo: params.campo,
    }).lean();
    if (!decisao) return falha('nao_encontrada');
    if (decisao.efeito !== 'aplicado' || decisao.situacao !== 'sem_revisao') {
      return falha('nada_a_confirmar');
    }

    const chamado = await ChamadoModel.findById(params.chamadoId)
      .select('catalogServiceId subtypeId finalPriority assignedToUserId')
      .lean();
    if (!chamado) return falha('nao_encontrada');

    const entradaAtual = valorParaInput(params.campo, chamado);
    const valorAtual = entradaAtual ? await resolverValorNoBanco(params.campo, entradaAtual) : null;
    const valorFinal = decisao.valorFinal as unknown as ValorDecisao;
    if (!valorAtual || !mesmoValor(valorFinal, valorAtual)) {
      return falha('divergente');
    }

    const agora = new Date();
    const atualizado = await DecisaoIaModel.updateOne(
      { _id: decisao._id, situacao: 'sem_revisao', efeito: 'aplicado' },
      {
        $set: {
          situacao: 'confirmada',
          revisadaEm: agora,
          revisadaPorUserId: new Types.ObjectId(params.viewer.userId),
        },
      },
    );
    if (atualizado.modifiedCount !== 1) return falha('nada_a_confirmar');

    await ChamadoHistoryModel.create({
      chamadoId: new Types.ObjectId(params.chamadoId),
      userId: new Types.ObjectId(params.viewer.userId),
      actorType: 'usuario',
      action: 'confirmacao_ia',
      decisaoIaId: decisao._id,
      observacoes: textoDecisao(params.campo, valorFinal.rotulo),
    });

    return { ok: true, situacao: 'confirmada' };
  } catch (err) {
    console.error(
      '[conversa]',
      JSON.stringify({
        operacao: 'confirmarDecisao',
        chamadoId: params.chamadoId,
        campo: params.campo,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return falha('erro');
  }
}

/**
 * Os campos do chamado com decisão pendente de confirmação (`efeito:
 * 'aplicado'` e `situacao: 'sem_revisao'`), dentre os campos pedidos — ou
 * todos os três da IA quando nenhum é pedido (spec 0009, AC-5). A decisão
 * `ativo` nunca é pendência (spec 0014, AC-11).
 */
export async function camposPendentesDeConfirmacao(
  chamadoId: string,
  campos?: DecisaoCampo[],
): Promise<DecisaoCampo[]> {
  if (!objectIdSchema.safeParse(chamadoId).success) return [];
  await dbConnect();
  const pedidos = campos && campos.length > 0 ? campos : [...DECISAO_CAMPOS_DA_IA];
  const alvo = pedidos.filter((c) => c !== 'ativo');
  if (alvo.length === 0) return [];
  const docs = await DecisaoIaModel.find({
    chamadoId,
    campo: { $in: alvo },
    efeito: 'aplicado',
    situacao: 'sem_revisao',
  })
    .select('campo')
    .lean();
  return docs.map((d) => d.campo as DecisaoCampo);
}

/**
 * Campos cuja decisão nenhuma tela mostra nesta fatia (spec 0004, AC-15). A
 * prioridade sugerida é gravada para medir o acerto às cegas: nem o histórico
 * `decisao_ia` nem a `correcao_ia` que revelaria o valor dela aparecem.
 */
export const CAMPOS_OCULTOS: readonly DecisaoCampo[] = ['prioridade'];

/**
 * Os ids das decisões deste chamado que as telas escondem. Quem lê o
 * histórico tira dele toda entrada ligada a uma destas decisões.
 *
 * Só esconde enquanto a decisão ainda é sugestão (spec 0007, AC-6): uma
 * decisão de prioridade com `efeito: 'aplicado'` já valeu sem triagem, deixou
 * de ser sugestão, e passa a aparecer como qualquer outra decisão do chamado.
 */
export async function decisoesOcultas(chamadoId: string): Promise<Set<string>> {
  if (!objectIdSchema.safeParse(chamadoId).success) return new Set();
  const docs = await DecisaoIaModel.find({
    chamadoId,
    campo: { $in: CAMPOS_OCULTOS },
    efeito: 'sugestao',
  })
    .select('_id')
    .lean();
  return new Set(docs.map((doc) => String(doc._id)));
}

/**
 * Existe alguma decisão para este chamado? Os ganchos da gestão conferem isso
 * antes de qualquer coisa: a maioria dos chamados vem do formulário, não tem
 * decisão nenhuma, e neles o gancho sai em silêncio (AC-9, AC-10).
 *
 * A decisão `ativo` não conta: ela fica fora da IA (spec 0014, AC-11), e o
 * chamado que só tem ela sai em silêncio como um do formulário.
 */
export async function temDecisoes(chamadoId: string): Promise<boolean> {
  return Boolean(await DecisaoIaModel.exists({ chamadoId, campo: { $ne: 'ativo' } }));
}

/**
 * Gancho da gestão (AC-9, AC-10). Roda depois da gravação de negócio e nunca
 * pode quebrá-la: classificar, atribuir e reatribuir continuam devolvendo
 * `{ ok: true }` mesmo se o veredito falhar. Chamado sem decisão sai em
 * silêncio, sem nenhuma linha de log, que é o caso da maioria deles.
 */
export async function aplicarVeredito(params: {
  viewer: Viewer;
  chamadoId: string;
  vereditos: { campo: DecisaoCampo; valor: ValorDecisaoInput }[];
  motivo?: string;
}): Promise<void> {
  try {
    if (!(await temDecisoes(params.chamadoId))) return;

    for (const veredito of params.vereditos) {
      const resultado = await resolverDecisao({
        viewer: params.viewer,
        chamadoId: params.chamadoId,
        campo: veredito.campo,
        valor: veredito.valor,
        origem: 'gestao',
        motivo: params.motivo,
      });
      // Campo sem decisão é normal: o chamado pode ter só serviço, só técnico.
      if (!resultado.ok && resultado.reason !== 'nao_encontrada') {
        console.error(
          '[conversa]',
          JSON.stringify({
            operacao: 'aplicarVeredito',
            chamadoId: params.chamadoId,
            campo: veredito.campo,
            reason: resultado.reason,
          }),
        );
      }
    }
  } catch (err) {
    console.error(
      '[conversa]',
      JSON.stringify({
        operacao: 'aplicarVeredito',
        chamadoId: params.chamadoId,
        campo: params.vereditos.map((v) => v.campo).join(','),
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
  }
}

/**
 * Grava a entrada de histórico da decisão, conferindo antes se já existe.
 * A conferência por chamado, ação e `decisaoIaId` é o que deixa a abertura
 * rodar de novo sem duplicar linha.
 */
export async function garantirHistoricoDecisao(params: {
  chamadoId: string;
  decisaoIaId: string;
  campo: DecisaoCampo;
  rotulo: string;
  decididoPor: 'ia' | 'regra';
}): Promise<void> {
  // A decisão `ativo` não vira entrada `decisao_ia`: a observação da
  // `abertura` já diz o equipamento (spec 0014, AC-8 e AC-11).
  if (params.campo === 'ativo') return;

  const existe = await ChamadoHistoryModel.exists({
    chamadoId: params.chamadoId,
    action: 'decisao_ia',
    decisaoIaId: params.decisaoIaId,
  });
  if (existe) return;

  await ChamadoHistoryModel.create({
    chamadoId: new Types.ObjectId(params.chamadoId),
    userId: null,
    actorType: params.decididoPor === 'ia' ? 'ia' : 'sistema',
    action: 'decisao_ia',
    decisaoIaId: new Types.ObjectId(params.decisaoIaId),
    observacoes: textoDecisao(params.campo, params.rotulo),
  });
}
