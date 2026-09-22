import 'server-only';

import { Types } from 'mongoose';

import { dbConnect } from '@/lib/db';
import { ConversaModel } from '@/models/Conversa';
import { ConversaMensagemModel } from '@/models/ConversaMensagem';
import { DecisaoIaModel } from '@/models/DecisaoIa';
import type { FinalPriority } from '@/shared/chamados/chamado.constants';
import type { TipoServico } from '@/shared/chamados/tipo-servico';
import type { ConversaAutor, ConversaSituacao } from '@/shared/conversas/conversa.constants';
import {
  type CartaoPayload,
  cartaoPayloadSchema,
  conversaTextoSchema,
  objectIdSchema,
} from '@/shared/conversas/conversa.schemas';

import { buscarConversa, registrarErro, repararSePreciso, situacaoDe } from './conversa-store';
import type { Falha, Resultado, Viewer } from './types';

/**
 * A proposta da IA e o cartão resumo (spec 0004). Só este arquivo escreve
 * `Conversa.propostaIa` e mensagens de tipo `cartao`, e sempre numa gravação
 * condicional ao rascunho: conversa que já virou chamado (ou está virando)
 * nunca ganha proposta nem cartão novos (AC-12).
 *
 * Nada aqui sai para o navegador. Confiança, motivo e prioridade sugerida
 * ficam no servidor nesta fatia; quem monta a tela lê só o `cartaoAtualId`.
 */

const falha = (reason: Falha['reason']): Falha => ({ ok: false, reason });

export type PropostaServico = {
  catalogServiceId: string;
  subtypeId: string;
  tipoServico: TipoServico;
  confianca: number;
  motivo: string;
};

export type PropostaPrioridade = {
  prioridade: FinalPriority;
  confianca: number;
  motivo: string;
};

export type PropostaLida = {
  cartaoMensagemId: string | null;
  servico: PropostaServico | null;
  prioridade: PropostaPrioridade | null;
  localExato: string | null;
  localForaDoPerfil: boolean;
  completo: boolean;
  llmCallId: string | null;
  modelo: string | null;
  promptVersion: string | null;
  task: string | null;
  /** Nulo só na proposta que existe apenas para guardar um cartão manual. */
  origemMensagemId: string | null;
  atualizadaEm: Date | null;
};

/** O que uma resposta boa da IA grava. O `meta` vem da chamada que a produziu. */
export type PropostaEntrada = {
  servico: PropostaServico | null;
  prioridade: PropostaPrioridade | null;
  localExato: string | null;
  localForaDoPerfil: boolean;
  completo: boolean;
  llmCallId: string;
  modelo: string;
  promptVersion: string;
  task: string;
  origemMensagemId: string;
};

export type CartaoLido = {
  id: string;
  autor: ConversaAutor;
  payload: CartaoPayload;
};

/** Estado de partida quando a conversa ainda não tem proposta. */
const PROPOSTA_VAZIA = {
  cartaoMensagemId: null,
  servico: null,
  prioridade: null,
  localExato: null,
  localForaDoPerfil: false,
  completo: false,
  llmCallId: null,
  modelo: null,
  promptVersion: null,
  task: null,
  origemMensagemId: null,
  atualizadaEm: null,
};

/** Filtro de toda gravação: a conversa é do dono e ainda é rascunho. */
function filtroRascunho(viewer: Viewer, conversaId: string): Record<string, unknown> {
  return {
    _id: new Types.ObjectId(conversaId),
    solicitanteId: new Types.ObjectId(viewer.userId),
    chamadoId: null,
    vinculandoEm: null,
  };
}

const texto = (valor: unknown): string | null =>
  valor === null || valor === undefined ? null : String(valor);

