import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import type { ReferenciaEntrada } from '@/shared/material/cotacao.schemas';
import { MESES_MAX_REFERENCIA, type PapelReferencia } from '@/shared/material/material.constants';
import { ERROS_FATIA4 } from '@/shared/material/mensagens';

import { insumosDoMes, type InsumoTabela, mesSinapiMaisRecente } from './precos';

/**
 * As referências de preço do caminho 3 (spec 0019, fatia 4, AC-32). A do
 * SINAPI só leva o código na entrada: preço, unidade e fonte vêm do mês mais
 * recente, nunca do que foi digitado (a mesma regra do AC-26). A livre leva
 * fonte, valor e data, com a data entre 12 meses atrás e hoje, em Belém.
 */

export type ReferenciaDoc = {
  _id: Types.ObjectId;
  tipo: 'sinapi' | 'livre';
  fonte: string;
  sinapiCodigo: string | null;
  sinapiReferencia: string | null;
  unidade: string | null;
  valorUnitarioCentavos: number;
  data: Date;
  incluidaPorUserId: Types.ObjectId | null;
  papel: PapelReferencia;
  em: Date | null;
  retiradaEm?: Date | null;
  retiradaPorUserId?: Types.ObjectId | null;
};

const FONTE_MAX = 200;

/** `AAAA-MM` como o fiscal lê: `MM/AAAA`. */
function mesLegivel(mes: string): string {
  return mes.split('-').reverse().join('/');
}

/** O que a tabela dá a uma referência SINAPI: fonte, unidade, preço e o dia 1 do mês. */
export function copiaDaReferenciaSinapi(insumo: InsumoTabela, mes: string) {
  return {
    fonte: `SINAPI ${insumo.codigo} (${mesLegivel(mes)}): ${insumo.descricao}`.slice(0, FONTE_MAX),
    sinapiCodigo: insumo.codigo,
    sinapiReferencia: mes,
    unidade: insumo.unidade,
    valorUnitarioCentavos: insumo.precoCentavos,
    data: new Date(`${mes}-01T12:00:00.000Z`),
  };
}

/** A data da referência livre não é futura nem passa de 12 meses antes de hoje (Belém). */
export function recusaDaDataDaReferencia(data: string, agora: Date): string | null {
  const hoje = hojeEmBelem(agora);
  if (data > hoje) return ERROS_FATIA4.data_referencia_futura;
  const [ano, mes, dia] = hoje.split('-');
  const limite = `${Number(ano) - MESES_MAX_REFERENCIA / 12}-${mes}-${dia}`;
  if (data < limite) return ERROS_FATIA4.data_referencia_antiga;
  return null;
}

/**
 * Monta as referências de uma entrada, todas do mesmo papel e autor. As já
 * gravadas com o mesmo id mantêm a hora da inclusão. Nunca lança.
 */
export async function montarReferencias(
  entradas: readonly ReferenciaEntrada[],
  autor: { userId: string; papel: PapelReferencia; agora: Date },
  gravadas: ReadonlyMap<string, { em?: Date | null }> = new Map(),
): Promise<{ ok: true; referencias: ReferenciaDoc[] } | { ok: false; error: string }> {
  const codigos = entradas.flatMap((r) => ('sinapiCodigo' in r ? [r.sinapiCodigo] : []));
  let mes: string | null = null;
  let insumos = new Map<string, InsumoTabela>();
  if (codigos.length) {
    mes = await mesSinapiMaisRecente();
    if (!mes) return { ok: false, error: ERROS_FATIA4.sem_sinapi };
    insumos = await insumosDoMes(mes, codigos);
  }
  const referencias: ReferenciaDoc[] = [];
  for (const r of entradas) {
    const comum = {
      _id: new Types.ObjectId(r.id),
      incluidaPorUserId: new Types.ObjectId(autor.userId),
      papel: autor.papel,
      em: gravadas.get(r.id)?.em ?? autor.agora,
      retiradaEm: null,
      retiradaPorUserId: null,
    };
    if ('sinapiCodigo' in r) {
      const insumo = insumos.get(r.sinapiCodigo);
      if (!insumo || !mes) {
        return { ok: false, error: `${ERROS_FATIA4.codigo_fora_do_mes} (${r.sinapiCodigo})` };
      }
      referencias.push({ ...comum, tipo: 'sinapi', ...copiaDaReferenciaSinapi(insumo, mes) });
      continue;
    }
    const recusa = recusaDaDataDaReferencia(r.data, autor.agora);
    if (recusa) return { ok: false, error: recusa };
    referencias.push({
      ...comum,
      tipo: 'livre',
      fonte: r.fonte,
      sinapiCodigo: null,
      sinapiReferencia: null,
      unidade: null,
      valorUnitarioCentavos: r.valorUnitarioCentavos,
      data: new Date(`${r.data}T12:00:00.000Z`),
    });
  }
  return { ok: true, referencias };
}

/** A cópia da referência que vai para a trilha (`itensNoAto` e `referenciaNoAto`). */
export function referenciaNoAto(r: {
  _id: unknown;
  tipo?: string | null;
  fonte: string;
  sinapiCodigo?: string | null;
  sinapiReferencia?: string | null;
  valorUnitarioCentavos: number;
  data: Date;
  papel?: string | null;
  retiradaEm?: Date | null;
}) {
  return {
    id: String(r._id),
    tipo: r.tipo ?? 'livre',
    fonte: r.fonte,
    sinapiCodigo: r.sinapiCodigo ?? null,
    sinapiReferencia: r.sinapiReferencia ?? null,
    valorUnitarioCentavos: r.valorUnitarioCentavos,
    data: r.data,
    papel: r.papel ?? 'responsavel_tecnico',
    retirada: !!r.retiradaEm,
  };
}
