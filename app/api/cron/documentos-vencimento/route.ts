import { NextResponse } from 'next/server';

import { processarVencimentos } from '@/lib/ativos/documentos/alerta-job';

export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? '';

/** Aviso diário de vencimento de documento (spec 0013, AC-11): 08:00 de Belém, pelo container `cron`. */
export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret');
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const relatorio = await processarVencimentos();
    return NextResponse.json(relatorio);
  } catch (e) {
    console.error('[cron/documentos-vencimento] erro:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 },
    );
  }
}