function paraPropostaLida(bruta: Record<string, unknown> | null | undefined): PropostaLida | null {
  if (!bruta) return null;
  const servico = bruta.servico as Record<string, unknown> | null | undefined;
  const prioridade = bruta.prioridade as Record<string, unknown> | null | undefined;

  return {
    cartaoMensagemId: texto(bruta.cartaoMensagemId),
    servico: servico
      ? {
          catalogServiceId: String(servico.catalogServiceId),
          subtypeId: String(servico.subtypeId),
          tipoServico: servico.tipoServico as TipoServico,
          confianca: Number(servico.confianca ?? 0),
          motivo: String(servico.motivo ?? ''),
        }
      : null,
    prioridade: prioridade
      ? {
          prioridade: prioridade.prioridade as FinalPriority,
          confianca: Number(prioridade.confianca ?? 0),
          motivo: String(prioridade.motivo ?? ''),
        }
      : null,
    localExato: texto(bruta.localExato),
    localForaDoPerfil: Boolean(bruta.localForaDoPerfil),
    completo: Boolean(bruta.completo),
    llmCallId: texto(bruta.llmCallId),
    modelo: texto(bruta.modelo),
    promptVersion: texto(bruta.promptVersion),
    task: texto(bruta.task),
    origemMensagemId: texto(bruta.origemMensagemId),
    atualizadaEm: (bruta.atualizadaEm as Date | null | undefined) ?? null,
  };
}

/**
 * A mensagem do cartão, se ela existe nesta conversa e o payload ainda passa no
 * schema. Ponteiro sem mensagem conta como cartão que não vale (AC-12).
 */
async function lerCartao(conversaId: string, cartaoId: string | null): Promise<CartaoLido | null> {
  if (!cartaoId || !objectIdSchema.safeParse(cartaoId).success) return null;

  const doc = await ConversaMensagemModel.findOne({
    _id: new Types.ObjectId(cartaoId),
    conversaId: new Types.ObjectId(conversaId),
    tipo: 'cartao',
  })
    .select('autor payload')
    .lean();
  if (!doc) return null;

  const payload = cartaoPayloadSchema.safeParse(doc.payload);
  if (!payload.success) return null;

  return { id: cartaoId, autor: doc.autor as ConversaAutor, payload: payload.data };
}

/**
 * A proposta guardada e o cartão que vale, só para o dono. A conversa passa
 * pelo reparo antes, para uma confirmação que parou no meio não parecer
 * rascunho (spec 0002, AC-5).
 */
export async function lerProposta(
  viewer: Viewer,
  conversaId: string,
): Promise<
  Resultado<{
    situacao: ConversaSituacao;
    proposta: PropostaLida | null;
    cartaoAtual: CartaoLido | null;
  }>
> {
  try {
    await dbConnect();

    const encontrada = await buscarConversa(conversaId);
    if (!encontrada) return falha('nao_encontrada');
    if (String(encontrada.solicitanteId) !== viewer.userId) return falha('sem_permissao');

    const conversa = await repararSePreciso(encontrada);
    const proposta = paraPropostaLida(
      (conversa as unknown as { propostaIa?: Record<string, unknown> | null }).propostaIa,
    );

    return {
      ok: true,
      situacao: situacaoDe(conversa),
      proposta,
      cartaoAtual: await lerCartao(conversaId, proposta?.cartaoMensagemId ?? null),
    };
  } catch (err) {
    registrarErro('lerProposta', { conversaId }, err);
    return falha('erro');
  }
}

/**
 * Reescreve a proposta com uma resposta boa da IA (AC-3). A gravação só
 * acontece se a conversa ainda é rascunho e se esta resposta é de uma mensagem
 * mais nova que a da proposta guardada: o `ObjectId` gerado pela única
 * instância do Next cresce com o tempo. O ponteiro do cartão é preservado.
 *
 * `gravada: false` é a resposta atrasada de uma mensagem mais antiga (duas
 * abas); conversa que deixou de ser rascunho sai como `nao_encontrada`.
 */
