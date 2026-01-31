'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';

import { canManage, requireManager, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { UserModel } from '@/models/user.model';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import {
  computeSlaDueDatesFromConfig,
  evaluateResponseBreach,
  SLA_CONFIG_VERSION,
} from '@/lib/sla-utils';
import { SlaConfigModel } from '@/models/SlaConfig';
import { toAttendanceNature } from '@/shared/chamados/chamado.constants';
import {
  ClassificarChamadoSchema,
  type ClassificarChamadoInput,
} from '@/shared/chamados/chamado.schemas';
import {
  AssignTicketSchema,
  type AssignTicketInput,
  ReassignTicketSchema,
  type ReassignTicketInput,
} from '@/shared/chamados/assignment.schemas';
import { CloseTicketSchema, type CloseTicketInput } from '@/shared/chamados/close-ticket.schemas';

export type ClassificarResult = { ok: true } | { ok: false; error: string };
export type CloseTicketResult = { ok: true } | { ok: false; error: string };
export type AssignTicketResult =
  | { ok: true; technicianId: string; technicianName: string; strategy: 'MANUAL' | 'FALLBACK' }
  | { ok: false; error: string };
export type ReassignTicketResult =
  | { ok: true; technicianId: string; technicianName: string }
  | { ok: false; error: string };

/**
 * Status considerados "ativos" para cálculo de carga do técnico
 */
const ACTIVE_STATUSES = ['emvalidacao', 'validado', 'em atendimento'] as const;

export async function classificarChamadoAction(
  raw: ClassificarChamadoInput,
): Promise<ClassificarResult> {
  try {
    const session = await requireManager();
    const parsed = ClassificarChamadoSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.naturezaAtendimento?.[0] ??
        first.finalPriority?.[0] ??
        first.chamadoId?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { chamadoId, naturezaAtendimento, finalPriority, classificationNotes } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(chamadoId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };
    if (doc.status !== 'aberto') {
      return { ok: false, error: 'Somente chamados com status "aberto" podem ser classificados.' };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    const slaConfig = await SlaConfigModel.findOne({
      priority: finalPriority,
      isActive: true,
    }).lean();
    if (!slaConfig) {
      return {
        ok: false,
        error: `Não há configuração de SLA ativa para a prioridade "${finalPriority}". Configure em Configurações SLA (/sla).`,
      };
    }

    const calendarConfig = await getBusinessCalendarConfig();
    const { responseDueAt, resolutionDueAt } = computeSlaDueDatesFromConfig(
      now,
      slaConfig.responseTargetMinutes,
      slaConfig.resolutionTargetMinutes,
      slaConfig.businessHoursOnly,
      calendarConfig,
    );

    const attendanceNature = toAttendanceNature(naturezaAtendimento);

    await ChamadoModel.updateOne(
      { _id: chamadoId },
      {
        $set: {
          status: 'validado',
          naturezaAtendimento,
          attendanceNature,
          finalPriority,
          classificationNotes: classificationNotes ?? '',
          classifiedByUserId: userId,
          classifiedAt: now,
          'sla.priority': finalPriority,
          'sla.responseTargetMinutes': slaConfig.responseTargetMinutes,
          'sla.resolutionTargetMinutes': slaConfig.resolutionTargetMinutes,
          'sla.businessHoursOnly': slaConfig.businessHoursOnly,
          'sla.responseDueAt': responseDueAt,
          'sla.resolutionDueAt': resolutionDueAt,
          'sla.computedAt': now,
          'sla.configVersion': slaConfig.version ?? SLA_CONFIG_VERSION,
        },
      },
    );

    const obsParts = [
      `Natureza aprovada: ${naturezaAtendimento}, Prioridade: ${finalPriority}`,
      'Status alterado para Validado.',
    ];
    if (classificationNotes) obsParts.push(`Observações: ${classificationNotes}`);
    const observacoes = obsParts.join(' ');
    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'classificacao',
      statusAnterior: 'aberto',
      statusNovo: 'validado',
      observacoes,
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${chamadoId}`);

    return { ok: true };
  } catch (e) {
    console.error('classificarChamadoAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao classificar chamado. Tente novamente.',
    };
  }
}

/**
 * Encerra um chamado (Admin ou Preposto). Pré-condição: status "Concluído".
 * Update atômico para evitar encerramento duplo.
 */
export async function closeTicketAction(raw: CloseTicketInput): Promise<CloseTicketResult> {
  try {
    const session = await requireSession();
    if (!canManage(session.role)) {
      return { ok: false, error: 'Apenas administradores e prepostos podem encerrar chamados.' };
    }

    const parsed = CloseTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.ticketId?.[0] ?? first.closureNotes?.[0] ?? 'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { ticketId, closureNotes } = parsed.data;
    await dbConnect();

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    const updated = await ChamadoModel.findOneAndUpdate(
      { _id: ticketId, status: 'concluído' },
      {
        $set: {
          status: 'encerrado',
          closedAt: now,
          closedByUserId: userId,
          closureNotes: (closureNotes ?? '').trim() || '',
        },
      },
      { new: true },
    );

    if (!updated) {
      const existing = await ChamadoModel.findById(ticketId).lean();
      if (!existing) return { ok: false, error: 'Chamado não encontrado.' };
      if (existing.status !== 'concluído') {
        return {
          ok: false,
          error: `Encerramento permitido apenas para chamados com status "Concluído". Status atual: ${existing.status}.`,
        };
      }
      return { ok: false, error: 'Não foi possível encerrar o chamado. Tente novamente.' };
    }

    const obsParts = ['Status alterado para Encerrado.'];
    if ((closureNotes ?? '').trim()) obsParts.push(`Observações: ${(closureNotes ?? '').trim()}`);
    await ChamadoHistoryModel.create({
      chamadoId: updated._id,
      userId,
      action: 'encerramento',
      statusAnterior: 'concluído',
      statusNovo: 'encerrado',
      observacoes: obsParts.join(' '),
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return { ok: true };
  } catch (e) {
    console.error('closeTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao encerrar chamado. Tente novamente.',
    };
  }
}

/**
 * Busca técnicos elegíveis para um chamado e retorna o melhor candidato (menor carga).
 */
async function findBestTechnician(
  subtypeId: Types.ObjectId,
  excludeId?: Types.ObjectId,
): Promise<{ technician: { _id: Types.ObjectId; name: string } } | null> {
  // Busca técnicos ativos com a especialidade (subtipo)
  const tecnicos = await UserModel.find({
    role: 'Técnico',
    isActive: true,
    specialties: { $in: [subtypeId] },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean();

  if (tecnicos.length === 0) {
    return null;
  }

  // Conta carga atual por técnico
  const cargaPorTecnico = await ChamadoModel.aggregate([
    {
      $match: {
        assignedToUserId: { $in: tecnicos.map((t) => t._id) },
        status: { $in: [...ACTIVE_STATUSES] },
      },
    },
    {
      $group: {
        _id: '$assignedToUserId',
        count: { $sum: 1 },
      },
    },
  ]);

  const cargaMap = new Map<string, number>();
  cargaPorTecnico.forEach((item) => {
    cargaMap.set(String(item._id), item.count);
  });

  // Encontra técnico com menor carga que não está sobrecarregado
  let best: { tecnico: (typeof tecnicos)[0]; load: number } | null = null;

  for (const tecnico of tecnicos) {
    const tecnicoId = String(tecnico._id);
    const currentLoad = cargaMap.get(tecnicoId) ?? 0;
    const maxAssignedTickets = tecnico.maxAssignedTickets ?? 5;

    if (currentLoad < maxAssignedTickets) {
      if (!best || currentLoad < best.load) {
        best = { tecnico: tecnico, load: currentLoad };
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    technician: {
      _id: best.tecnico._id as Types.ObjectId,
      name: best.tecnico.name,
    },
  };
}

/**
 * Atribui um chamado a um técnico.
 * Se preferredTechnicianId for informado, tenta atribuir a ele (se elegível).
 * Caso contrário ou se ele estiver sobrecarregado, faz fallback automático.
 */
export async function assignTicketAction(raw: AssignTicketInput): Promise<AssignTicketResult> {
  try {
    const session = await requireManager();
    const parsed = AssignTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = first.ticketId?.[0] ?? 'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { ticketId, preferredTechnicianId } = parsed.data;
    await dbConnect();

    // Busca o chamado
    const chamado = await ChamadoModel.findById(ticketId);
    if (!chamado) {
      return { ok: false, error: 'Chamado não encontrado.' };
    }

    // Valida status (Validado ou Em validação para compatibilidade)
    if (chamado.status !== 'validado' && chamado.status !== 'emvalidacao') {
      return {
        ok: false,
        error: 'Somente chamados com status "Validado" ou "Em validação" podem ser atribuídos.',
      };
    }

    // Valida se já está atribuído
    if (chamado.assignedToUserId) {
      return { ok: false, error: 'Chamado já está atribuído a um técnico.' };
    }

    // Valida se tem catalogServiceId
    if (!chamado.catalogServiceId) {
      return {
        ok: false,
        error: 'Chamado não possui serviço catalogado. Classifique o chamado primeiro.',
      };
    }

    // Especialidades são subtipos; obtém o subtypeId do serviço catalogado
    const service = await ServiceCatalogModel.findById(chamado.catalogServiceId)
      .select('subtypeId')
      .lean();
    if (!service?.subtypeId) {
      return {
        ok: false,
        error: 'Serviço catalogado do chamado não possui subtipo definido.',
      };
    }
    // Normaliza para ObjectId (especialidades do técnico = array de subtypeId)
    const subtypeId = new Types.ObjectId(String(service.subtypeId));

    const assignedByUserId = new Types.ObjectId(session.userId);
    const now = new Date();
    let selectedTechnician: { _id: Types.ObjectId; name: string };
    let strategy: 'MANUAL' | 'FALLBACK' = 'MANUAL';

    // Se há técnico preferido, valida ele
    if (preferredTechnicianId) {
      const preferredId = new Types.ObjectId(preferredTechnicianId);
      const tecnico = await UserModel.findById(preferredId).lean();

      if (!tecnico) {
        return { ok: false, error: 'Técnico preferido não encontrado.' };
      }

      if (tecnico.role !== 'Técnico' || !tecnico.isActive) {
        return { ok: false, error: 'Usuário selecionado não é um técnico ativo.' };
      }

      // Verifica se o técnico tem a especialidade (subtipo) exigida pelo serviço catalogado do chamado
      const hasSpecialty =
        tecnico.specialties &&
        Array.isArray(tecnico.specialties) &&
        tecnico.specialties.some((s) => String(s) === String(subtypeId));

      if (!hasSpecialty) {
        return {
          ok: false,
          error: 'Técnico selecionado não possui a especialidade necessária para este chamado.',
        };
      }

      // Verifica carga
      const currentLoad = await ChamadoModel.countDocuments({
        assignedToUserId: preferredId,
        status: { $in: [...ACTIVE_STATUSES] },
      });

      const maxAssignedTickets = tecnico.maxAssignedTickets ?? 5;

      if (currentLoad >= maxAssignedTickets) {
        // Técnico sobrecarregado - faz fallback
        const fallback = await findBestTechnician(subtypeId, preferredId);
        if (!fallback) {
          return {
            ok: false,
            error:
              'Técnico selecionado está sobrecarregado e não há outros técnicos disponíveis para esta especialidade no momento.',
          };
        }
        selectedTechnician = fallback.technician;
        strategy = 'FALLBACK';
      } else {
        selectedTechnician = {
          _id: preferredId,
          name: tecnico.name,
        };
      }
    } else {
      // Sem preferência - busca automaticamente
      const best = await findBestTechnician(subtypeId);
      if (!best) {
        return {
          ok: false,
          error: 'Nenhum técnico disponível para esta especialidade no momento.',
        };
      }
      selectedTechnician = best.technician;
      strategy = 'FALLBACK';
    }

    const responseStartedAt = now;
    const responseBreachedAt = evaluateResponseBreach(
      now,
      chamado.sla?.responseDueAt ?? null,
      chamado.sla?.responseStartedAt ?? null,
    );

    const updatePayload: Record<string, unknown> = {
      status: 'em atendimento',
      assignedToUserId: selectedTechnician._id,
      assignedAt: now,
      assignedByUserId,
      'sla.responseStartedAt': responseStartedAt,
    };
    if (responseBreachedAt) {
      updatePayload['sla.responseBreachedAt'] = responseBreachedAt;
    }

    const updateResult = await ChamadoModel.findOneAndUpdate(
      {
        _id: ticketId,
        status: { $in: ['validado', 'emvalidacao'] },
        $or: [{ assignedToUserId: { $exists: false } }, { assignedToUserId: null }],
      },
      { $set: updatePayload },
      { new: true },
    );

    if (!updateResult) {
      return {
        ok: false,
        error:
          'Não foi possível atribuir o chamado. Ele pode ter sido atribuído por outro usuário ou o status mudou.',
      };
    }

    // Registra no histórico (status passa para Em atendimento)
    await ChamadoHistoryModel.create({
      chamadoId: chamado._id,
      userId: assignedByUserId,
      action: 'atribuicao_tecnico',
      statusAnterior: chamado.status,
      statusNovo: 'em atendimento',
      observacoes: `Atribuído a ${selectedTechnician.name} (${strategy === 'MANUAL' ? 'Manual' : 'Fallback automático'}). Status alterado para Em atendimento. Especialidade: ${String(subtypeId)}`,
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return {
      ok: true,
      technicianId: String(selectedTechnician._id),
      technicianName: selectedTechnician.name,
      strategy,
    };
  } catch (e) {
    console.error('assignTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao atribuir chamado. Tente novamente.',
    };
  }
}

/**
 * Reatribui um chamado (status "em atendimento") para outro técnico elegível.
 * Apenas Admin/Preposto. Mantém status "em atendimento". Registra histórico.
 */
export async function reassignTicketAction(
  raw: ReassignTicketInput,
): Promise<ReassignTicketResult> {
  try {
    const session = await requireManager();
    const parsed = ReassignTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.ticketId?.[0] ??
        first.preferredTechnicianId?.[0] ??
        first.notes?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { ticketId, preferredTechnicianId, notes } = parsed.data;
    await dbConnect();

    const chamado = await ChamadoModel.findById(ticketId).lean();
    if (!chamado) {
      return { ok: false, error: 'Chamado não encontrado.' };
    }

    if (chamado.status !== 'em atendimento') {
      return {
        ok: false,
        error: 'Somente chamados com status "Em atendimento" podem ser reatribuídos.',
      };
    }

    if (!chamado.catalogServiceId) {
      return { ok: false, error: 'Chamado não possui serviço catalogado.' };
    }

    const currentAssignedId = chamado.assignedToUserId ? String(chamado.assignedToUserId) : null;
    if (!currentAssignedId) {
      return { ok: false, error: 'Chamado não está atribuído a um técnico.' };
    }

    if (preferredTechnicianId === currentAssignedId) {
      return { ok: false, error: 'Selecione outro técnico para reatribuir.' };
    }

    const newTechId = new Types.ObjectId(preferredTechnicianId);
    const newTech = await UserModel.findById(newTechId).lean();
    if (!newTech) {
      return { ok: false, error: 'Técnico selecionado não encontrado.' };
    }

    if (newTech.role !== 'Técnico' || !newTech.isActive) {
      return { ok: false, error: 'Usuário selecionado não é um técnico ativo.' };
    }

    // Especialidades são subtipos; obtém o subtypeId do serviço do chamado
    const service = await ServiceCatalogModel.findById(chamado.catalogServiceId)
      .select('subtypeId')
      .lean();
    if (!service?.subtypeId) {
      return { ok: false, error: 'Serviço catalogado do chamado não possui subtipo definido.' };
    }
    // Normaliza para ObjectId (especialidades do técnico = array de subtypeId)
    const subtypeId = new Types.ObjectId(String(service.subtypeId));

    const hasSpecialty =
      newTech.specialties &&
      Array.isArray(newTech.specialties) &&
      newTech.specialties.some((s) => String(s) === String(subtypeId));
    if (!hasSpecialty) {
      return {
        ok: false,
        error: 'Técnico selecionado não possui a especialidade necessária para este chamado.',
      };
    }

    const currentLoad = await ChamadoModel.countDocuments({
      assignedToUserId: newTechId,
      status: { $in: [...ACTIVE_STATUSES] },
    });
    const maxAssignedTickets = newTech.maxAssignedTickets ?? 5;
    if (currentLoad >= maxAssignedTickets) {
      return {
        ok: false,
        error: 'Técnico selecionado está sobrecarregado. Escolha outro técnico.',
      };
    }

    const now = new Date();
    const reassignedByUserId = new Types.ObjectId(session.userId);

    const slaUpdate: Record<string, unknown> = {};
    const responseStartedAt = chamado.sla?.responseStartedAt ?? now;
    if (!chamado.sla?.responseStartedAt) {
      slaUpdate['sla.responseStartedAt'] = now;
      const responseBreachedAt = evaluateResponseBreach(
        now,
        chamado.sla?.responseDueAt ?? null,
        null,
      );
      if (responseBreachedAt) slaUpdate['sla.responseBreachedAt'] = responseBreachedAt;
    }

    const updatePayload: Record<string, unknown> = {
      assignedToUserId: newTechId,
      reassignedAt: now,
      reassignedByUserId,
      reassignmentNotes: (notes ?? '').trim() || '',
      ...slaUpdate,
    };

    const updated = await ChamadoModel.findOneAndUpdate(
      { _id: ticketId, status: 'em atendimento' },
      { $set: updatePayload },
      { new: true },
    );

    if (!updated) {
      return {
        ok: false,
        error: 'Não foi possível reatribuir. O chamado pode ter mudado de status.',
      };
    }

    const previousTech = await UserModel.findById(currentAssignedId).select('name').lean();
    const previousName = previousTech?.name ?? 'Técnico anterior';
    const obsParts = [
      `Reatribuído de ${previousName} para ${newTech.name}.`,
      `Reatribuído por sessão (Admin/Preposto).`,
    ];
    if ((notes ?? '').trim()) obsParts.push(`Observações: ${(notes ?? '').trim()}`);

    await ChamadoHistoryModel.create({
      chamadoId: updated._id,
      userId: reassignedByUserId,
      action: 'reatribuicao_tecnico',
      statusAnterior: 'em atendimento',
      statusNovo: 'em atendimento',
      observacoes: obsParts.join(' '),
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return {
      ok: true,
      technicianId: String(newTech._id),
      technicianName: newTech.name,
    };
  } catch (e) {
    console.error('reassignTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao reatribuir chamado. Tente novamente.',
    };
  }
}
