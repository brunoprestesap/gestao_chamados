import { NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { requireAdmin, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { BusinessCalendarModel } from '@/models/BusinessCalendar';
import { ExpedienteConfigSchema } from '@/shared/config/expediente.schemas';

/**
 * GET /api/config/expediente
 * Retorna a configuração institucional (timezone, expediente, dias úteis).
 * Qualquer usuário autenticado pode ler (para formatação de datas).
 * PUT exige Admin.
 */
export async function GET() {
  try {
    await requireSession();
    const config = await getBusinessCalendarConfig();
    return NextResponse.json(config);
  } catch (e) {
    console.error('GET /api/config/expediente:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao obter configuração' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/config/expediente
 * Salva a configuração institucional. Admin only.
 * Mantém um único documento (upsert).
 */
export async function PUT(req: Request) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const parsed = ExpedienteConfigSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.timezone?.[0] ??
        first.workdayStart?.[0] ??
        first.workdayEnd?.[0] ??
        first.weekdays?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return NextResponse.json({ error: Array.isArray(msg) ? msg[0] : msg }, { status: 400 });
    }

    await dbConnect();
    const userId = new Types.ObjectId(session.userId);

    await BusinessCalendarModel.findOneAndUpdate(
      {},
      {
        $set: {
          timezone: parsed.data.timezone,
          workdayStart: parsed.data.workdayStart,
          workdayEnd: parsed.data.workdayEnd,
          weekdays: parsed.data.weekdays,
          updatedByUserId: userId,
        },
      },
      { upsert: true, new: true },
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/config/expediente:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao salvar configuração' },
      { status: 500 },
    );
  }
}