export async function gravarProposta(
  viewer: Viewer,
  conversaId: string,
  proposta: PropostaEntrada,
): Promise<Resultado<{ gravada: boolean; origemGuardada: string | null }>> {
  if (
    !objectIdSchema.safeParse(conversaId).success ||
    !objectIdSchema.safeParse(proposta.origemMensagemId).success ||
    !objectIdSchema.safeParse(proposta.llmCallId).success
  ) {
    return falha('invalida');
  }

  const origem = new Types.ObjectId(proposta.origemMensagemId);
  const novos = {
    servico: proposta.servico
      ? {
          catalogServiceId: new Types.ObjectId(proposta.servico.catalogServiceId),
          subtypeId: new Types.ObjectId(proposta.servico.subtypeId),
          tipoServico: proposta.servico.tipoServico,
          confianca: proposta.servico.confianca,
          motivo: proposta.servico.motivo,
        }
      : null,
    prioridade: proposta.prioridade ? { ...proposta.prioridade } : null,
    localExato: proposta.localExato,
    localForaDoPerfil: proposta.localForaDoPerfil,
    completo: proposta.completo,
    llmCallId: new Types.ObjectId(proposta.llmCallId),
    modelo: proposta.modelo,
    promptVersion: proposta.promptVersion,
    task: proposta.task,
    origemMensagemId: origem,
    atualizadaEm: new Date(),
  };

  try {
    await dbConnect();

    const resultado = await ConversaModel.updateOne(
      {
        ...filtroRascunho(viewer, conversaId),
        $or: [
          { 'propostaIa.origemMensagemId': null },
          { 'propostaIa.origemMensagemId': { $lt: origem } },
        ],
      },
      [
        {
          $set: {
            // `$literal` porque o local vem do modelo: um texto começando com
            // `$` viraria caminho de campo dentro do pipeline.
            propostaIa: {
              $mergeObjects: [
                { $ifNull: ['$propostaIa', { $literal: PROPOSTA_VAZIA }] },
                { $literal: novos },
              ],
            },
          },
        },
      ],
      { updatePipeline: true },
    );

    if (resultado.matchedCount === 1) {
      return { ok: true, gravada: true, origemGuardada: proposta.origemMensagemId };
    }

    // Não gravou: ou a conversa não é mais rascunho do dono, ou a proposta
    // guardada já responde a uma mensagem mais nova.
    const atual = await buscarConversa(conversaId);
    if (!atual) return falha('nao_encontrada');
    if (String(atual.solicitanteId) !== viewer.userId) return falha('sem_permissao');
    if (situacaoDe(atual) !== 'rascunho') return falha('nao_encontrada');
    return {
      ok: true,
      gravada: false,
      origemGuardada: texto(atual.propostaIa?.origemMensagemId ?? null),
    };
  } catch (err) {
    registrarErro('gravarProposta', { conversaId }, err);
    return falha('erro');
  }
}

export type GravarCartaoParams = {
  viewer: Viewer;
  conversaId: string;
  /** `ia` no modo `ia`, `sistema` no `manual`. */
  autor: Extract<ConversaAutor, 'ia' | 'sistema'>;
  /** A frase do Sigma que o leitor de tela lê. */
  texto: string;
  payload: CartaoPayload;
  llmCallId?: string | null;
  /**
   * A mensagem do solicitante que a proposta do cartão responde. Quando vem, o
   * cartão só é gravado se a proposta guardada ainda for essa: uma resposta
   * mais nova que gravou proposta no meio tempo ganha a vez.
   */
  origemMensagemId?: string | null;
};

/**
 * Grava o cartão que passa a valer (AC-4, AC-12). O id é gerado antes: o
 * ponteiro vai primeiro, numa gravação condicional ao rascunho, e a mensagem
 * depois, com aquele `_id`. Se a mensagem não entrar, o ponteiro fica sem
 * mensagem e conta como cartão desatualizado.
 *
 * O cartão não conta no teto de mensagens e não muda `mensagensCount`,
 * `ultimaMensagemEm` nem `previa` (AC-13).
 */
