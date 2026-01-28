import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoCreateSchema, ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';

function normalizeChamado(c: {
  _id: unknown;
  titulo: string;
  descricao?: string;
  status: string;
  solicitanteId: unknown;
  unitId?: unknown;
  localExato?: string;
  tipoServico?: string;
  naturezaAtendimento?: string;
  grauUrgencia?: string;
  telefoneContato?: string;
  subtypeId?: unknown;
  catalogServiceId?: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    _id: String(c._id),
    titulo: c.titulo,
    descricao: c.descricao ?? '',
    status: c.status,
    solicitanteId: c.solicitanteId ? String(c.solicitanteId) : null,
    unitId: c.unitId ? String(c.unitId) : null,
    localExato: c.localExato ?? '',
    tipoServico: c.tipoServico ?? '',
    naturezaAtendimento: c.naturezaAtendimento ?? '',
    grauUrgencia: c.grauUrgencia ?? 'Normal',
    telefoneContato: c.telefoneContato ?? '',
    subtypeId: c.subtypeId ? String(c.subtypeId) : null,
    catalogServiceId: c.catalogServiceId ? String(c.catalogServiceId) : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function GET(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  await dbConnect();

  const url = new URL(req.url);
  const parsed = ChamadoListQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    status: url.searchParams.get('status') ?? 'all',
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, status } = parsed.data;
  const filter: Record<string, unknown> = {
    solicitanteId: new Types.ObjectId(session.userId),
  };

  if (status !== 'all') filter.status = status;

  if (q.trim()) {
    const term = q.trim();
    filter.$or = [
      { titulo: { $regex: term, $options: 'i' } },
      { descricao: { $regex: term, $options: 'i' } },
      { localExato: { $regex: term, $options: 'i' } },
    ];
  }

  const items = await ChamadoModel.find(filter).sort({ updatedAt: -1 }).lean();

  return NextResponse.json({ items: items.map(normalizeChamado) });
}

export async function POST(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const parsed = ChamadoCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Gera título automático se não fornecido
  const titulo =
    data.titulo ||
    `${data.tipoServico}${data.localExato ? ` — ${data.localExato}` : ''}${data.naturezaAtendimento === 'Urgente' ? ' [URGENTE]' : ''}`;

  const doc = await ChamadoModel.create({
    titulo,
    descricao: data.descricao,
    unitId: new Types.ObjectId(data.unitId),
    localExato: data.localExato,
    tipoServico: data.tipoServico,
    naturezaAtendimento: data.naturezaAtendimento,
    grauUrgencia: data.grauUrgencia,
    telefoneContato: data.telefoneContato ?? '',
    subtypeId: data.subtypeId ? new Types.ObjectId(data.subtypeId) : undefined,
    catalogServiceId: data.catalogServiceId ? new Types.ObjectId(data.catalogServiceId) : undefined,
    status: 'aberto',
    solicitanteId: new Types.ObjectId(session.userId),
  });

  return NextResponse.json(normalizeChamado(doc.toObject()), { status: 201 });
}
