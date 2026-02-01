import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { HolidayModel } from '@/models/Holiday';
import {
  HolidayCreateSchema,
  HolidayListQuerySchema,
} from '@/shared/holidays/holiday.schemas';

/**
 * GET /api/holidays — Lista feriados. Admin only.
 * Query: q (busca por nome), year (filtro por ano YYYY)
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const parsed = HolidayListQuerySchema.safeParse({
      q: searchParams.get('q') ?? '',
      year: searchParams.get('year') ?? undefined,
    });

    const q = parsed.success ? parsed.data.q.trim() : '';
    const year = parsed.success ? parsed.data.year : undefined;

    const filter: Record<string, unknown> = {};
    if (q) filter.name = { $regex: q, $options: 'i' };
    if (year && /^\d{4}$/.test(year)) {
      filter.date = { $regex: `^${year}-`, $options: 'i' };
    }

    const items = await HolidayModel.find(filter)
      .sort({ date: 1 })
      .lean();

    return NextResponse.json({
      items: items.map((d) => ({
        _id: String(d._id),
        date: d.date,
        name: d.name,
        scope: d.scope,
        isActive: d.isActive,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (e) {
    console.error('GET /api/holidays:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao listar feriados' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/holidays — Cria feriado. Admin only.
 */
export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => null);
    const parsed = HolidayCreateSchema.safeParse(raw);

    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.date?.[0] ?? first.name?.[0] ?? first.scope?.[0] ?? 'Dados inválidos.';
      return NextResponse.json(
        { error: Array.isArray(msg) ? msg[0] : msg },
        { status: 400 },
      );
    }

    await dbConnect();
    const userId = new Types.ObjectId(session.userId);

    const existing = await HolidayModel.findOne({
      date: parsed.data.date,
      scope: parsed.data.scope,
    });
    if (existing) {
      return NextResponse.json(
        { error: `Já existe um feriado cadastrado para a data ${parsed.data.date} (${parsed.data.scope}).` },
        { status: 409 },
      );
    }

    const created = await HolidayModel.create({
      ...parsed.data,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    return NextResponse.json(
      {
        item: {
          _id: String(created._id),
          date: created.date,
          name: created.name,
          scope: created.scope,
          isActive: created.isActive,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('POST /api/holidays:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao criar feriado' },
      { status: 500 },
    );
  }
}
