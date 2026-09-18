import 'server-only';

import { enviarMensagem, lerConversa, type Viewer } from '@/lib/conversas';
import { type LlmFailure, type LlmMessage, streamLlmObject } from '@/lib/llm';
import type { ConversaFalha } from '@/shared/conversas/conversa.constants';
import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

import { mensagemDeReserva } from './mensagens';
import {
  ASSISTENTE_HISTORICO_MAX,
  ASSISTENTE_MAX_OUTPUT_TOKENS,
  ASSISTENTE_SYSTEM,
  ASSISTENTE_TASK,
  PROMPT_VERSION,
} from './prompt';
import { respostaAssistenteSchema } from './schema';

/**
 * Grava a mensagem do solicitante e transmite a resposta do assistente em
 * quadros (spec 0003, AC-5). Este módulo sempre recebe conversa que já existe:
 * ele nunca cria nem descarta rascunho, isso é da rota sem `id` (AC-3).
 *
 * Nada aqui lança exceção. Falha da IA vira mensagem de autor `sistema` e o
 * quadro `reserva`; resposta boa que não pôde ser gravada vira `fim` com
 * `mensagemId: null` (AC-5b, AC-7).
 */

export type RespostaIniciada =
  | { ok: false; reason: ConversaFalha }
  | {
      ok: true;
      conversaId: string;
      mensagemId: string;
      quadros: AsyncGenerator<QuadroResposta>;
    };

type Params = {
  viewer: Viewer;
  conversaId: string;
  texto: string;
  /** Vem de `request.signal`: aba fechada ou conexão caída libera a vaga na GPU. */
  signal?: AbortSignal;
};

function registrar(evento: string, dados: Record<string, unknown>): void {
  // Nenhum texto de conversa entra em log: só identificador, motivo e duração.
  console.warn(`[assistente] ${evento}`, JSON.stringify(dados));
}

/**
 * Histórico enviado ao modelo: as últimas mensagens da conversa, com
 * `solicitante` virando `user` e `ia` virando `assistant`. Mensagem de
 * `sistema` fica de fora, porque é aviso do Sigma, não parte do diálogo.
 */
function montarHistorico(
  anteriores: { autor: string; texto: string }[],
  textoNovo: string,
): LlmMessage[] {
  const dialogo = anteriores
    .filter((m) => m.autor === 'solicitante' || m.autor === 'ia')
    .map(
      (m): LlmMessage => ({
        role: m.autor === 'solicitante' ? 'user' : 'assistant',
        content: m.texto,
      }),
    );

  dialogo.push({ role: 'user', content: textoNovo });
  return dialogo.slice(-ASSISTENTE_HISTORICO_MAX);
}

export async function responderNaConversa(params: Params): Promise<RespostaIniciada> {
  const { viewer, conversaId, texto, signal } = params;

  // Uma leitura só resolve três coisas: se a conversa existe, se é do viewer e
  // qual é o histórico. Conferir o dono antes do modelo é o que impede um
  // pedido de terceiro de consumir vaga na GPU compartilhada.
  const lida = await lerConversa(viewer, conversaId);
  if (!lida.ok) return { ok: false, reason: lida.reason };

  // Conversa já ligada a chamado abre em modo leitura, sem caixa de envio
  // (AC-10). Chegar aqui significa pedido fora da tela: some do mesmo jeito que
  // uma conversa inexistente, sem gastar chamada ao modelo.
  if (lida.conversa.situacao !== 'rascunho') {
    return { ok: false, reason: 'nao_encontrada' };
  }

  const gravada = await enviarMensagem({
    viewer,
    conversaId,
    autor: 'solicitante',
    tipo: 'texto',
    texto,
  });
  if (!gravada.ok) return { ok: false, reason: gravada.reason };

  const historico = montarHistorico(lida.mensagens, texto);

  return {
    ok: true,
    conversaId,
    mensagemId: gravada.id,
    quadros: transmitir({ viewer, conversaId, mensagemId: gravada.id, historico, signal }),
  };
}

