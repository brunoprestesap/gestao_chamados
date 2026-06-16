import '@/models/ServiceType'; // Registra o modelo para populate('typeId')

import { MongoServerError } from 'mongodb';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { SubtypeCreateSchema } from '@/shared/catalog/subtype.schemas';

export async function GET(req: Request) {
  try {
    await dbConnect();
  } catch (err) {
    console.error('[GET /api/catalog/subtypes] dbConnect error:', err);
    return NextResponse.json({ error: 'Erro ao conectar ao banco de dados' }, { status: 503 });
  }

  try {
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
      _id: String(it._id),
      name: it.name,
      isActive: it.isActive,
      typeId: it.typeId?._id ? String(it.typeId._id) : '',
      typeName: it.typeId?.name ?? '',
    }));

    return NextResponse.json({ items });
  } catch (err) {
    console.error('[GET /api/catalog/subtypes]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar subtipos' },
      { status: 500 },
    );
  }
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

  const raw = await req.json().catch(() => null);
  const parsed = SubtypeCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await ServiceSubTypeModel.create(parsed.data);
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
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return NextResponse.json(
        { error: 'Já existe um subtipo com este nome neste tipo.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
