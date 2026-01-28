import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';
import { UserCreateSchema, UserListQuerySchema } from '@/shared/users/user.schemas';

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

export async function GET(req: Request) {
  await requireManager();
  await dbConnect();

  const url = new URL(req.url);
  const parsed = UserListQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    role: url.searchParams.get('role') ?? undefined,
    unitId: url.searchParams.get('unitId') ?? undefined,
    status: url.searchParams.get('status') ?? 'all',
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, role, unitId, status } = parsed.data;

  const filter: any = {};
  if (role) filter.role = role;
  if (unitId) filter.unitId = new Types.ObjectId(unitId);
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  if (q.trim()) {
    const term = q.trim();
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { username: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }

  const items = await UserModel.find(filter).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ items: items.map(normalizeUser) });
}

export async function POST(req: Request) {
  await requireManager();
  await dbConnect();

  const raw = await req.json().catch(() => ({}));
  const parsed = UserCreateSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const exists = await UserModel.findOne({ username: data.username }).lean();
  if (exists) {
    return NextResponse.json({ error: 'Matrícula já cadastrada' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const created = await UserModel.create({
    username: data.username,
    name: data.name,
    email: data.email,
    role: data.role,
    unitId: data.unitId ? new Types.ObjectId(data.unitId) : undefined,
    passwordHash,
    isActive: data.isActive,
  });

  return NextResponse.json({ item: normalizeUser(created) }, { status: 201 });
}
