import { NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { requireAdmin, requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { SlaConfigModel } from '@/models/SlaConfig';
import {
  SlaConfigSaveSchema,
  toMinutes,
  type SlaTimeUnit,
} from '@/shared/sla/sla-config.schemas';
import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';

/**
 * GET /api/sla/configs
 * Lista configurações de SLA ativas (uma por prioridade). Admin e Preposto podem ler (para exibir no modal de classificação).
 */
export async function GET() {
  try {
    await requireManager();
    await dbConnect();

    const configs = await SlaConfigModel.find({ isActive: true })
      .sort({ priority: 1 })
      .lean();

    const byPriority: Record<string, (typeof configs)[0]> = {};
    configs.forEach((c) => {
      byPriority[c.priority] = c;
    });

    const items = FINAL_PRIORITY_VALUES.map((priority) => {
      const c = byPriority[priority];
      if (!c) {
        return {
          priority,
          responseTargetMinutes: null,
          resolutionTargetMinutes: null,
          businessHoursOnly: true,
          version: null,
          updatedAt: null,
          updatedByUserId: null,
        };
      }
      return {
        priority: c.priority,
        responseTargetMinutes: c.responseTargetMinutes,
        resolutionTargetMinutes: c.resolutionTargetMinutes,
        businessHoursOnly: c.businessHoursOnly,
        version: c.version ?? null,
        updatedAt: c.updatedAt ?? null,
        updatedByUserId: c.updatedByUserId ? String(c.updatedByUserId) : null,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error('GET /api/sla/configs:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao listar configurações SLA' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/sla/configs
 * Salva configurações de SLA (uma por prioridade). Admin only.
 */
export async function PUT(req: Request) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const parsed = SlaConfigSaveSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.configs?.[0] ?? first.configs ?? 'Dados inválidos. Verifique os campos.';
      return NextResponse.json(
        { error: Array.isArray(msg) ? msg[0] : msg },
        { status: 400 },
      );
    }

    await dbConnect();
    const userId = new Types.ObjectId(session.userId);
    const now = new Date();
    const version = `v${Date.now()}`;

    for (const item of parsed.data.configs) {
      const responseTargetMinutes = toMinutes(item.responseValue, item.responseUnit as SlaTimeUnit);
      const resolutionTargetMinutes = toMinutes(item.resolutionValue, item.resolutionUnit as SlaTimeUnit);

      await SlaConfigModel.findOneAndUpdate(
        { priority: item.priority },
        {
          $set: {
            priority: item.priority,
            responseTargetMinutes,
            resolutionTargetMinutes,
            businessHoursOnly: item.businessHoursOnly,
            isActive: true,
            version,
            updatedAt: now,
            updatedByUserId: userId,
          },
        },
        { upsert: true, new: true },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/sla/configs:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao salvar configurações SLA' },
      { status: 500 },
    );
  }
}
