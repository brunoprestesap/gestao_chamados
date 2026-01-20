import '@/models/ServiceType';
import '@/models/ServiceSubType';

import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceUpdateSchema } from '@/shared/catalog/service.schemas';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await dbConnect();

  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const item = await ServiceCatalogModel.findById(params.id)
    .populate({ path: 'typeId', select: 'name' })
    .populate({ path: 'subtypeId', select: 'name' })
    .lean();

  if (!item) {
    return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 });
  }

  const normalized = {
    ...item,
    _id: String(item._id),
    typeId: String((item as any).typeId?._id ?? item.typeId),
    subtypeId: String((item as any).subtypeId?._id ?? item.subtypeId),
    type: (item as any).typeId
      ? { id: String((item as any).typeId._id), name: (item as any).typeId.name }
      : null,
    subtype: (item as any).subtypeId
      ? { id: String((item as any).subtypeId._id), name: (item as any).subtypeId.name }
      : null,
  };

  return NextResponse.json({ item: normalized });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await dbConnect();

  const { id } = await ctx.params; // ✅ unwrap

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  if (!raw) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  // ✅ USAR UPDATE SCHEMA
  const parsed = ServiceUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await ServiceCatalogModel.findByIdAndUpdate(
    id,
    { $set: parsed.data },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}
