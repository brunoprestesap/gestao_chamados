import 'server-only';

import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';

import type { CalendarioDiasUteis } from './prazo';

/**
 * O calendário do SLA (expediente e feriados ativos de uma única leitura)
 * para os prazos em dias úteis (spec 0023). Mudar feriado ou expediente muda
 * a prévia dos meses abertos do IMR; os fechados ficam como estão.
 */
export async function lerCalendarioDiasUteis(de: Date, ate: Date): Promise<CalendarioDiasUteis> {
  const cfg = await getBusinessCalendarConfig();
  const feriados = await getActiveHolidaysForRange(de, ate, cfg.timezone);
  return { weekdays: cfg.weekdays, workdayEnd: cfg.workdayEnd, feriados };
}
