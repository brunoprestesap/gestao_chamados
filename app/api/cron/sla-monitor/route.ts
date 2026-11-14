import { NextResponse } from 'next/server';

import { paraCadaOrgaoAtivo, respostaDaRodada } from '@/lib/orgaos/cron';
import { checkSlaEscalations } from '@/lib/sla-monitor';

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret');
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Spec 0025 (AC-13): uma volta por órgão ativo, cada uma no seu órgão.
    const resultado = await paraCadaOrgaoAtivo('cron/sla-monitor', () => checkSlaEscalations());
    return respostaDaRodada(resultado);
  } catch (e) {
    console.error('[cron/sla-monitor] erro:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 },
    );
  }
}
