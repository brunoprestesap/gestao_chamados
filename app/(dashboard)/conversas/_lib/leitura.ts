import 'server-only';

import { Types } from 'mongoose';

import { fraseDeChamadoAberto } from '@/lib/assistente/mensagens';
import { lerConversa, lerLinhaDoTempo, servicoSugeridoPelaIa, type Viewer } from '@/lib/conversas';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { UserModel } from '@/models/user.model';
import { CHAMADO_STATUS_LABELS, type ChamadoStatus } from '@/shared/chamados/chamado.constants';
import {
  CHAMADO_HISTORY_ACTION_LABELS,
  CHAMADO_HISTORY_ACTOR_LABELS,
  type ChamadoHistoryAction,
  type ChamadoHistoryActorType,
} from '@/shared/chamados/history.constants';
import type { ConversaFalha } from '@/shared/conversas/conversa.constants';
import { type CartaoPayload, cartaoPayloadSchema } from '@/shared/conversas/conversa.schemas';
import { marcaDeAbertura } from '@/shared/conversas/marca';

import type { ConversaNaTela, ItemLeitura, LeituraChamado, MensagemNaTela } from '../_types';

/**
 * Leitura de uma conversa aberta (spec 0003). Duas formas: o rascunho, que
 * ainda aceita mensagem, e o chamado em modo leitura, que junta mensagens,
 * comentários e histórico pela `lerLinhaDoTempo` e não tem caixa de envio.
 */

/** Quanto de uma observação de histórico cabe na linha do tempo. */
const OBSERVACAO_MAX = 160;

export type ConversaAberta =
  | { tipo: 'rascunho'; conversa: ConversaNaTela }
  | { tipo: 'chamado'; leitura: LeituraChamado }
  | { tipo: 'falha'; reason: ConversaFalha };

/**
 * O cartão como a tela o recebe: o payload passa de novo pelo schema, que é
 * estrito, então nada além do resumo atravessa para o navegador (spec 0004).
 */
function cartaoDaMensagem(tipo: string, payload: unknown): CartaoPayload | null {
  if (tipo !== 'cartao') return null;
  const lido = cartaoPayloadSchema.safeParse(payload);
  return lido.success ? lido.data : null;
}

/** Nomes de todos os `userId` da tela, em uma consulta só. */
async function resolverNomes(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id) => Types.ObjectId.isValid(id)))];
  if (unicos.length === 0) return new Map();

  const docs = await UserModel.find({ _id: { $in: unicos.map((id) => new Types.ObjectId(id)) } })
    .select('name username')
    .lean();

  return new Map(
    docs.map((doc) => [
      String(doc._id),
      (doc.name as string | undefined)?.trim() || (doc.username as string | undefined) || 'Usuário',
    ]),
  );
}

function frasedoHistorico(
  dados: {
    action: string;
    actorType: string;
    userId: string | null;
    observacoes: string;
  },
  nomes: Map<string, string>,
): string {
  const base =
    CHAMADO_HISTORY_ACTION_LABELS[dados.action as ChamadoHistoryAction] ?? 'Atualização do chamado';

  const quem =
    (dados.userId ? nomes.get(dados.userId) : null) ??
    CHAMADO_HISTORY_ACTOR_LABELS[dados.actorType as ChamadoHistoryActorType] ??
    null;

  const observacao = dados.observacoes.trim();
  const detalhe =
    observacao.length > OBSERVACAO_MAX ? `${observacao.slice(0, OBSERVACAO_MAX)}…` : observacao;

  return [quem ? `${base} por ${quem}` : base, detalhe].filter(Boolean).join(' · ');
}

