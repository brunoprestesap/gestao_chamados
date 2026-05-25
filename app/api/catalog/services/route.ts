import '@/models/ServiceType';
import '@/models/ServiceSubType';

import { MongoServerError } from 'mongodb';
import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { escapeRegex } from '@/lib/regex';
import {
  buildServiceCode,
  extractSequential,
  getCodePrefixFromSubtypeName,
} from '@/lib/service-code';
import { type ServiceCatalog, ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceListQuerySchema } from '@/shared/catalog/service.schemas';

type PopulatedNameRef = { _id: Types.ObjectId; name: string };

function populatedPair(
  ref: Types.ObjectId | PopulatedNameRef | null | undefined,
): { id: string; name: string } | null {
  if (ref == null) return null;
  if (typeof ref === 'object' && 'name' in ref) {
    const r = ref as PopulatedNameRef;
    return { id: String(r._id), name: r.name };
  }
  return null;
}

function refObjectIdString(ref: Types.ObjectId | PopulatedNameRef | null | undefined): string {
  if (ref == null) return '';
  if (typeof ref === 'object' && '_id' in ref) {
    return String((ref as PopulatedNameRef)._id);
  }
  return String(ref);
}

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

  type CatalogLean = ServiceCatalog & {
    typeId?: ServiceCatalog['typeId'] | PopulatedNameRef;
    subtypeId?: ServiceCatalog['subtypeId'] | PopulatedNameRef;
  };

  const filter: Record<string, unknown> = {};
  if (typeId) filter.typeId = typeId;
  if (subtypeId) filter.subtypeId = subtypeId;
  if (q) {
    const term = escapeRegex(q);
    filter.$or = [
      { code: new RegExp(term, 'i') },
      { name: new RegExp(term, 'i') },
      { description: new RegExp(term, 'i') },
    ];
  }

  const items = await ServiceCatalogModel.find(filter)
    .sort({ createdAt: -1 })
    .populate({ path: 'typeId', select: 'name' })
    .populate({ path: 'subtypeId', select: 'name' })
    .lean();

  // normaliza para o front (fica bem legível)
  const normalized = items.map((it: CatalogLean) => ({
    ...it,
    type: populatedPair(it.typeId),
    subtype: populatedPair(it.subtypeId),
    typeId: refObjectIdString(it.typeId),
    subtypeId: refObjectIdString(it.subtypeId),
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
