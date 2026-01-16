import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';

export async function GET(req: Request) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const typeId = (searchParams.get('typeId') || '').trim();

  const filter: any = {};
  if (typeId) filter.typeId = typeId;

  const items = await ServiceSubTypeModel.find(filter).sort({ name: 1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  await dbConnect();
  const body = await req.json();

  const typeId = String(body?.typeId || '').trim();
  const name = String(body?.name || '').trim();

  if (!typeId) return NextResponse.json({ error: 'Missing typeId' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const created = await ServiceSubTypeModel.create({ typeId, name, isActive: true });
  return NextResponse.json({ item: created }, { status: 201 });
}
