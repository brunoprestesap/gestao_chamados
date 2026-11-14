import { NextResponse } from 'next/server';

import { executarEncerramentoAutomatico } from '@/lib/chamados/encerramento-automatico';
import { paraCadaOrgaoAtivo, respostaDaRodada } from '@/lib/orgaos/cron';

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? '';

/**
 * POST /api/cron/encerramento-automatico (spec 0010, AC-6 e AC-7).
 * O container `cron` chama a cada 15 minutos com o header `x-cron-secret`.
 */
export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret');
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Spec 0025 (AC-13): uma volta por órgão ativo, cada uma no seu órgão.
    const resultado = await paraCadaOrgaoAtivo('cron/encerramento-automatico', () =>
      executarEncerramentoAutomatico(),
    );
    return respostaDaRodada(resultado);
  } catch (e) {
    console.error('[cron/encerramento-automatico] erro:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 },
    );
  }
}
