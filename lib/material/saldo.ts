import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import { EmpenhoModel } from '@/models/Empenho';
import {
  CONCILIACAO_TOLERANCIA_MS,
  type SituacaoCotacao,
  SITUACOES_COM_RESERVA,
} from '@/shared/material/material.constants';

/**
 * Saldo do empenho (spec 0019, AC-6, AC-8). O MongoDB roda sem replica set,
 * então não há transação: reservar é um update condicional no empenho,
 * idempotente pela cotação, e liberar e ajustar só agem sobre a reserva que
 * existe. Uma reserva sem cotação autorizada é liberada pela conciliação.
 */

/** Ano corrente e hoje no fuso de Belém. */
function agoraBelem(agora: Date) {
  const hoje = hojeEmBelem(agora);
  return { hoje, ano: Number(hoje.slice(0, 4)) };
}

/** Filtro de empenho elegível: ativo, exercício corrente e vigência não vencida. */
export function filtroElegivel(agora: Date = new Date()) {
  const { hoje, ano } = agoraBelem(agora);
  return {
    ativo: true,
    exercicio: ano,
    $or: [{ vigenciaFim: null }, { vigenciaFim: { $gte: hoje } }],
  };
}

export type EmpenhoElegivel = {
  id: string;
  numero: string;
  saldoCentavos: number;
  /** Spec 0021: a barra de saldo do detalhe mostra o líquido e o comprometido. */
  liquidoCentavos: number;
  comprometidoCentavos: number;
};

/** Empenhos elegíveis, com o saldo livre (`líquido − comprometido`). */
export async function empenhosElegiveis(agora: Date = new Date()): Promise<EmpenhoElegivel[]> {
  const docs = await EmpenhoModel.find(filtroElegivel(agora))
    .select('numero valorLiquidoCentavos comprometidoCentavos')
    .sort({ numero: 1 })
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    numero: d.numero,
    saldoCentavos: d.valorLiquidoCentavos - d.comprometidoCentavos,
    liquidoCentavos: d.valorLiquidoCentavos,
    comprometidoCentavos: d.comprometidoCentavos,
  }));
}

/** Algum empenho elegível tem saldo para o valor (AC-6). */
export async function haSaldoElegivel(valorCentavos: number, agora = new Date()): Promise<boolean> {
  const n = await EmpenhoModel.countDocuments({
    ...filtroElegivel(agora),
    $expr: {
      $gte: [{ $subtract: ['$valorLiquidoCentavos', '$comprometidoCentavos'] }, valorCentavos],
    },
  });
  return n > 0;
}

/**
 * Reserva o valor no empenho para a cotação. `true` quando reservou;
 * `false` sem saldo, empenho inelegível ou reserva já existente.
 */
export async function reservar(params: {
  empenhoId: string;
  cotacaoId: string;
  valorCentavos: number;
  agora?: Date;
}): Promise<boolean> {
  const agora = params.agora ?? new Date();
  const cotacaoId = new Types.ObjectId(params.cotacaoId);
  const doc = await EmpenhoModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(params.empenhoId),
      ...filtroElegivel(agora),
      'reservas.cotacaoId': { $ne: cotacaoId },
      $expr: {
        $gte: [
          { $subtract: ['$valorLiquidoCentavos', '$comprometidoCentavos'] },
          params.valorCentavos,
        ],
      },
    },
    {
      $push: { reservas: { cotacaoId, valorCentavos: params.valorCentavos, em: agora } },
      $inc: { comprometidoCentavos: params.valorCentavos },
    },
    { returnDocument: 'after', projection: { _id: 1 } },
  ).lean();
  return !!doc;
}

/**
 * Libera a reserva da cotação no empenho dado. Devolve o valor liberado, ou
 * `null` quando não havia reserva (liberar duas vezes não faz nada). O
 * empenho é obrigatório: duas aprovações da mesma cotação em empenhos
 * diferentes reservam cada uma no seu, e cada uma só desfaz a própria.
 */
export async function liberar(
  cotacaoId: string,
  empenhoId: string,
): Promise<{
  empenhoId: string;
  valorCentavos: number;
} | null> {
  const id = new Types.ObjectId(cotacaoId);
  // Duas tentativas: a leitura do valor e o update condicionado ao mesmo
  // valor evitam descontar um valor que outro ato acabou de trocar.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const empenho = await EmpenhoModel.findOne({
      _id: new Types.ObjectId(empenhoId),
      'reservas.cotacaoId': id,
    })
      .select('reservas')
      .lean();
    const reserva = empenho?.reservas.find((r) => String(r.cotacaoId) === cotacaoId);
    if (!empenho || !reserva) return null;
    const res = await EmpenhoModel.updateOne(
      {
        _id: empenho._id,
        reservas: { $elemMatch: { cotacaoId: id, valorCentavos: reserva.valorCentavos } },
      },
      {
        $pull: { reservas: { cotacaoId: id } },
        $inc: { comprometidoCentavos: -reserva.valorCentavos },
      },
    );
    if (res.modifiedCount === 1) {
      return { empenhoId: String(empenho._id), valorCentavos: reserva.valorCentavos };
    }
  }
  return null;
}

/**
 * Troca o valor da reserva pelo executado (AC-10). Só diminui: a execução
 * nunca passa do autorizado. Devolve a diferença liberada (≥ 0) ou `null`
 * sem reserva.
 */