/** O chamado em modo leitura: cabeçalho, linha do tempo e nada de caixa de envio. */
export async function lerChamadoEmLeitura(
  viewer: Viewer,
  chamadoId: string,
): Promise<{ ok: true; leitura: LeituraChamado } | { ok: false; reason: ConversaFalha }> {
  if (!Types.ObjectId.isValid(chamadoId)) return { ok: false, reason: 'nao_encontrada' };

  const linha = await lerLinhaDoTempo(viewer, chamadoId);
  if (!linha.ok) return { ok: false, reason: linha.reason };

  const chamado = await ChamadoModel.findById(chamadoId)
    .select('ticket_number titulo status createdAt canalAbertura')
    .lean();
  if (!chamado) return { ok: false, reason: 'nao_encontrada' };

  // A marca da IA (spec 0004, AC-15): só chamado do chat pode ter decisão.
  const doChat = chamado.canalAbertura === 'chat';
  const servicoSugerido = doChat
    ? (await servicoSugeridoPelaIa([chamadoId])).has(chamadoId)
    : false;

  const ids = linha.itens.flatMap((item) => {
    if (item.fonte === 'comentario') return [item.dados.userId];
    if (item.fonte === 'historico') return item.dados.userId ? [item.dados.userId] : [];
    return [];
  });
  const nomes = await resolverNomes(ids);

  // A última mensagem do rascunho é o aviso de chamado aberto (spec 0004). Ela
  // é do Sigma, com texto fixo: comparar com a frase é exato, não adivinhação.
  const avisoDeAbertura = chamado.ticket_number
    ? fraseDeChamadoAberto(String(chamado.ticket_number))
    : null;

  const itens: ItemLeitura[] = linha.itens.map((item) => {
    if (item.fonte === 'mensagem') {
      return {
        fonte: 'mensagem',
        id: item.id,
        em: item.em.toISOString(),
        autor: item.dados.autor,
        tipo: item.dados.tipo,
        texto: item.dados.texto,
        chamadoAberto: item.dados.autor === 'sistema' && item.dados.texto === avisoDeAbertura,
      };
    }
    if (item.fonte === 'comentario') {
      return {
        fonte: 'comentario',
        id: item.id,
        em: item.em.toISOString(),
        autorNome: nomes.get(item.dados.userId) ?? 'Usuário',
        interno: item.dados.visibility !== 'publico',
        texto: item.dados.content,
      };
    }
    return {
      fonte: 'historico',
      id: item.id,
      em: item.em.toISOString(),
      texto: frasedoHistorico(item.dados, nomes),
    };
  });

  return {
    ok: true,
    leitura: {
      chamadoId,
      ticketNumber: (chamado.ticket_number as string | undefined) ?? '',
      titulo: (chamado.titulo as string | undefined)?.trim() || 'Chamado sem título',
      situacao: CHAMADO_STATUS_LABELS[chamado.status as ChamadoStatus] ?? 'Aberto',
      abertoEm: ((chamado.createdAt as Date | undefined) ?? new Date()).toISOString(),
      marca: marcaDeAbertura(chamado.canalAbertura, servicoSugerido),
      itens,
      truncado: linha.truncado,
    },
  };
}

/**
 * Resolve `/conversas/[id]` na ordem que a spec fixou: conversa primeiro e, só
 * com `nao_encontrada`, chamado. Conversa já ligada a chamado cai no modo
 * leitura do chamado, que é o que a pessoa espera ver (AC-10).
 */
export async function abrirConversa(viewer: Viewer, id: string): Promise<ConversaAberta> {
  await dbConnect();

  const lida = await lerConversa(viewer, id);

  if (lida.ok) {
    if (lida.conversa.chamadoId) {
      const leitura = await lerChamadoEmLeitura(viewer, lida.conversa.chamadoId);
      return leitura.ok
        ? { tipo: 'chamado', leitura: leitura.leitura }
        : { tipo: 'falha', reason: leitura.reason };
    }

    return {
      tipo: 'rascunho',
      conversa: {
        id: lida.conversa.id,
        situacao: lida.conversa.situacao,
        previa: lida.conversa.previa,
        mensagensCount: lida.conversa.mensagensCount,
        mensagens: lida.mensagens.flatMap((mensagem): MensagemNaTela[] => {
          const cartao = cartaoDaMensagem(mensagem.tipo, mensagem.payload);
          // Cartão com payload fora do schema não tem o que mostrar.
          if (mensagem.tipo === 'cartao' && !cartao) return [];
          return [
            {
              id: mensagem.id,
              autor: mensagem.autor,
              tipo: mensagem.tipo,
              texto: mensagem.texto,
              em: mensagem.createdAt.toISOString(),
              cartao,
            },
          ];
        }),
        cartaoAtualId: lida.conversa.cartaoAtualId,
      },
    };
  }

  // Só `nao_encontrada` vira tentativa como chamado. `sem_permissao` para aqui,
  // com a mesma resposta de inexistente: nada revela conversa de outra pessoa.
  if (lida.reason !== 'nao_encontrada') return { tipo: 'falha', reason: lida.reason };

  const leitura = await lerChamadoEmLeitura(viewer, id);
  return leitura.ok
    ? { tipo: 'chamado', leitura: leitura.leitura }
    : { tipo: 'falha', reason: leitura.reason };
}
