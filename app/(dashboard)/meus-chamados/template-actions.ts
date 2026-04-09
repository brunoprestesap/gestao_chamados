'use server';

import { Types } from 'mongoose';

import { canManage, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { TicketTemplateModel } from '@/models/TicketTemplate';
import {
  type CreateTemplateInput,
  CreateTemplateSchema,
  type TemplateListItem,
} from '@/shared/chamados/ticket-template.schemas';

export async function createTemplateAction(
  data: CreateTemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    await dbConnect();

    const parsed = CreateTemplateSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
    }

    const { name, scope, ...fields } = parsed.data;

    // Apenas Admin/Preposto podem criar templates globais
    if (scope === 'global' && !canManage(session.role)) {
      return { ok: false, error: 'Apenas gestores podem criar templates globais' };
    }

    const doc = await TicketTemplateModel.create({
      name,
      scope,
      createdByUserId: new Types.ObjectId(session.userId),
      ...(fields.descricao ? { descricao: fields.descricao } : {}),
      ...(fields.tipoServico ? { tipoServico: fields.tipoServico } : {}),
      ...(fields.naturezaAtendimento ? { naturezaAtendimento: fields.naturezaAtendimento } : {}),
      ...(fields.grauUrgencia ? { grauUrgencia: fields.grauUrgencia } : {}),
      ...(fields.unitId ? { unitId: new Types.ObjectId(fields.unitId) } : {}),
      ...(fields.subtypeId ? { subtypeId: new Types.ObjectId(fields.subtypeId) } : {}),
      ...(fields.catalogServiceId
        ? { catalogServiceId: new Types.ObjectId(fields.catalogServiceId) }
        : {}),
    });

    return { ok: true, id: String(doc._id) };
  } catch (err) {
    console.error('[TemplateAction] createTemplateAction error:', err);
    return { ok: false, error: 'Erro ao criar template' };
  }
}

export async function listTemplatesAction(): Promise<
  { ok: true; data: TemplateListItem[] } | { ok: false; error: string }
> {
  try {
    const session = await requireSession();
    await dbConnect();

    const docs = await TicketTemplateModel.find({
      isActive: true,
      $or: [
        { scope: 'global' },
        { scope: 'personal', createdByUserId: new Types.ObjectId(session.userId) },
      ],
    })
      .sort({ usageCount: -1 })
      .limit(50)
      .lean();

    const items: TemplateListItem[] = docs.map((d) => ({
      id: String(d._id),
      name: d.name,
      scope: d.scope as 'global' | 'personal',
      createdByUserId: String(d.createdByUserId),
      descricao: d.descricao ?? undefined,
      tipoServico: d.tipoServico ?? undefined,
      naturezaAtendimento: d.naturezaAtendimento ?? undefined,
      grauUrgencia: d.grauUrgencia ?? undefined,
      unitId: d.unitId ? String(d.unitId) : undefined,
      subtypeId: d.subtypeId ? String(d.subtypeId) : undefined,
      catalogServiceId: d.catalogServiceId ? String(d.catalogServiceId) : undefined,
      usageCount: d.usageCount ?? 0,
    }));

    return { ok: true, data: items };
  } catch (err) {
    console.error('[TemplateAction] listTemplatesAction error:', err);
    return { ok: false, error: 'Erro ao listar templates' };
  }
}

export async function deleteTemplateAction(
  templateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    await dbConnect();

    if (!Types.ObjectId.isValid(templateId)) {
      return { ok: false, error: 'Template não encontrado' };
    }

    const doc = await TicketTemplateModel.findById(templateId);
    if (!doc || !doc.isActive) {
      return { ok: false, error: 'Template não encontrado' };
    }

    // Dono do template, Admin, ou Preposto (para templates globais) podem deletar
    const isOwner = String(doc.createdByUserId) === session.userId;
    const isManagerOfGlobal = canManage(session.role) && doc.scope === 'global';
    if (!isOwner && !isManagerOfGlobal) {
      return { ok: false, error: 'Sem permissão para excluir este template' };
    }

    doc.isActive = false;
    await doc.save();

    return { ok: true };
  } catch (err) {
    console.error('[TemplateAction] deleteTemplateAction error:', err);
    return { ok: false, error: 'Erro ao excluir template' };
  }
}

export async function incrementTemplateUsageAction(
  templateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSession();
    await dbConnect();

    if (!Types.ObjectId.isValid(templateId)) {
      return { ok: false, error: 'ID inválido' };
    }

    await TicketTemplateModel.updateOne(
      { _id: templateId, isActive: true },
      { $inc: { usageCount: 1 } },
    );

    return { ok: true };
  } catch (err) {
    console.error('[TemplateAction] incrementTemplateUsageAction error:', err);
    return { ok: false, error: 'Erro ao atualizar uso do template' };
  }
}
