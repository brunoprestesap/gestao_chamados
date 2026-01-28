import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { generateTicketNumber } from '@/lib/chamado-utils';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { ChamadoCreateSchema, ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';

function normalizeChamado(c: {
  _id: unknown;
  ticket_number?: string;
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
    ticket_number: c.ticket_number ?? '',
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
      { ticket_number: { $regex: term, $options: 'i' } },
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

  // Gera número único do ticket
  const ticket_number = await generateTicketNumber();

  if (!ticket_number || ticket_number.trim() === '') {
    return NextResponse.json({ error: 'Falha ao gerar número do ticket' }, { status: 500 });
  }

  console.log('Gerando ticket_number:', ticket_number);

  // Prepara os dados do chamado
  const chamadoData = {
    ticket_number: ticket_number.trim(),
    titulo,
    descricao: data.descricao,
    unitId: new Types.ObjectId(data.unitId),
    localExato: data.localExato,
    tipoServico: data.tipoServico,
    naturezaAtendimento: data.naturezaAtendimento,
    grauUrgencia: data.grauUrgencia,
    telefoneContato: data.telefoneContato ?? '',
    subtypeId:
      data.subtypeId && data.subtypeId.trim() !== ''
        ? new Types.ObjectId(data.subtypeId)
        : undefined,
    catalogServiceId:
      data.catalogServiceId && data.catalogServiceId.trim() !== ''
        ? new Types.ObjectId(data.catalogServiceId)
        : undefined,
    status: 'aberto' as const,
    solicitanteId: new Types.ObjectId(session.userId),
  };

  console.log('Dados do chamado a serem criados:', {
    ...chamadoData,
    solicitanteId: String(chamadoData.solicitanteId),
    unitId: String(chamadoData.unitId),
  });

  const doc = await ChamadoModel.create(chamadoData);

  // Cria registro de histórico para auditoria
  await ChamadoHistoryModel.create({
    chamadoId: doc._id,
    userId: new Types.ObjectId(session.userId),
    action: 'abertura',
    statusAnterior: null,
    statusNovo: 'aberto',
    observacoes: `Chamado criado: ${titulo}`,
  });

  const docObject = doc.toObject();
  console.log('Chamado criado com sucesso:', {
    _id: docObject._id,
    ticket_number: docObject.ticket_number,
  });

  return NextResponse.json(normalizeChamado(docObject), { status: 201 });
}
