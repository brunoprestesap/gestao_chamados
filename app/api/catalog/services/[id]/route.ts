import '@/models/ServiceType';
import '@/models/ServiceSubType';

import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceUpdateSchema } from '@/shared/catalog/service.schemas';

type PopulatedTypeRef = { _id: Types.ObjectId; name: string };

function asPopulated(
  ref: Types.ObjectId | PopulatedTypeRef | undefined | null,
): PopulatedTypeRef | null {
  if (ref == null) return null;
  if (typeof ref === 'object' && '_id' in ref && 'name' in ref) {
    return ref as PopulatedTypeRef;
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const item = await ServiceCatalogModel.findById(id)
    .populate({ path: 'typeId', select: 'name' })
    .populate({ path: 'subtypeId', select: 'name' })
    .lean();

  if (!item) {
    return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 });
  }

  const typePop = asPopulated(item.typeId as Types.ObjectId | PopulatedTypeRef);
  const subtypePop = asPopulated(item.subtypeId as Types.ObjectId | PopulatedTypeRef);

  const normalized = {
    ...item,
    _id: String(item._id),
    typeId: String(typePop?._id ?? item.typeId),
    subtypeId: String(subtypePop?._id ?? item.subtypeId),
    type: typePop ? { id: String(typePop._id), name: typePop.name } : null,
    subtype: subtypePop ? { id: String(subtypePop._id), name: subtypePop.name } : null,
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

  // Nunca alterar o código do serviço (gerado automaticamente no create)
  const { code, ...dataToUpdate } = parsed.data;
  void code;
  const updated = await ServiceCatalogModel.findByIdAndUpdate(
    id,
    { $set: dataToUpdate },
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const deleted = await ServiceCatalogModel.findByIdAndDelete(id);

  if (!deleted) {
    return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