type TransmitirParams = {
  viewer: Viewer;
  conversaId: string;
  mensagemId: string;
  historico: LlmMessage[];
  signal?: AbortSignal;
};

async function* transmitir(params: TransmitirParams): AsyncGenerator<QuadroResposta> {
  const { viewer, conversaId, mensagemId, historico, signal } = params;
  const comecouEm = Date.now();

  yield { tipo: 'inicio', conversaId, mensagemId };

  const stream = await streamLlmObject({
    task: ASSISTENTE_TASK,
    promptVersion: PROMPT_VERSION,
    schema: respostaAssistenteSchema,
    system: ASSISTENTE_SYSTEM,
    messages: historico,
    lane: 'interactive',
    userId: viewer.userId,
    ref: { type: 'conversa', id: conversaId },
    signal,
    sampling: { maxOutputTokens: ASSISTENTE_MAX_OUTPUT_TOKENS },
  });

  // Falhou antes de qualquer conteúdo: vai direto para a reserva, sem parcial.
  if (!stream.ok) {
    yield* reserva({ viewer, conversaId, motivo: stream.reason, comecouEm });
    return;
  }

  try {
    for await (const parcial of stream.partial) {
      const texto = typeof parcial?.resposta === 'string' ? parcial.resposta : '';
      if (texto) yield { tipo: 'parcial', texto };
    }
  } catch (err) {
    // O parcial é só exibição; o veredito real é o `final` logo abaixo.
    registrar('parcial interrompido', { conversaId, erro: descrever(err) });
  }

  const final = await stream.final;

  // Resposta reprovada pelo schema, prazo estourado no meio, conexão perdida:
  // o texto parcial que a tela mostrou é trocado pela mensagem de reserva.
  if (!final.ok) {
    yield* reserva({ viewer, conversaId, motivo: final.reason, comecouEm });
    return;
  }

  const resposta = final.data.resposta;

  const guardada = await enviarMensagem({
    viewer,
    conversaId,
    autor: 'ia',
    tipo: 'texto',
    texto: resposta,
    llmCallId: final.meta.callId,
  });

  // Resposta boa que não pôde ser gravada: o rascunho foi descartado noutra aba
  // ou o teto de 30 foi atingido no meio. A tela mostra a resposta com o aviso
  // de que ela não fica salva, e nenhuma exceção sobe (AC-5b).
  if (!guardada.ok) {
    registrar('resposta nao gravada', {
      conversaId,
      motivo: guardada.reason,
      duracaoMs: Date.now() - comecouEm,
    });
    yield { tipo: 'fim', texto: resposta, mensagemId: null, motivo: guardada.reason };
    return;
  }

  yield { tipo: 'fim', texto: resposta, mensagemId: guardada.id, motivo: null };
}

type ReservaParams = {
  viewer: Viewer;
  conversaId: string;
  motivo: LlmFailure['reason'];
  comecouEm: number;
};

/**
 * A IA não respondeu: o Sigma fala no lugar dela, com texto próprio, gravado
 * como mensagem de autor `sistema` para continuar lá no recarregamento (AC-7).
 */
async function* reserva(params: ReservaParams): AsyncGenerator<QuadroResposta> {
  const { viewer, conversaId, motivo, comecouEm } = params;

  registrar('reserva', { conversaId, motivo, duracaoMs: Date.now() - comecouEm });

  // Quem desistiu foi a pessoa (aba fechada, conexão caída): não há a quem
  // avisar, e uma mensagem de sistema só sujaria a conversa no recarregamento.
  if (motivo === 'cancelled') return;

  const texto = mensagemDeReserva(motivo);

  const guardada = await enviarMensagem({
    viewer,
    conversaId,
    autor: 'sistema',
    tipo: 'texto',
    texto,
  });

  if (!guardada.ok) {
    registrar('reserva nao gravada', { conversaId, motivo: guardada.reason });
  }

  yield {
    tipo: 'reserva',
    texto,
    mensagemId: guardada.ok ? guardada.id : null,
    motivo,
  };
}

function descrever(err: unknown): string {
  return err instanceof Error ? err.name : 'erro';
}
