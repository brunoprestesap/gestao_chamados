import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';

export async function GET(req: Request) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const typeId = (searchParams.get('typeId') || '').trim();

  const filter: Record<string, unknown> = {};
  if (typeId) filter.typeId = typeId;

  const raw = await ServiceSubTypeModel.find(filter)
    .sort({ name: 1 })
    .populate('typeId', 'name')
    .lean();

  type Populated = (typeof raw)[0] & { typeId?: { _id: unknown; name: string } | null };
  const items = (raw as Populated[]).map((it) => ({
    _id: it._id,
    name: it.name,
    isActive: it.isActive,
    typeName: it.typeId?.name ?? '',
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (session.role !== 'Admin') {
    return NextResponse.json(
      { error: 'Apenas usuário Admin pode cadastrar novo subtipo' },
      { status: 403 },
    );
  }

  await dbConnect();
  const body = await req.json();

  const typeId = String(body?.typeId || '').trim();
  const name = String(body?.name || '').trim();

  if (!typeId) return NextResponse.json({ error: 'Missing typeId' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const created = await ServiceSubTypeModel.create({ typeId, name, isActive: true });
  return NextResponse.json(
    {
      item: {
        _id: String(created._id),
        name: created.name,
        typeId: String(created.typeId),
        isActive: created.isActive,
      },
    },
    { status: 201 },
  );
}
