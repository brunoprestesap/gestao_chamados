import 'server-only';

import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { OrgaoModel } from '@/models/Orgao';

import { comOrgao } from './contexto';

/** O que o cron precisa saber de cada órgão: nada além do id e da sigla. */
export type OrgaoDaRodada = { id: string; sigla: string };

/** Texto fixo da falha na resposta: o erro em si vai só para o log. */
export const ERRO_DA_RODADA = 'A rodada falhou neste órgão; detalhes no log do servidor.';

export type ResultadoDaRodada<R> = {
  /** `true` só quando havia órgão ativo e todos rodaram até o fim. */
  ok: boolean;
  /** Resumo de cada órgão pela sigla; a falha vira `{ erro }` com texto fixo. */
  porOrgao: Record<string, R | { erro: string }>;
};

/**
 * Roda `fn` uma vez por órgão ativo, um de cada vez, em ordem de sigla, cada
 * volta dentro de `comOrgao` (spec 0025, AC-13). A falha de um órgão é
 * registrada no log e não impede os outros.
 *
 * `rotulo` só identifica a rodada no log (por exemplo, `cron/sla-monitor`).
 */
export async function paraCadaOrgaoAtivo<R>(
  rotulo: string,
  fn: (orgao: OrgaoDaRodada) => Promise<R>,
): Promise<ResultadoDaRodada<R>> {
  await dbConnect();
  // `Orgao` é modelo de plataforma: a leitura não passa pelo filtro do plugin.
  const orgaos = await OrgaoModel.find({ ativo: true })
    .sort({ sigla: 1 })
    .select('_id sigla')
    .lean();

  const porOrgao: ResultadoDaRodada<R>['porOrgao'] = {};
  let falhou = false;
  for (const o of orgaos) {
    const orgao = { id: String(o._id), sigla: o.sigla };
    try {
      porOrgao[orgao.sigla] = await comOrgao(orgao.id, () => fn(orgao));
    } catch (e) {
      falhou = true;
      console.error(`[${rotulo}] a rodada falhou no órgão ${orgao.sigla}:`, e);
      porOrgao[orgao.sigla] = { erro: ERRO_DA_RODADA };
    }
  }
  if (orgaos.length === 0) {
    console.error(`[${rotulo}] nenhum órgão ativo; a rodada não rodou.`);
  }
  return { ok: orgaos.length > 0 && !falhou, porOrgao };
}

/** A resposta HTTP da rodada: 200 com todos rodando, 500 com falha ou sem órgão ativo. */
export function respostaDaRodada<R>(resultado: ResultadoDaRodada<R>): NextResponse {
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
