import { MongoServerError } from 'mongodb';
import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { SubtypeUpdateSchema } from '@/shared/catalog/subtype.schemas';

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

  const item = await ServiceSubTypeModel.findById(id).lean();
  if (!item) {
    return NextResponse.json({ error: 'Subtipo não encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      _id: String(item._id),
      name: item.name,
      typeId: String(item.typeId),
      isActive: item.isActive,
    },
  });
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
  const parsed = SubtypeUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await ServiceSubTypeModel.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true, runValidators: true },
    );
    if (!updated) return NextResponse.json({ error: 'Subtipo não encontrado' }, { status: 404 });
    return NextResponse.json({
      item: {
        _id: String(updated._id),
        name: updated.name,
        typeId: String(updated.typeId),
        isActive: updated.isActive,
      },
    });
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  // Bloqueio referencial: não permite excluir subtipo em uso por serviços ou chamados.
  const [hasServices, hasTickets] = await Promise.all([
    ServiceCatalogModel.exists({ subtypeId: id }),
    ChamadoModel.exists({ subtypeId: id }),
  ]);

  if (hasServices || hasTickets) {
    return NextResponse.json(
      { error: 'Não é possível excluir: existem serviços ou chamados vinculados a este subtipo.' },
      { status: 409 },
    );
  }

  const deleted = await ServiceSubTypeModel.findByIdAndDelete(id);
  if (!deleted) return NextResponse.json({ error: 'Subtipo não encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
