import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { HolidayModel } from '@/models/Holiday';
import { HolidayUpdateSchema } from '@/shared/holidays/holiday.schemas';

/**
 * PUT /api/holidays/[id] — Atualiza feriado. Admin only.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    const { id } = await ctx.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = HolidayUpdateSchema.safeParse(raw);

    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = first.date?.[0] ?? first.name?.[0] ?? first.scope?.[0] ?? 'Dados inválidos.';
      return NextResponse.json({ error: Array.isArray(msg) ? msg[0] : msg }, { status: 400 });
    }

    await dbConnect();
    const userId = new Types.ObjectId(session.userId);

    const doc = await HolidayModel.findById(id);
    if (!doc) {
      return NextResponse.json({ error: 'Feriado não encontrado' }, { status: 404 });
    }

    if (parsed.data.date !== undefined && parsed.data.date !== doc.date) {
      const existing = await HolidayModel.findOne({
        date: parsed.data.date,
        scope: parsed.data.scope ?? doc.scope,
        _id: { $ne: doc._id },
      });
      if (existing) {
        return NextResponse.json(
          { error: `Já existe um feriado cadastrado para a data ${parsed.data.date}.` },
          { status: 409 },
        );
      }
    }

    const updated = await HolidayModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...parsed.data,
          updatedByUserId: userId,
        },
      },
      { new: true, runValidators: true },
    );

    if (!updated) {
      return NextResponse.json({ error: 'Feriado não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      item: {
        _id: String(updated._id),
        date: updated.date,
        name: updated.name,
        scope: updated.scope,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) {
    console.error('PUT /api/holidays/[id]:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao atualizar feriado' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/holidays/[id] — Remove feriado. Admin only.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    await dbConnect();

    const deleted = await HolidayModel.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Feriado não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/holidays/[id]:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao remover feriado' },
      { status: 500 },
    );
  }
}
