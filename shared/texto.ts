/**
 * Utilidades de texto puras, sem servidor nem navegador, para servir aos dois
 * lados.
 */

/**
 * O texto sem pontuação no fim, para a frase que vem depois abrir com o próprio
 * ponto ("…sala 5" e ".", nunca "…sala 5.."). O título do chamado do chat e o
 * local exato carregam o que a pessoa digitou (ou o que o modelo extraiu), então
 * podem terminar em qualquer sinal.
 *
 * Age no texto cru, antes de qualquer escape: depois dele, o ";" de uma entidade
 * HTML como `&quot;` pareceria pontuação. Usa um laço em vez de uma regex
 * ancorada no fim, que seria quadrática num texto com milhares de pontos.
 */
export function textoSemPontuacaoFinal(texto: string): string {
  let fim = texto.length;
  while (fim > 0 && /[\s.!?…,;:]/.test(texto[fim - 1])) fim -= 1;
  return texto.slice(0, fim);
}
