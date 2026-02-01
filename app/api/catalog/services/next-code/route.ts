import '@/models/ServiceType';
import '@/models/ServiceSubType';

import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import {
  buildServiceCode,
  extractSequential,
  getCodePrefixFromSubtypeName,
} from '@/lib/service-code';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';

/**
 * GET /api/catalog/services/next-code?subtypeId=xxx
 * Retorna o próximo código estimado para o subtipo (para preview no frontend).
 */
export async function GET(req: Request) {
  await dbConnect();

  const { searchParams } = new URL(req.url);
  const subtypeId = searchParams.get('subtypeId')?.trim();

  if (!subtypeId) {
    return NextResponse.json({ error: 'subtypeId é obrigatório' }, { status: 400 });
  }

  const subtype = await ServiceSubTypeModel.findById(subtypeId).lean();
  if (!subtype) {
    return NextResponse.json({ error: 'Subtipo não encontrado' }, { status: 404 });
  }

  const prefix = getCodePrefixFromSubtypeName(subtype.name);

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
  const nextCode = buildServiceCode(prefix, nextSeq);

  return NextResponse.json({ nextCode });
}
