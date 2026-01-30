import '@/models/ServiceType';
import '@/models/ServiceSubType';

import { MongoServerError } from 'mongodb';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceListQuerySchema } from '@/shared/catalog/service.schemas';

export async function GET(req: Request) {
  await dbConnect();
  const { searchParams } = new URL(req.url);

  const parsed = ServiceListQuerySchema.safeParse({
    q: searchParams.get('q') ?? '',
    typeId: searchParams.get('typeId') ?? '',
    subtypeId: searchParams.get('subtypeId') ?? '',
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, typeId, subtypeId } = parsed.data;

  const filter: Record<string, any> = {};
  if (typeId) filter.typeId = typeId;
  if (subtypeId) filter.subtypeId = subtypeId;
  if (q) {
    filter.$or = [
      { code: new RegExp(q, 'i') },
      { name: new RegExp(q, 'i') },
      { description: new RegExp(q, 'i') },
    ];
  }

  const items = await ServiceCatalogModel.find(filter)
    .sort({ createdAt: -1 })
    .populate({ path: 'typeId', select: 'name' })
    .populate({ path: 'subtypeId', select: 'name' })
    .lean();

  // normaliza para o front (fica bem legível)
  const normalized = items.map((it: any) => ({
    ...it,
    type: it.typeId ? { id: String(it.typeId._id), name: it.typeId.name } : null,
    subtype: it.subtypeId ? { id: String(it.subtypeId._id), name: it.subtypeId.name } : null,
    typeId: String(it.typeId?._id ?? it.typeId),
    subtypeId: String(it.subtypeId?._id ?? it.subtypeId),
  }));

  return NextResponse.json({ items: normalized });
}

export async function POST(req: Request) {
  await dbConnect();

  const body = await req.json();

  // validação simples no servidor (a UI também valida)
  const required = ['code', 'name', 'typeId', 'subtypeId'];
  for (const k of required) {
    if (!body?.[k] || String(body[k]).trim() === '') {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  try {
    const created = await ServiceCatalogModel.create({
      code: String(body.code).trim(),
      name: String(body.name).trim(),
      typeId: String(body.typeId).trim(),
      subtypeId: String(body.subtypeId).trim(),
      description: body.description ? String(body.description).trim() : '',
      priorityDefault: body.priorityDefault || 'Normal',
      estimatedHours: Number(body.estimatedHours ?? 0),
      materials: body.materials ? String(body.materials).trim() : '',
      procedure: body.procedure ? String(body.procedure).trim() : '',
      isActive: body.isActive ?? true,
    });

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      const field = err.keyValue?.code != null ? 'code' : Object.keys(err.keyValue ?? {})[0];
      if (field === 'code') {
        return NextResponse.json(
          { error: 'Já existe um serviço com este código. Escolha outro código.' },
          { status: 409 },
        );
      }
    }
    throw err;
  }
}
