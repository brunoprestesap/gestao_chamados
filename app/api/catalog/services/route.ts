import '@/models/ServiceType';
import '@/models/ServiceSubType';

import { MongoServerError } from 'mongodb';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import {
  buildServiceCode,
  extractSequential,
  getCodePrefixFromSubtypeName,
} from '@/lib/service-code';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
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

  // Garantir que nunca usamos code do body - sempre geramos no backend
  delete body.code;

  // validação: code é gerado automaticamente, não enviado pelo cliente
  const required = ['name', 'typeId', 'subtypeId'];
  for (const k of required) {
    if (!body?.[k] || String(body[k]).trim() === '') {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  const subtypeId = String(body.subtypeId).trim();
  const subtype = await ServiceSubTypeModel.findById(subtypeId).lean();
  if (!subtype) {
    return NextResponse.json({ error: 'Subtipo não encontrado' }, { status: 400 });
  }

  const prefix = getCodePrefixFromSubtypeName(subtype.name);

  // Busca todos os serviços com esse prefixo para obter o maior sequencial
  const withPrefix = await ServiceCatalogModel.find({
    code: new RegExp(`^${prefix}-\\d+$`),
  })
    .select('code')
    .lean();

  const maxSeq =
    withPrefix.length === 0
      ? 0
      : Math.max(...withPrefix.map((d) => extractSequential((d as { code: string }).code)));
  const nextSeq = maxSeq + 1;

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = buildServiceCode(prefix, nextSeq + attempt);

    try {
      const created = await ServiceCatalogModel.create({
        code,
        name: String(body.name).trim(),
        typeId: String(body.typeId).trim(),
        subtypeId,
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
        if (field === 'code' && attempt < maxRetries - 1) {
          continue; // retry com próximo número
        }
        return NextResponse.json(
          { error: 'Já existe um serviço com este código. Tente novamente.' },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  return NextResponse.json(
    { error: 'Não foi possível gerar código único. Tente novamente.' },
    { status: 500 },
  );
}
