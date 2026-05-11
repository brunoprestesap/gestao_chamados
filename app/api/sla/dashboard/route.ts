import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { getSlaResolutionStatus, type SlaStatusDisplay } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';

const ACTIVE_STATUSES = [
  'validado',
  'em atendimento',
  'aguardando_solicitante',
  'aguardando_terceiros',
];

interface SlaDashboardItem {
  _id: string;
  ticket_number: string;
  titulo: string;
  status: string;
  tipoServico: string;
  finalPriority: string | null;
  assignedToUserId: string | null;
  assignedToUserName: string | null;
  remainingMs: number;
  totalMs: number;
  percentUsed: number;
  slaStatus: SlaStatusDisplay;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  isPaused: boolean;
}

interface SlaSummary {
  total: number;
  noPrazo: number;
  proximoVencimento: number;
  atrasado: number;
}

interface PriorityBreakdown {
  priority: string;
  total: number;
  noPrazo: number;
  proximoVencimento: number;
  atrasado: number;
}

interface TipoServicoBreakdown {
  tipoServico: string;
  total: number;
  noPrazo: number;
  proximoVencimento: number;
  atrasado: number;
}

export async function GET() {
  await requireManager();
  await dbConnect();

  const now = new Date();

  const chamados = await ChamadoModel.find({
    status: { $in: ACTIVE_STATUSES },
    'sla.resolutionDueAt': { $ne: null },
    'sla.resolvedAt': null,
  })
    .select(
      'ticket_number titulo status tipoServico finalPriority assignedToUserId sla slaPausedAt totalPausedMinutes createdAt',
    )
    .populate('assignedToUserId', 'name')
    .lean();

  const summary: SlaSummary = { total: 0, noPrazo: 0, proximoVencimento: 0, atrasado: 0 };
  const priorityMap = new Map<string, PriorityBreakdown>();
  const tipoMap = new Map<string, TipoServicoBreakdown>();

  const items: SlaDashboardItem[] = chamados.map((c) => {
    const sla = c.sla;
    const resolutionDueAt = sla?.resolutionDueAt ? new Date(sla.resolutionDueAt) : null;
    const computedAt = sla?.computedAt ? new Date(sla.computedAt) : null;
    const priority = (c.finalPriority ?? sla?.priority ?? 'NORMAL') as
      | 'BAIXA'
      | 'NORMAL'
      | 'ALTA'
      | 'EMERGENCIAL';

    // Calcula tempo com desconto de pausas (totalPausedMinutes é o campo canônico)
    const pausedMs = (c.totalPausedMinutes ?? 0) * 60_000;
    const activePauseMs = c.slaPausedAt ? now.getTime() - new Date(c.slaPausedAt).getTime() : 0;
    const totalPauseMs = pausedMs + activePauseMs;

    const totalMs =
      resolutionDueAt && computedAt ? resolutionDueAt.getTime() - computedAt.getTime() : 0;
    const elapsedMs = Math.max(
      0,
      computedAt ? now.getTime() - computedAt.getTime() - totalPauseMs : 0,
    );
    // remainingMs: positivo = no prazo, negativo = atrasado
    const rawRemainingMs = totalMs - elapsedMs;
    const percentUsed = totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 0;

    // "Agora efetivo" descontando pausa — coerente com o cálculo de remainingMs/percentUsed
    // acima. Sem esse desconto, um chamado pausado próximo do dueAt seria classificado como
    // 'atrasado' enquanto o countdown ainda mostra tempo positivo.
    const effectiveNow = new Date(now.getTime() - totalPauseMs);
    const slaStatus = getSlaResolutionStatus(
      effectiveNow,
      resolutionDueAt,
      null,
      sla?.resolutionBreachedAt ? new Date(sla.resolutionBreachedAt) : null,
      priority,
      computedAt,
    );

    // Agregações
    summary.total++;
    if (slaStatus === 'no_prazo') summary.noPrazo++;
    else if (slaStatus === 'proximo_vencimento') summary.proximoVencimento++;
    else summary.atrasado++;

    // Por prioridade
    const pKey = priority;
    if (!priorityMap.has(pKey)) {
      priorityMap.set(pKey, {
        priority: pKey,
        total: 0,
        noPrazo: 0,
        proximoVencimento: 0,
        atrasado: 0,
      });
    }
    const pb = priorityMap.get(pKey)!;
    pb.total++;
    if (slaStatus === 'no_prazo') pb.noPrazo++;
    else if (slaStatus === 'proximo_vencimento') pb.proximoVencimento++;
    else pb.atrasado++;

    // Por tipo de serviço
    const tKey = c.tipoServico ?? 'Outros';
    if (!tipoMap.has(tKey)) {
      tipoMap.set(tKey, {
        tipoServico: tKey,
        total: 0,
        noPrazo: 0,
        proximoVencimento: 0,
        atrasado: 0,
      });
    }
    const tb = tipoMap.get(tKey)!;
    tb.total++;
    if (slaStatus === 'no_prazo') tb.noPrazo++;
    else if (slaStatus === 'proximo_vencimento') tb.proximoVencimento++;
    else tb.atrasado++;

    // Nome do técnico via populate
    const assignedUser = c.assignedToUserId as unknown as
      | { _id: unknown; name?: string }
      | null
      | undefined;
    const assignedToUserName =
      assignedUser && typeof assignedUser === 'object' ? (assignedUser.name ?? null) : null;
    const assignedToUserId =
      assignedUser && typeof assignedUser === 'object'
        ? String(assignedUser._id)
        : c.assignedToUserId
          ? String(c.assignedToUserId)
          : null;

    return {
      _id: String(c._id),
      ticket_number: c.ticket_number,
      titulo: c.titulo,
      status: c.status,
      tipoServico: c.tipoServico ?? 'Outros',
      finalPriority: priority,
      assignedToUserId,
      assignedToUserName,
      remainingMs: rawRemainingMs,
      totalMs,
      percentUsed: Math.round(percentUsed * 100) / 100,
      slaStatus,
      responseDueAt: sla?.responseDueAt ? new Date(sla.responseDueAt).toISOString() : null,
      resolutionDueAt: resolutionDueAt?.toISOString() ?? null,
      isPaused: c.slaPausedAt != null,
    };
  });

  // Ordena: atrasados primeiro, depois proximo_vencimento, depois no_prazo
  const statusOrder: Record<SlaStatusDisplay, number> = {
    atrasado: 0,
    proximo_vencimento: 1,
    no_prazo: 2,
  };
  items.sort((a, b) => statusOrder[a.slaStatus] - statusOrder[b.slaStatus]);

  return NextResponse.json({
    items,
    summary,
    byPriority: Array.from(priorityMap.values()),
    byTipoServico: Array.from(tipoMap.values()),
  });
}
