import 'server-only';

import type { LlmFailure } from '@/lib/llm';

/**
 * Textos fixos do Sigma para a mensagem de reserva (spec 0003, AC-7). Toda
 * falha da IA vira uma destas frases, gravada como mensagem de autor `sistema`.
 * Nunca é texto do modelo: o modelo falhou, é exatamente por isso que estamos aqui.
 *
 * Toda frase diz três coisas, na mesma ordem: o relato está salvo, dá para
 * continuar escrevendo, e o formulário abre o chamado do mesmo jeito.
 */

type MotivoReserva = LlmFailure['reason'];

const PADRAO =
  'O assistente não conseguiu responder agora. O seu relato está salvo e você pode continuar escrevendo. Se preferir não esperar, abra o chamado pelo formulário: um atendente faz a triagem do mesmo jeito.';

const MENSAGENS: Record<MotivoReserva, string> = {
  disabled:
    'O assistente está desligado no momento. O seu relato está salvo e você pode continuar escrevendo. Para abrir o chamado agora, use o formulário: um atendente faz a triagem do mesmo jeito.',
  timeout:
    'O assistente demorou demais para responder. O seu relato está salvo e você pode continuar escrevendo. Se preferir não esperar, abra o chamado pelo formulário: um atendente faz a triagem do mesmo jeito.',
  unavailable: PADRAO,
  circuit_open:
    'O assistente está fora do ar e vai voltar em instantes. O seu relato está salvo e você pode continuar escrevendo. Se preferir não esperar, abra o chamado pelo formulário: um atendente faz a triagem do mesmo jeito.',
  busy: 'O assistente está atendendo muita gente agora. O seu relato está salvo e você pode tentar de novo em instantes. Se preferir não esperar, abra o chamado pelo formulário: um atendente faz a triagem do mesmo jeito.',
  rate_limited:
    'Você mandou várias mensagens seguidas e o assistente precisa de um minuto. O seu relato está salvo e você pode continuar escrevendo. Se preferir não esperar, abra o chamado pelo formulário: um atendente faz a triagem do mesmo jeito.',
  invalid_output:
    'O assistente respondeu de um jeito que o Sigma não entendeu, então a resposta foi descartada. O seu relato está salvo e você pode continuar escrevendo. Se preferir não esperar, abra o chamado pelo formulário: um atendente faz a triagem do mesmo jeito.',
  interrupted:
    'A resposta do assistente foi interrompida no meio. O seu relato está salvo e você pode continuar escrevendo. Se preferir não esperar, abra o chamado pelo formulário: um atendente faz a triagem do mesmo jeito.',
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
