import 'server-only';

import { dbConnect } from '@/lib/db';
import { BusinessCalendarModel } from '@/models/BusinessCalendar';

export type BusinessCalendarConfig = {
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  weekdays: number[];
};

const DEFAULTS: BusinessCalendarConfig = {
  timezone: 'America/Belem',
  workdayStart: '08:00',
  workdayEnd: '18:00',
  weekdays: [1, 2, 3, 4, 5],
};

/** Retorna a configuração institucional ativa. Usa defaults se não houver documento. */
export async function getBusinessCalendarConfig(): Promise<BusinessCalendarConfig> {
  await dbConnect();
  const doc = await BusinessCalendarModel.findOne().sort({ updatedAt: -1 }).lean();
  if (!doc) return { ...DEFAULTS };
  return {
    timezone: doc.timezone ?? DEFAULTS.timezone,
    workdayStart: doc.workdayStart ?? DEFAULTS.workdayStart,
    workdayEnd: doc.workdayEnd ?? DEFAULTS.workdayEnd,
    weekdays: Array.isArray(doc.weekdays) && doc.weekdays.length > 0 ? doc.weekdays : DEFAULTS.weekdays,
  };
}
