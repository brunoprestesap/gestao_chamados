import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';
import { UserCreateSchema } from '@/shared/users/user.schemas'; // ajuste o path conforme seu projeto

export async function POST(req: Request) {
  await dbConnect();

  const token = req.headers.get('x-bootstrap-token');

  console.log('ENV:', process.env.BOOTSTRAP_TOKEN);
  console.log('HEADER:', req.headers.get('x-bootstrap-token'));

  if (!process.env.BOOTSTRAP_TOKEN || token !== process.env.BOOTSTRAP_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Só permite se não existir nenhum usuário
  const count = await UserModel.countDocuments();
  if (count > 0) {
    return NextResponse.json({ error: 'Bootstrap já realizado' }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));

  // você pode usar o mesmo schema de create
  const parsed = UserCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const created = await UserModel.create({
    username: parsed.data.username,
    name: parsed.data.name,
    email: parsed.data.email ?? '',
    role: 'Admin', // força Admin no primeiro user
    unitId: parsed.data.unitId ?? null,
    passwordHash,
    isActive: true,
  });

  return NextResponse.json({
    item: {
      _id: String(created._id),
      username: created.username,
      name: created.name,
      email: created.email,
      role: created.role,
      unitId: created.unitId ? String(created.unitId) : null,
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
}
