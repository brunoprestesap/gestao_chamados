import { MongoServerError } from 'mongodb';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ServiceTypeModel } from '@/models/ServiceType';
import { TypeCreateSchema } from '@/shared/catalog/type.schemas';

export async function GET() {
  await dbConnect();
  const items = await ServiceTypeModel.find().sort({ name: 1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (session.role !== 'Admin') {
    return NextResponse.json(
      { error: 'Apenas usuário Admin pode cadastrar tipo de serviço' },
      { status: 403 },
    );
  }

  await dbConnect();

  const raw = await req.json().catch(() => null);
  const parsed = TypeCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await ServiceTypeModel.create(parsed.data);
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return NextResponse.json({ error: 'Já existe um tipo com este nome.' }, { status: 409 });
    }
    throw err;
  }
}
