import 'server-only';

import type { LlmFailure } from '@/lib/llm';
import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

/**
 * Textos fixos do Sigma na conversa (specs 0003 e 0004). Nunca é texto do
 * modelo: a reserva existe exatamente porque o modelo falhou, e o cartão e o
 * aviso de chamado aberto são montados com rótulos lidos do banco.
 *
 * Toda frase de reserva diz três coisas, na mesma ordem: o relato está salvo,
 * o resumo desta conversa abre o chamado mesmo assim, e o formulário continua
 * como alternativa (AC-8).
 */

type MotivoReserva = LlmFailure['reason'];

const MESMO_ASSIM =
  'O seu relato está salvo, e o resumo do chamado nesta conversa abre o pedido mesmo assim: confira o tipo, a unidade e o local e confirme. Se preferir, use o formulário.';

const PADRAO = `O assistente não conseguiu responder agora. ${MESMO_ASSIM}`;

const MENSAGENS: Record<MotivoReserva, string> = {
  disabled: `O assistente está desligado no momento. ${MESMO_ASSIM}`,
  timeout: `O assistente demorou demais para responder. ${MESMO_ASSIM}`,
  unavailable: PADRAO,
  circuit_open: `O assistente está fora do ar e deve voltar em instantes. ${MESMO_ASSIM}`,
  busy: `O assistente está atendendo muita gente agora. ${MESMO_ASSIM}`,
  rate_limited: `Você mandou várias mensagens seguidas e o assistente precisa de um minuto. ${MESMO_ASSIM}`,
  invalid_output: `O assistente respondeu de um jeito que o Sigma não entendeu, então a resposta foi descartada. ${MESMO_ASSIM}`,
  interrupted: `A resposta do assistente foi interrompida no meio. ${MESMO_ASSIM}`,
  auth_error: PADRAO,
  bad_request: PADRAO,
  cancelled: PADRAO,
};

/** A frase do Sigma para este motivo. Motivo desconhecido cai no texto padrão. */
export function mensagemDeReserva(motivo: MotivoReserva): string {
  return MENSAGENS[motivo] ?? PADRAO;
}

/** Para onde o link do formulário aponta, na mensagem de reserva e na tela. */
export const FORMULARIO_HREF = '/meus-chamados';

/**
 * O texto da mensagem do cartão (AC-5). É o que o leitor de tela lê quando a
 * conversa é relida, e o que o modo leitura mostra depois que o chamado nasce.
 * Só usa rótulos do payload, que vieram do banco.
 */
export function fraseDoCartao(cartao: CartaoPayload): string {
  const servico = cartao.servico
    ? `serviço ${cartao.servico.rotuloServico}${
        cartao.servico.rotuloSubtipo ? `, de ${cartao.servico.rotuloSubtipo}` : ''
      }`
    : 'tipo de serviço a escolher';
  const unidade = cartao.unidade
    ? `unidade ${[cartao.unidade.rotulo, cartao.unidade.andar].filter(Boolean).join(', ')}`
    : 'unidade a escolher';
  const local = cartao.localExato ? `local ${cartao.localExato}` : 'local a informar';

  const abertura =
    cartao.faltando.length > 0
      ? 'Resumo do chamado para você completar e confirmar'
      : 'Resumo do chamado para você conferir e confirmar';

  return `${abertura}: ${servico}; ${unidade}; ${local}. O texto desta conversa vira a descrição do chamado.`;
}

/** A última mensagem do rascunho, gravada quando o chamado nasce (AC-11). */
export function fraseDeChamadoAberto(ticketNumber: string): string {
  return `Chamado #${ticketNumber} aberto. Um Preposto vai analisar o seu pedido e encaminhar a um técnico, e você acompanha tudo por aqui.`;
}

/**
 * O AC-14 proíbe o modelo de dizer que o chamado já foi aberto, criado ou tem
 * número: até a pessoa confirmar o cartão, nenhum Chamado existe de verdade.
 * O prompt já traz essa instrução, mas nada impede o modelo de ignorá-la, e
 * `respostaSemAfirmarAbertura` é a segunda trava, que não depende dele obedecer.
 */
const PADROES_CHAMADO_JA_ABERTO: RegExp[] = [
  /chamado\s+(j[áa]\s+)?(foi|est[áa]|ficou)\s+abert[oa]/i,
  /chamado\s+(foi\s+)?(criado|registrado|confirmado)\b/i,
  /abrimos?\s+(o\s+)?(seu\s+)?chamado/i,
  /n[uú]mero\s+(do\s+)?chamado/i,
  /protocolo\s+(do\s+)?chamado/i,
  /\bCHM-\d{4}-\d+\b/,
];

/** true quando o texto afirma algo que só passa a ser verdade na confirmação. */
export function afirmaChamadoJaAberto(texto: string): boolean {
  return PADROES_CHAMADO_JA_ABERTO.some((padrao) => padrao.test(texto));
}

const RESPOSTA_SEM_CHAMADO_AINDA =
  'Entendi. Nenhum chamado foi aberto ainda: confira o resumo abaixo (ou complete o que estiver faltando) e toque em "Confirmar e abrir chamado" quando estiver certo.';

/**
 * A `resposta` do modelo, trocada pela frase fixa do Sigma quando ela afirma
 * que o chamado já existe. A extração (serviço, local, `completo`) não muda:
 * só o texto mostrado à pessoa é substituído.
 */
export function respostaSemAfirmarAbertura(resposta: string): string {
  return afirmaChamadoJaAberto(resposta) ? RESPOSTA_SEM_CHAMADO_AINDA : resposta;
}
