import { NextResponse } from 'next/server';

import { paraCadaOrgaoAtivo, respostaDaRodada } from '@/lib/orgaos/cron';
import { processRecurringTickets } from '@/lib/recurring-job';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret');

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Spec 0025 (AC-13): uma volta por órgão ativo, cada uma no seu órgão.
    const resultado = await paraCadaOrgaoAtivo('cron/recurring-tickets', () =>
      processRecurringTickets(),
    );
    return respostaDaRodada(resultado);
  } catch (e) {
    console.error('[cron/recurring-tickets] Erro:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 },
    );
  }
}
