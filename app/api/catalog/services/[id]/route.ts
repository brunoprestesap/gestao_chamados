import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceUpdateSchema } from '@/shared/catalog/service.schemas';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  await dbConnect();
  const raw = await req.json();

  const parsed = ServiceUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await ServiceCatalogModel.findByIdAndUpdate(params.id, parsed.data, {
    new: true,
  });

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ item: updated });
}
