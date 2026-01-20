import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { UnitModel } from '@/models/unit';
import { UnitCreateSchema, UnitListQuerySchema } from '@/shared/units/unit.schemas';

export async function GET(req: Request) {
  await dbConnect();
  const { searchParams } = new URL(req.url);

  const parsed = UnitListQuerySchema.safeParse({
    q: searchParams.get('q') ?? '',
  });

  const q = parsed.success ? parsed.data.q.trim() : '';
  const filter: any = {};

  if (q) filter.$text = { $search: q };

  const items = await UnitModel.find(filter).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  await dbConnect();

  const raw = await req.json().catch(() => null);
  const parsed = UnitCreateSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const created = await UnitModel.create({
    ...parsed.data,
    responsibleEmail: parsed.data.responsibleEmail ?? '',
    responsiblePhone: parsed.data.responsiblePhone ?? '',
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