export async function ajustar(
  cotacaoId: string,
  empenhoId: string,
  novoValorCentavos: number,
): Promise<number | null> {
  const id = new Types.ObjectId(cotacaoId);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const empenho = await EmpenhoModel.findOne({
      _id: new Types.ObjectId(empenhoId),
      'reservas.cotacaoId': id,
    })
      .select('reservas')
      .lean();
    const reserva = empenho?.reservas.find((r) => String(r.cotacaoId) === cotacaoId);
    if (!empenho || !reserva) return null;
    const diferenca = reserva.valorCentavos - novoValorCentavos;
    if (diferenca <= 0) return 0;
    const res = await EmpenhoModel.updateOne(
      {
        _id: empenho._id,
        reservas: { $elemMatch: { cotacaoId: id, valorCentavos: reserva.valorCentavos } },
      },
      {
        $set: { 'reservas.$[r].valorCentavos': novoValorCentavos },
        $inc: { comprometidoCentavos: -diferenca },
      },
      { arrayFilters: [{ 'r.cotacaoId': id }] },
    );
    if (res.modifiedCount === 1) return diferenca;
  }
  return null;
}

/**
 * Anulação (AC-19): só se o líquido depois dela continua cobrindo o
 * comprometido. Reforço sempre passa.
 */
export async function registrarMovimento(params: {
  empenhoId: string;
  tipo: 'reforco' | 'anulacao';
  valorCentavos: number;
  ato: string;
  porUserId: string;
  agora?: Date;
}): Promise<boolean> {
  const movimento = {
    tipo: params.tipo,
    valorCentavos: params.valorCentavos,
    ato: params.ato,
    porUserId: new Types.ObjectId(params.porUserId),
    em: params.agora ?? new Date(),
  };
  const sinal = params.tipo === 'reforco' ? 1 : -1;
  const filtro: Record<string, unknown> = { _id: new Types.ObjectId(params.empenhoId) };
  if (params.tipo === 'anulacao') {
    filtro.$expr = {
      $gte: [
        { $subtract: ['$valorLiquidoCentavos', params.valorCentavos] },
        '$comprometidoCentavos',
      ],
    };
  }
  const res = await EmpenhoModel.updateOne(filtro, {
    $push: { movimentos: movimento },
    $inc: { valorLiquidoCentavos: sinal * params.valorCentavos },
  });
  return res.modifiedCount === 1;
}

/**
 * Conciliação diária (AC-8): libera reservas com mais de 10 minutos cuja
 * cotação não está em `autorizada`, `executada` ou `atestada`, ou que estão
 * num empenho diferente do gravado na cotação, e grava evento do sistema.
 * Devolve quantas liberou. Com `cotacaoId`, confere só as reservas dela (a
 * aprovação repetida depois de uma queda usa a mesma regra, sem esperar o cron).
 */
export async function conciliarReservas(
  agora: Date = new Date(),
  opcoes: { cotacaoId?: string } = {},
): Promise<{
  verificadas: number;
  liberadas: number;
}> {
  const limite = new Date(agora.getTime() - CONCILIACAO_TOLERANCIA_MS);
  const daCotacao = opcoes.cotacaoId ? new Types.ObjectId(opcoes.cotacaoId) : null;
  const empenhos = await EmpenhoModel.find(
    daCotacao ? { 'reservas.cotacaoId': daCotacao } : { 'reservas.0': { $exists: true } },
  )
    .select('reservas')
    .lean();
  const reservas = empenhos.flatMap((e) =>
    e.reservas
      .filter((r) => r.em < limite)
      .filter((r) => !daCotacao || String(r.cotacaoId) === opcoes.cotacaoId)
      .map((r) => ({ empenhoId: e._id, cotacaoId: r.cotacaoId })),
  );
  if (reservas.length === 0) return { verificadas: 0, liberadas: 0 };

  const cotacoes = await CotacaoMaterialModel.find({
    _id: { $in: reservas.map((r) => r.cotacaoId) },
  })
    .select('situacao empenhoId')
    .lean();
  const situacao = new Map(cotacoes.map((c) => [String(c._id), c.situacao as SituacaoCotacao]));
  const empenhoDa = new Map(cotacoes.map((c) => [String(c._id), String(c.empenhoId ?? '')]));

  let liberadas = 0;
  for (const r of reservas) {
    const s = situacao.get(String(r.cotacaoId));
    const noEmpenhoDaCotacao = empenhoDa.get(String(r.cotacaoId)) === String(r.empenhoId);
    if (s && SITUACOES_COM_RESERVA.includes(s) && noEmpenhoDaCotacao) continue;
    const liberado = await liberar(String(r.cotacaoId), String(r.empenhoId));
    if (!liberado) continue;
    liberadas++;
    // Sem a cotação não há trilha onde gravar: o evento afirmaria uma situação falsa.
    if (!s) {
      console.warn(
        `[material] reserva de ${liberado.valorCentavos} centavos da cotação inexistente ${String(r.cotacaoId)} liberada no empenho ${String(r.empenhoId)}.`,
      );
      continue;
    }
    await CotacaoMaterialEventoModel.create({
      cotacaoId: r.cotacaoId,
      de: s,
      para: s,
      acao: 'conciliar',
      papel: 'sistema',
      motivo: 'conciliacao',
      empenhoId: r.empenhoId,
      valorCentavos: -liberado.valorCentavos,
      em: agora,
    }).catch((e) => console.error('[material] evento da conciliação falhou:', e));
  }
  return { verificadas: reservas.length, liberadas };
}

/** Existe reserva da cotação em algum empenho. */
export async function temReserva(cotacaoId: string): Promise<boolean> {
  return !!(await EmpenhoModel.exists({ 'reservas.cotacaoId': new Types.ObjectId(cotacaoId) }));
}
