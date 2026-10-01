/**
 * Sem transação no Mongo, a escrita e o histórico dela são dois passos (spec
 * 0011: toda escrita em ativo gera `AtivoHistory`, toda troca de ativo no
 * chamado gera `ChamadoHistory`). Se gravar o histórico falha, desfaz a
 * escrita e relança: a action devolve "tente de novo" e a nova tentativa
 * encontra o estado de antes, então nenhuma mudança fica sem registro.
 */
export async function gravarHistoricoOuDesfazer(
  gravar: () => Promise<unknown>,
  desfazer: () => Promise<unknown>,
): Promise<void> {
  try {
    await gravar();
  } catch (e) {
    try {
      await desfazer();
    } catch (falhaAoDesfazer) {
      console.error(
        '[ativos] histórico falhou e não deu para desfazer a escrita:',
        falhaAoDesfazer,
      );
    }
    throw e;
  }
}
