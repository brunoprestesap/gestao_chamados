import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { avisarChecagensAtrasadas, avisarPesquisasAtrasadas } from '@/lib/material/avisos';
import {
  cancelarCotacoesDeChamadosEncerrados,
  fecharPausasDeCotacoesEncerradas,
} from '@/lib/material/chamado';
import { conciliarReservas } from '@/lib/material/saldo';

/**
 * Conciliação diária das reservas de empenho (spec 0019, AC-8, AC-12):
 * primeiro termina o cancelamento da cotação de chamado já cancelado ou
 * recusado, fecha a pausa do chamado que ficou presa a uma cotação já
 * encerrada (item 37 do escopo), depois libera a reserva cuja cotação não está autorizada,
 * executada ou atestada. Por fim, avisa os gestores da urgência com a
 * pesquisa de preços atrasada. Chamado pelo container `cron` com `x-cron-secret`.
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
    // Item 37 do escopo: a pausa que ficou presa à cotação quando a retomada desistiu.
    let pausasFechadas: number | null = null;
    try {
      pausasFechadas = (await fecharPausasDeCotacoesEncerradas()).fechadas;
    } catch (e) {
      console.error('[cron] fechamento das pausas presas às cotações falhou:', e);
    }
    const resumo = await conciliarReservas();
    // O aviso é o menos importante da rodada: a falha só vai para o log.
    let pesquisasAtrasadas: number | null = null;
    try {
      pesquisasAtrasadas = (await avisarPesquisasAtrasadas()).avisadas;
    } catch (e) {
      console.error('[cron] aviso de pesquisa atrasada falhou:', e);
    }
    // Spec 0024 (AC-16): a checagem de prazo vencido, só aviso, nada é liberado.
    let checagensAtrasadas: number | null = null;
    try {
      checagensAtrasadas = (await avisarChecagensAtrasadas()).avisadas;
    } catch (e) {
      console.error('[cron] aviso de checagem atrasada falhou:', e);
    }
    return NextResponse.json({
      ok: true,
      ...resumo,
      cotacoesCanceladas,
      pausasFechadas,
      pesquisasAtrasadas,
      checagensAtrasadas,
    });
  } catch (e) {
    console.error('[cron] conciliação de material falhou:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
