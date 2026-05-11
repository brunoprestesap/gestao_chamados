'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { calculateNextRunAt } from '@/lib/recurring-utils';
import { RecurringTicketModel } from '@/models/RecurringTicket';
import {
  type CreateRecurringTicketInput,
  CreateRecurringTicketSchema,
  type RecurrenceType,
  type UpdateRecurringTicketInput,
  UpdateRecurringTicketSchema,
} from '@/shared/chamados/recurring-ticket.schemas';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Cria um novo agendamento de chamado recorrente.
 */
export async function createRecurringTemplateAction(
  raw: CreateRecurringTicketInput,
): Promise<Result<{ id: string }>> {
  try {
    const session = await requireManager();
    const parsed = CreateRecurringTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldMsg = Object.values(flat.fieldErrors).flat()[0];
      const formMsg = flat.formErrors[0];
      return { ok: false, error: fieldMsg ?? formMsg ?? 'Dados inválidos.' };
    }

    const data = parsed.data;
    await dbConnect();

    const { weekdays } = await getBusinessCalendarConfig();
    const nextRunAt = calculateNextRunAt(
      data.recurrenceType,
      {
        dayOfWeek: data.dayOfWeek,
        dayOfMonth: data.dayOfMonth,
        intervalDays: data.intervalDays,
      },
      undefined,
      weekdays,
    );

    const doc = await RecurringTicketModel.create({
      name: data.name,
      titulo: data.titulo,
      descricao: data.descricao,
      unitId: new Types.ObjectId(data.unitId),
      tipoServico: data.tipoServico,
      naturezaAtendimento: data.naturezaAtendimento,
      grauUrgencia: data.grauUrgencia,
      subtypeId: new Types.ObjectId(data.subtypeId),
      catalogServiceId: new Types.ObjectId(data.catalogServiceId),
      solicitanteId: new Types.ObjectId(data.solicitanteId),
      recurrenceType: data.recurrenceType,
      dayOfWeek: data.dayOfWeek,
      dayOfMonth: data.dayOfMonth,
      intervalDays: data.intervalDays,
      nextRunAt,
      isActive: true,
      createdByUserId: new Types.ObjectId(session.userId),
    });

    revalidatePath('/gestao/recurring');
    return { ok: true, data: { id: String(doc._id) } };
  } catch (e) {
    console.error('createRecurringTemplateAction:', e);
    return { ok: false, error: 'Erro ao criar agendamento. Tente novamente.' };
  }
}

/**
 * Atualiza um agendamento existente.
 */
export async function updateRecurringTemplateAction(
  raw: UpdateRecurringTicketInput,
): Promise<Result> {
  try {
    await requireManager();
    const parsed = UpdateRecurringTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldMsg = Object.values(flat.fieldErrors).flat()[0];
      const formMsg = flat.formErrors[0];
      return { ok: false, error: fieldMsg ?? formMsg ?? 'Dados inválidos.' };
    }

    const { id, ...data } = parsed.data;
    await dbConnect();

    const existing = await RecurringTicketModel.findById(id);
    if (!existing) return { ok: false, error: 'Agendamento não encontrado.' };

    // Recalcular nextRunAt se recorrência mudou
    const recurrenceChanged =
      existing.recurrenceType !== data.recurrenceType ||
      existing.dayOfWeek !== data.dayOfWeek ||
      existing.dayOfMonth !== data.dayOfMonth ||
      existing.intervalDays !== data.intervalDays;

    const { weekdays } = await getBusinessCalendarConfig();
    const nextRunAt = recurrenceChanged
      ? calculateNextRunAt(
          data.recurrenceType,
          {
            dayOfWeek: data.dayOfWeek,
            dayOfMonth: data.dayOfMonth,
            intervalDays: data.intervalDays,
          },
          undefined,
          weekdays,
        )
      : existing.nextRunAt;

    await RecurringTicketModel.updateOne(
      { _id: id },
      {
        $set: {
          name: data.name,
          titulo: data.titulo,
          descricao: data.descricao,
          unitId: new Types.ObjectId(data.unitId),
          tipoServico: data.tipoServico,
          naturezaAtendimento: data.naturezaAtendimento,
          grauUrgencia: data.grauUrgencia,
          subtypeId: data.subtypeId ? new Types.ObjectId(data.subtypeId) : undefined,
          catalogServiceId: data.catalogServiceId
            ? new Types.ObjectId(data.catalogServiceId)
            : undefined,
          solicitanteId: new Types.ObjectId(data.solicitanteId),
          recurrenceType: data.recurrenceType,
          dayOfWeek: data.dayOfWeek,
          dayOfMonth: data.dayOfMonth,
          intervalDays: data.intervalDays,
          nextRunAt,
        },
      },
    );

    revalidatePath('/gestao/recurring');
    return { ok: true };
  } catch (e) {
    console.error('updateRecurringTemplateAction:', e);
    return { ok: false, error: 'Erro ao atualizar agendamento. Tente novamente.' };
  }
}

/**
 * Ativa ou desativa um agendamento.
 */
export async function toggleRecurringTemplateAction(templateId: string): Promise<Result> {
  try {
    await requireManager();

    if (!Types.ObjectId.isValid(templateId)) {
      return { ok: false, error: 'ID inválido.' };
    }

    await dbConnect();

    const doc = await RecurringTicketModel.findById(templateId);
    if (!doc) return { ok: false, error: 'Agendamento não encontrado.' };

    const newActive = !doc.isActive;

    const update: Record<string, unknown> = { isActive: newActive };

    // Se ativando, recalcular nextRunAt para o próximo slot futuro (dia útil)
    if (newActive) {
      const { weekdays } = await getBusinessCalendarConfig();
      update.nextRunAt = calculateNextRunAt(
        doc.recurrenceType as RecurrenceType,
        {
          dayOfWeek: doc.dayOfWeek ?? undefined,
          dayOfMonth: doc.dayOfMonth ?? undefined,
          intervalDays: doc.intervalDays ?? undefined,
        },
        new Date(),
        weekdays,
      );
    }

    await RecurringTicketModel.updateOne({ _id: templateId }, { $set: update });

    revalidatePath('/gestao/recurring');
    return { ok: true };
  } catch (e) {
    console.error('toggleRecurringTemplateAction:', e);
    return { ok: false, error: 'Erro ao alterar status do agendamento. Tente novamente.' };
  }
}

/**
 * Deleta um agendamento (hard delete).
 */
export async function deleteRecurringTemplateAction(templateId: string): Promise<Result> {
  try {
    await requireManager();

    if (!Types.ObjectId.isValid(templateId)) {
      return { ok: false, error: 'ID inválido.' };
    }

    await dbConnect();

    const result = await RecurringTicketModel.deleteOne({ _id: templateId });
    if (result.deletedCount === 0) {
      return { ok: false, error: 'Agendamento não encontrado.' };
    }

    revalidatePath('/gestao/recurring');
    return { ok: true };
  } catch (e) {
    console.error('deleteRecurringTemplateAction:', e);
    return { ok: false, error: 'Erro ao deletar agendamento. Tente novamente.' };
  }
}
