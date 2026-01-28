import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceTypeModel } from '@/models/ServiceType';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const body = await req.json();

  const { id } = await params;

  const updated = await ServiceTypeModel.findByIdAndUpdate(
    id,
    { ...body, ...(body?.name ? { name: String(body.name).trim() } : {}) },
    { new: true },
  );

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ item: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const { id } = await params;
  const deleted = await ServiceTypeModel.findByIdAndDelete(id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
