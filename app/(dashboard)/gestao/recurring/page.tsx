import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { RecurringTicketModel } from '@/models/RecurringTicket';

import { RecurringTicketsClient } from './_components/RecurringTicketsClient';

export const dynamic = 'force-dynamic';

type RecurringItem = {
  _id: string;
  name: string;
  titulo: string;
  descricao: string;
  tipoServico: string;
  naturezaAtendimento: string;
  grauUrgencia: string;
  recurrenceType: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  intervalDays?: number;
  nextRunAt: string;
  lastRunAt?: string;
  totalGenerated: number;
  isActive: boolean;
  unitId: string;
  solicitanteId: string;
  subtypeId: string;
  catalogServiceId: string;
};

export default async function RecurringTicketsPage() {
  await requireManager();
  await dbConnect();

  const docs = await RecurringTicketModel.find().sort({ isActive: -1, nextRunAt: 1 }).lean();

  const items: RecurringItem[] = docs.map((d) => ({
    _id: String(d._id),
    name: d.name ?? '',
    titulo: d.titulo ?? '',
    descricao: d.descricao ?? '',
    tipoServico: d.tipoServico ?? '',
    naturezaAtendimento: d.naturezaAtendimento ?? '',
    grauUrgencia: d.grauUrgencia ?? 'Normal',
    recurrenceType: d.recurrenceType ?? '',
    dayOfWeek: d.dayOfWeek ?? undefined,
    dayOfMonth: d.dayOfMonth ?? undefined,
    intervalDays: d.intervalDays ?? undefined,
    nextRunAt: d.nextRunAt ? new Date(d.nextRunAt).toISOString() : '',
    lastRunAt: d.lastRunAt ? new Date(d.lastRunAt).toISOString() : undefined,
    totalGenerated: d.totalGenerated ?? 0,
    isActive: d.isActive ?? true,
    unitId: d.unitId ? String(d.unitId) : '',
    solicitanteId: d.solicitanteId ? String(d.solicitanteId) : '',
    subtypeId: String(d.subtypeId),
    catalogServiceId: String(d.catalogServiceId),
  }));

  return <RecurringTicketsClient items={items} />;
}