export async function gravarCartao(
  params: GravarCartaoParams,
): Promise<Resultado<{ mensagemId: string; substituiId: string | null }>> {
  const textoOk = conversaTextoSchema.safeParse(params.texto);
  const payload = cartaoPayloadSchema.safeParse(params.payload);
  if (!textoOk.success || !payload.success) return falha('invalida');
  if (!objectIdSchema.safeParse(params.conversaId).success) return falha('nao_encontrada');
  if (params.llmCallId && !objectIdSchema.safeParse(params.llmCallId).success) {
    return falha('invalida');
  }
  if (params.origemMensagemId && !objectIdSchema.safeParse(params.origemMensagemId).success) {
    return falha('invalida');
  }

  const novoId = new Types.ObjectId();
  const filtro = filtroRascunho(params.viewer, params.conversaId);
  if (params.origemMensagemId) {
    filtro['propostaIa.origemMensagemId'] = new Types.ObjectId(params.origemMensagemId);
  }

  try {
    await dbConnect();

    const antes = await ConversaModel.findOneAndUpdate(
      filtro,
      [
        {
          $set: {
            propostaIa: {
              $mergeObjects: [
                { $ifNull: ['$propostaIa', { $literal: PROPOSTA_VAZIA }] },
                { cartaoMensagemId: novoId },
              ],
            },
          },
        },
      ],
      { returnDocument: 'before', updatePipeline: true },
    )
      .select('propostaIa.cartaoMensagemId expiresAt')
      .lean();

    if (!antes) return falha('nao_encontrada');

    const anterior = antes as unknown as {
      propostaIa?: { cartaoMensagemId?: Types.ObjectId | null } | null;
      expiresAt?: Date | null;
    };

    await ConversaMensagemModel.create({
      _id: novoId,
      conversaId: new Types.ObjectId(params.conversaId),
      autor: params.autor,
      userId: null,
      tipo: 'cartao',
      texto: textoOk.data,
      payload: payload.data,
      llmCallId: params.llmCallId ? new Types.ObjectId(params.llmCallId) : null,
      // Acompanha a conversa, que é rascunho: mesma data de expiração.
      expiresAt: anterior.expiresAt ?? null,
    });

    return {
      ok: true,
      mensagemId: String(novoId),
      substituiId: texto(anterior.propostaIa?.cartaoMensagemId),
    };
  } catch (err) {
    registrarErro('gravarCartao', { conversaId: params.conversaId }, err);
    return falha('erro');
  }
}

/**
 * O cartão deixa de valer (AC-4, AC-10). Só zera o ponteiro se ele ainda é
 * este cartão e a conversa ainda é rascunho; condição falsa não faz nada.
 */
export async function invalidarCartao(
  viewer: Viewer,
  conversaId: string,
  cartaoId: string,
): Promise<{ ok: true }> {
  if (
    !objectIdSchema.safeParse(conversaId).success ||
    !objectIdSchema.safeParse(cartaoId).success
  ) {
    return { ok: true };
  }

  try {
    await dbConnect();
    await ConversaModel.updateOne(
      {
        ...filtroRascunho(viewer, conversaId),
        'propostaIa.cartaoMensagemId': new Types.ObjectId(cartaoId),
      },
      { $set: { 'propostaIa.cartaoMensagemId': null } },
    );
  } catch (err) {
    registrarErro('invalidarCartao', { conversaId }, err);
  }
  return { ok: true };
}

/**
 * Quais destes chamados têm decisão de serviço da IA (AC-15). Uma consulta só
 * por tela, pelo índice único `{ chamadoId, campo }`.
 */
export async function servicoSugeridoPelaIa(chamadoIds: string[]): Promise<Set<string>> {
  const validos = [...new Set(chamadoIds)].filter((id) => objectIdSchema.safeParse(id).success);
  if (validos.length === 0) return new Set();

  try {
    await dbConnect();
    const docs = await DecisaoIaModel.find({
      chamadoId: { $in: validos.map((id) => new Types.ObjectId(id)) },
      campo: 'servico',
    })
      .select('chamadoId')
      .lean();
    return new Set(docs.map((doc) => String(doc.chamadoId)));
  } catch (err) {
    registrarErro('servicoSugeridoPelaIa', { quantos: String(validos.length) }, err);
    return new Set();
  }
}
