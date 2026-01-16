import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  await dbConnect();
  const body = await req.json();

  const updated = await ServiceSubTypeModel.findByIdAndUpdate(
    params.id,
    { ...body, ...(body?.name ? { name: String(body.name).trim() } : {}) },
    { new: true },
  );

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ item: updated });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await dbConnect();
  const deleted = await ServiceSubTypeModel.findByIdAndDelete(params.id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
