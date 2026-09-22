import type { CanalAbertura } from './conversa.constants';

/**
 * A marca do chamado aberto pela conversa (spec 0004, AC-15). Aparece no
 * detalhe do chamado, na lista e na classificação da gestão e no cabeçalho da
 * leitura em `/conversas`. A tela do técnico não ganha marca.
 *
 * Diz só o que a entrada `decisao_ia` do histórico já mostra a todos: nunca a
 * prioridade sugerida, a confiança nem o motivo.
 */

export const MARCA_CHAT = 'Aberto pelo chat';
export const MARCA_CHAT_IA = 'Aberto pelo chat · serviço sugerido pela IA';

export function marcaDeAbertura(
  canalAbertura: CanalAbertura | string | null | undefined,
  servicoSugeridoIa: boolean | null | undefined,
): string | null {
  if (canalAbertura !== 'chat') return null;
  return servicoSugeridoIa ? MARCA_CHAT_IA : MARCA_CHAT;
}
