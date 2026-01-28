import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';

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
