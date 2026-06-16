import { MongoServerError } from 'mongodb';
import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceTypeModel } from '@/models/ServiceType';
import { TypeUpdateSchema } from '@/shared/catalog/type.schemas';

async function requireAdminApi() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (session.role !== 'Admin') {
    return NextResponse.json({ error: 'Apenas usuário Admin' }, { status: 403 });
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const item = await ServiceTypeModel.findById(id).lean();
  if (!item) return NextResponse.json({ error: 'Tipo não encontrado' }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = TypeUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await ServiceTypeModel.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true, runValidators: true },
    );
    if (!updated) return NextResponse.json({ error: 'Tipo não encontrado' }, { status: 404 });
    return NextResponse.json({ item: updated });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      return NextResponse.json({ error: 'Já existe um tipo com este nome.' }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  // Bloqueio referencial: não permite excluir tipo em uso por subtipos ou serviços.
  const [hasSubtypes, hasServices] = await Promise.all([
    ServiceSubTypeModel.exists({ typeId: id }),
    ServiceCatalogModel.exists({ typeId: id }),
  ]);

  if (hasSubtypes || hasServices) {
    return NextResponse.json(
      { error: 'Não é possível excluir: existem subtipos ou serviços vinculados a este tipo.' },
      { status: 409 },
    );
  }

  const deleted = await ServiceTypeModel.findByIdAndDelete(id);
  if (!deleted) return NextResponse.json({ error: 'Tipo não encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
