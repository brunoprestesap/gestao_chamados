import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireManager, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';
import { UserUpdateSchema } from '@/shared/users/user.schemas';

function normalizeUser(u: any) {
  return {
    _id: String(u._id),
    username: u.username,
    name: u.name,
    email: u.email ?? '',
    role: u.role,
    unitId: u.unitId ? String(u.unitId) : null,
    isActive: !!u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const user = await UserModel.findById(id).lean();

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Qualquer usuário autenticado pode ver dados básicos de outros usuários
  // (necessário para exibir nomes no histórico)
  return NextResponse.json({ item: normalizeUser(user) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = UserUpdateSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Se trocar username, precisa garantir unicidade
  if (data.username) {
    const exists = await UserModel.findOne({
      username: data.username,
      _id: { $ne: id },
    }).lean();
    if (exists) {
      return NextResponse.json({ error: 'Matrícula já cadastrada' }, { status: 409 });
    }
  }

  const update: any = {};
  if (data.username !== undefined) update.username = data.username;
  if (data.name !== undefined) update.name = data.name;
  if (data.email !== undefined) update.email = data.email;
  if (data.role !== undefined) update.role = data.role;
  if (data.unitId !== undefined)
    update.unitId = data.unitId ? new Types.ObjectId(data.unitId) : undefined;
  if (data.isActive !== undefined) update.isActive = data.isActive;

  if (data.password) {
    update.passwordHash = await bcrypt.hash(data.password, 10);
  }

  const updated = await UserModel.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!updated) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  return NextResponse.json({ item: normalizeUser(updated) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const deleted = await UserModel.findByIdAndDelete(id).lean();
  if (!deleted) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
