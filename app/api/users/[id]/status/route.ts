import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const isActive = raw?.isActive;

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive deve ser boolean' }, { status: 400 });
  }

  const updated = await UserModel.findByIdAndUpdate(id, { isActive }, { new: true }).lean();

  if (!updated) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      _id: String(updated._id),
      username: updated.username,
      name: updated.name,
      email: updated.email ?? '',
      role: updated.role,
      unitId: updated.unitId ? String(updated.unitId) : null,
      isActive: !!updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
}
