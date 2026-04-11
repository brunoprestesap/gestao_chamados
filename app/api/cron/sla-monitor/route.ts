import { NextResponse } from 'next/server';

import { checkSlaEscalations } from '@/lib/sla-monitor';

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret');
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await checkSlaEscalations();
    return NextResponse.json(report);
  } catch (e) {
    console.error('[cron/sla-monitor] erro:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 },
    );
  }
}
