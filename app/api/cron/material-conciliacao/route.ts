import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { cancelarCotacoesDeChamadosEncerrados } from '@/lib/material/chamado';
import { conciliarReservas } from '@/lib/material/saldo';

/**
 * Conciliação diária das reservas de empenho (spec 0019, AC-8, AC-12):
 * primeiro termina o cancelamento da cotação de chamado já cancelado ou
 * recusado, depois libera a reserva cuja cotação não está autorizada,
 * executada ou atestada. Chamado pelo container `cron` com `x-cron-secret`.
 */
async function handler(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get('x-cron-secret') !== segredo) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    await dbConnect();
    // Falha aqui não pode custar a conciliação do dia: ela roda de qualquer jeito.
    let cotacoesCanceladas: number | null = null;
    try {
      cotacoesCanceladas = (await cancelarCotacoesDeChamadosEncerrados()).canceladas;
    } catch (e) {
      console.error('[cron] cancelamento das cotações de chamado encerrado falhou:', e);
    }
    const resumo = await conciliarReservas();
    return NextResponse.json({ ok: true, ...resumo, cotacoesCanceladas });
  } catch (e) {
    console.error('[cron] conciliação de material falhou:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
