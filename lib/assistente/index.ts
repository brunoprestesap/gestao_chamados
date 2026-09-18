import 'server-only';

/**
 * Único ponto de entrada do assistente da conversa (spec 0003). Quem chama usa
 * só `responderNaConversa`; os outros arquivos são internos.
 *
 * O módulo é de andaime assumido: o prompt de acolhimento provavelmente sai
 * quando a funcionalidade 12 (abertura do chamado pela IA) entrar.
 */

export { FORMULARIO_HREF } from './mensagens';
export { ASSISTENTE_TASK, PROMPT_VERSION } from './prompt';
export { responderNaConversa, type RespostaIniciada } from './responder';
export { RESPOSTA_ASSISTENTE_MAX, type RespostaAssistente } from './schema';
