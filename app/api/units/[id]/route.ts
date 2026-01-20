import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { UnitModel } from '@/models/unit';
import { UnitUpdateSchema } from '@/shared/units/unit.schemas';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const { id } = await ctx.params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = UnitUpdateSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await UnitModel.findByIdAndUpdate(
    id,
    { $set: parsed.data },
    { new: true, runValidators: true },
  );

  if (!updated) {
    return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const { id } = await ctx.params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const deleted = await UnitModel.findByIdAndDelete(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
