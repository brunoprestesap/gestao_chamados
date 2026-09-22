import 'server-only';

/**
 * Único ponto de entrada do assistente da conversa (specs 0003 e 0004). Quem
 * chama usa só o que sai daqui; os outros arquivos são internos.
 *
 * - `responderNaConversa`: a resposta em quadros, com a proposta e o cartão.
 * - `revisarAbertura`: o cartão do botão `Revisar e abrir`, sem chamar o modelo.
 * - `confirmarAbertura`: o chamado nasce a partir do cartão, sem chamar o modelo.
 */

export { revisarAbertura, type RevisarFalha, type RevisarResultado } from './cartao';
export {
  type ConfirmacaoFalha,
  type ConfirmacaoResultado,
  confirmarAbertura,
  montarTituloChat,
} from './confirmar';
export { FORMULARIO_HREF } from './mensagens';
export { ABERTURA_TASK, PROMPT_VERSION } from './prompt';
export { responderNaConversa, type RespostaIniciada } from './responder';
export { RESPOSTA_ASSISTENTE_MAX, type RespostaAbertura } from './schema';
