import 'server-only';

import { lerCalendarioDiasUteis } from '@/lib/dias-uteis/calendario';
import { LIMITE_DIAS_CORRIDOS, prazoEmDiasUteis } from '@/lib/dias-uteis/prazo';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O `fornecimentoAte` de uma autorização (spec 0023, AC-6): fim do expediente
 * do N-ésimo dia útil depois do dia (Belém) da autorização. Os feriados lidos
 * cobrem a mesma janela da contagem (`LIMITE_DIAS_CORRIDOS`). Devolve null quando não há
 * prazo (expediente sem dia útil) ou quando a leitura do calendário falha: a
 * autorização segue, e o IMR estima o prazo da cotação sem ele.
 */
export async function calcularFornecimentoAte(autorizadoEm: Date, n: number): Promise<Date | null> {
  try {
    const cal = await lerCalendarioDiasUteis(
      autorizadoEm,
      new Date(autorizadoEm.getTime() + LIMITE_DIAS_CORRIDOS * DIA_MS),
    );
    const prazo = prazoEmDiasUteis(autorizadoEm, n, cal);
    if (!prazo) {
      console.warn(
        `[material] prazo de fornecimento sem dia útil no expediente (N = ${n}); a cotação fica sem fornecimentoAte`,
      );
    }
    return prazo;
  } catch (e) {
    console.error('[material] prazo de fornecimento: falha ao ler o calendário', e);
    return null;
  }
}
