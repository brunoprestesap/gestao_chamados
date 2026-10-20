import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem, somarDias } from '@/lib/ativos/documentos/situacao';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import {
  PROJECAO_DIAS_MAX,
  PROJECAO_DIAS_MIN,
  type SituacaoProjecao,
} from '@/shared/material/material.constants';

/**
 * Projeção de esgotamento do empenho (spec 0019, AC-38). O consumo líquido é
 * a soma de `valorCentavos` dos eventos da trilha naquele empenho (reservas
 * positivas, liberações negativas); reforço e anulação não são eventos e
 * ficam fora. O período é o menor entre 90 dias e o tempo desde o primeiro
 * evento; com menos de 30 dias, "histórico insuficiente".
 */

const MS_DIA = 24 * 60 * 60 * 1000;

export type Projecao = {
  empenhoId: string;
  saldoCentavos: number;
  mediaDiariaCentavos: number | null;
  /** `YYYY-MM-DD` em Belém; só na situação `estimada`. */
  dataEstimada: string | null;
  situacao: SituacaoProjecao;
};

/** A conta pura, sobre os eventos já lidos. */
export function calcularProjecao(p: {
  primeiroEventoEm: Date | null;
  eventos: readonly { em: Date; valorCentavos: number }[];
  saldoCentavos: number;
  agora: Date;
}): Omit<Projecao, 'empenhoId' | 'saldoCentavos'> {
  const insuficiente = {
    mediaDiariaCentavos: null,
    dataEstimada: null,
    situacao: 'historico_insuficiente' as const,
  };
  if (!p.primeiroEventoEm) return insuficiente;
  // O período começa no primeiro evento, ou 90 dias atrás se ele for mais antigo.
  const inicio = Math.max(
    p.primeiroEventoEm.getTime(),
    p.agora.getTime() - PROJECAO_DIAS_MAX * MS_DIA,
  );
  const dias = (p.agora.getTime() - inicio) / MS_DIA;
  if (dias < PROJECAO_DIAS_MIN) return insuficiente;
  const consumo = p.eventos
    .filter((e) => e.em.getTime() >= inicio && e.em.getTime() <= p.agora.getTime())
    .reduce((s, e) => s + e.valorCentavos, 0);
  const media = consumo / dias;
  if (media <= 0) return { mediaDiariaCentavos: 0, dataEstimada: null, situacao: 'sem_consumo' };
  const diasAteAcabar = Math.max(0, Math.floor(p.saldoCentavos / media));
  return {
    mediaDiariaCentavos: Math.round(media),
    dataEstimada: somarDias(hojeEmBelem(p.agora), diasAteAcabar),
    situacao: 'estimada',
  };
}

/** A cotação consome a parcela relevante do saldo, ou mais: `valor ≥ parcela% × saldo`, em inteiros. */
export function consomeParcelaRelevante(
  valorCentavos: number,
  saldoCentavos: number,
  parcelaRelevantePercentual: number,
): boolean {
  return valorCentavos * 100 >= parcelaRelevantePercentual * saldoCentavos;
}

/** A projeção de cada empenho, pelo saldo de agora (antes de qualquer reserva nova). */
export async function projecoesDosEmpenhos(
  empenhos: readonly { id: string; saldoCentavos: number }[],
  agora: Date = new Date(),
): Promise<Projecao[]> {
  if (empenhos.length === 0) return [];
  const ids = empenhos.map((e) => new Types.ObjectId(e.id));
  const desde = new Date(agora.getTime() - PROJECAO_DIAS_MAX * MS_DIA);
  const [primeiros, recentes] = await Promise.all([
    CotacaoMaterialEventoModel.aggregate<{ _id: Types.ObjectId; em: Date }>([
      { $match: { empenhoId: { $in: ids }, valorCentavos: { $ne: null } } },
      { $group: { _id: '$empenhoId', em: { $min: '$em' } } },
    ]),
    CotacaoMaterialEventoModel.find({
      empenhoId: { $in: ids },
      valorCentavos: { $ne: null },
      em: { $gte: desde },
    })
      .select('empenhoId em valorCentavos')
      .lean(),
  ]);
  const primeiroDe = new Map(primeiros.map((p) => [String(p._id), p.em]));
  return empenhos.map((e) => ({
    empenhoId: e.id,
    saldoCentavos: e.saldoCentavos,
    ...calcularProjecao({
      primeiroEventoEm: primeiroDe.get(e.id) ?? null,
      eventos: recentes
        .filter((r) => String(r.empenhoId) === e.id)
        .map((r) => ({ em: r.em, valorCentavos: r.valorCentavos ?? 0 })),
      saldoCentavos: e.saldoCentavos,
      agora,
    }),
  }));
}

/** A projeção de um empenho só (o `aprovar` usa a do empenho escolhido). */
export async function calcularProjecaoDoEmpenho(
  empenhoId: string,
  saldoCentavos: number,
  agora: Date = new Date(),
): Promise<Projecao> {
  const [p] = await projecoesDosEmpenhos([{ id: empenhoId, saldoCentavos }], agora);
  return p!;
}
