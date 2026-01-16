import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceTypeModel } from '@/models/ServiceType';

export async function GET() {
  await dbConnect();
  const items = await ServiceTypeModel.find().sort({ name: 1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  await dbConnect();
  const body = await req.json();

  const name = String(body?.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const created = await ServiceTypeModel.create({ name, isActive: true });
  return NextResponse.json({ item: created }, { status: 201 });
}
