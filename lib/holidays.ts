import 'server-only';

import { dbConnect } from '@/lib/db';
import { toLocalDateYYYYMMDD } from '@/lib/sla-timezone';
import { HolidayModel } from '@/models/Holiday';

export { toLocalDateYYYYMMDD } from '@/lib/sla-timezone';

/**
 * Retorna as datas (YYYY-MM-DD) dos feriados ativos em um intervalo.
 * Usado para cálculo de SLA — pular esses dias como não úteis.
 */
export async function getActiveHolidaysForRange(
  startDate: Date,
  endDate: Date,
  timezone: string,
): Promise<Set<string>> {
  let startStr = toLocalDateYYYYMMDD(startDate, timezone);
  let endStr = toLocalDateYYYYMMDD(endDate, timezone);
  if (startStr > endStr) [startStr, endStr] = [endStr, startStr];

  await dbConnect();
  const docs = await HolidayModel.find({
    isActive: true,
    date: { $gte: startStr, $lte: endStr },
  })
    .select('date')
    .lean();

  return new Set(docs.map((d) => d.date));
}
