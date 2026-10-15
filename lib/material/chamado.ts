import 'server-only';

import { Types } from 'mongoose';

import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';
import { computeNewResolutionDueAtOnResume } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { PauseLogModel } from '@/models/PauseLog';
import type { ChamadoHistoryAction } from '@/shared/chamados/history.constants';
import { MSG_CONCLUSAO_COM_COTACAO, MSG_RETOMADA_COM_COTACAO } from '@/shared/material/mensagens';

/**
 * Os ganchos da cotação de material no ciclo do chamado (spec 0019, AC-2,
 * AC-12, AC-13). Toda ação que leva o chamado a `concluído`, `cancelado` ou
 * `recusado` passa por aqui, e um teste de varredura confere isso.
 */

const MOTIVO_PAUSA = 'falta_peca_aprovacao_cliente';

/**
 * Pausa o chamado no envio da cotação, quando ele está `em atendimento`.
 * Devolve o `PauseLog` aberto, ou `null` quando o chamado já estava pausado
 * por outro motivo (não abre pausa nova e não retoma no fim). `undefined`:
 * o chamado não está em situação de envio.
 */
export async function pausarPelaCotacao(params: {
  chamadoId: string;
  userId: string;
  numeroCotacao: string;
  agora: Date;
}): Promise<{ pauseLogId: string } | null | undefined> {
  const chamado = await ChamadoModel.findById(params.chamadoId).select('status').lean();
  if (!chamado) return undefined;
  if (chamado.status === 'aguardando_terceiros') return null;
  if (chamado.status !== 'em atendimento') return undefined;

  const detalhe = `Cotação de material ${params.numeroCotacao}`;
  const res = await ChamadoModel.updateOne(
    { _id: chamado._id, status: 'em atendimento' },
    {
      $set: {
        status: 'aguardando_terceiros',
        slaPausedAt: params.agora,
        pauseReason: MOTIVO_PAUSA,
        pauseDetails: detalhe,
      },
    },
  );
  if (res.modifiedCount === 0) return undefined;
  const log = await PauseLogModel.create({
    chamadoId: chamado._id,
    reason: MOTIVO_PAUSA,
    details: detalhe,
    pausedAt: params.agora,
    pausedByUserId: new Types.ObjectId(params.userId),
  });
  return { pauseLogId: String(log._id) };
}

/** Desfaz a pausa aberta pelo envio (compensação de quem perdeu a gravação). */
export async function desfazerPausa(chamadoId: string, pauseLogId: string, agora: Date) {
  await ChamadoModel.updateOne(
    { _id: chamadoId, status: 'aguardando_terceiros', slaPausedAt: agora },
    {
      $set: { status: 'em atendimento' },
      $unset: { slaPausedAt: 1, pauseReason: 1, pauseDetails: 1 },
    },
  ).catch(() => {});
  await PauseLogModel.findByIdAndDelete(pauseLogId).catch(() => {});
}

/**
 * Retoma o chamado quando a cotação que abriu a pausa chega a `autorizada`,
 * `reprovada` ou `cancelada` (AC-2). O SLA é recalculado como na retomada
 * manual. Só age se a pausa aberta ainda é a da cotação.
 */
export async function retomarPelaCotacao(params: {
  chamadoId: string;
  pauseLogId: string;
  userId: string | null;
  agora: Date;
}): Promise<boolean> {
  const log = await PauseLogModel.findById(params.pauseLogId).lean();
  if (!log || log.resumedAt) return false;
  const doc = await ChamadoModel.findById(params.chamadoId);
  if (doc && doc.status !== 'aguardando_terceiros') {
    // O chamado saiu da pausa por outro caminho (cancelado, recusado): fecha o
    // registro da pausa da cotação, para ele não ficar aberto para sempre.
    const pausedMinutes = Math.max(
      0,
      Math.round((params.agora.getTime() - log.pausedAt.getTime()) / 60000),
    );
    await PauseLogModel.updateOne(
      { _id: log._id, resumedAt: { $exists: false } },
      {
        $set: {
          resumedAt: params.agora,
          pausedMinutes,
          ...(params.userId ? { resumedByUserId: new Types.ObjectId(params.userId) } : {}),
        },
      },
    );
    return false;
  }
  if (!doc || !doc.slaPausedAt) return false;

  const slaPausedAt = doc.slaPausedAt;
  const agora = params.agora;
  const pausedMinutes = Math.max(0, Math.round((agora.getTime() - slaPausedAt.getTime()) / 60000));

  const currentDueAt = doc.sla?.resolutionDueAt;
  let newResolutionDueAt: Date | undefined;
  if (currentDueAt) {
    const businessHoursOnly = doc.sla?.businessHoursOnly ?? false;
    let calendarConfig;
    let holidays;
    if (businessHoursOnly) {
      calendarConfig = await getBusinessCalendarConfig();
      holidays = await getActiveHolidaysForRange(slaPausedAt, agora, calendarConfig.timezone);
    }
    newResolutionDueAt = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      agora,
      businessHoursOnly,
      pausedMinutes,
      calendarConfig,
      holidays,
    );
  }

  const set: Record<string, unknown> = { status: 'em atendimento' };
  if (newResolutionDueAt) set['sla.resolutionDueAt'] = newResolutionDueAt;
  const res = await ChamadoModel.updateOne(
    { _id: doc._id, status: 'aguardando_terceiros', slaPausedAt },
    {
      $set: set,
      $inc: { totalPausedMinutes: pausedMinutes, 'sla.pausedMinutes': pausedMinutes },
      $unset: { slaPausedAt: 1, pauseReason: 1, pauseDetails: 1 },
    },
  );
  if (res.modifiedCount === 0) return false;
  await PauseLogModel.updateOne(
    { _id: log._id },
    {
      $set: {
        resumedAt: agora,
        pausedMinutes,
        ...(params.userId ? { resumedByUserId: new Types.ObjectId(params.userId) } : {}),
      },
    },
  );
  return true;
}

/** Linha neutra na linha do tempo do chamado (sem valores: o solicitante vê). */
export async function registrarNoChamado(params: {
  chamadoId: string;
  userId: string | null;
  action: Extract<
    ChamadoHistoryAction,
    | 'cotacao_material_enviada'
    | 'cotacao_material_autorizada'
    | 'cotacao_material_reprovada'
    | 'cotacao_material_cancelada'
  >;
  numeroCotacao: string;
  statusAnterior?: string;
  statusNovo?: string;
}): Promise<void> {
  const textos = {
    cotacao_material_enviada: 'enviada para análise',
    cotacao_material_autorizada: 'autorizada',
    cotacao_material_reprovada: 'reprovada',
    cotacao_material_cancelada: 'cancelada',
  } as const;
  await ChamadoHistoryModel.create({
    chamadoId: new Types.ObjectId(params.chamadoId),
    ...(params.userId
      ? { userId: new Types.ObjectId(params.userId), actorType: 'usuario' }
      : { actorType: 'sistema' }),
    action: params.action,
    ...(params.statusAnterior && params.statusNovo && params.statusAnterior !== params.statusNovo
      ? { statusAnterior: params.statusAnterior, statusNovo: params.statusNovo }
      : {}),
    observacoes: `Cotação de material ${params.numeroCotacao} ${textos[params.action]}.`,
  });
}

/** A cotação em trâmite do chamado, se houver. */
export async function cotacaoEmTramite(chamadoId: string) {
  return CotacaoMaterialModel.findOne({
    chamadoId: new Types.ObjectId(chamadoId),
    emTramite: true,
  })
    .select('_id numero situacao versao pauseLogId')
    .lean();
}

/**
 * Conclusão do chamado (AC-13): recusada enquanto houver cotação em trâmite.
 * Devolve a mensagem de recusa, ou `null` quando pode concluir.
 */
export async function impedimentoDeConclusao(chamadoId: string): Promise<string | null> {
  return (await cotacaoEmTramite(chamadoId)) ? MSG_CONCLUSAO_COM_COTACAO : null;
}

/**
 * Retomada manual (AC-2): recusada quando a pausa aberta é a de uma cotação
 * em trâmite. Devolve a mensagem de recusa, ou `null` quando pode retomar.
 */
export async function impedimentoDeRetomada(chamadoId: string): Promise<string | null> {
  const cot = await CotacaoMaterialModel.findOne({
    chamadoId: new Types.ObjectId(chamadoId),
    emTramite: true,
    pauseLogId: { $type: 'objectId' },
  })
    .select('pauseLogId')
    .lean();
  if (!cot?.pauseLogId) return null;
  const log = await PauseLogModel.findById(cot.pauseLogId).select('resumedAt').lean();
  return log && !log.resumedAt ? MSG_RETOMADA_COM_COTACAO : null;
}

/**
 * Cancelar ou recusar o chamado cancela sozinho a cotação em trâmite e
 * libera o saldo (AC-12). O evento grava quem agiu no chamado, papel
 * `sistema` e o motivo de código fixo. Nunca lança: o chamado já mudou.
 */
export async function cancelarCotacaoPeloChamado(params: {
  chamadoId: string;
  userId: string | null;
  motivo: 'chamado_cancelado' | 'chamado_recusado';
}): Promise<boolean> {
  try {
    const cot = await cotacaoEmTramite(params.chamadoId);
    if (!cot) return false;
    // Import tardio: `transicoes` importa este arquivo.
    const { transicionar } = await import('./transicoes');
    const r = await transicionar({
      cotacaoId: String(cot._id),
      acao: 'cancelar',
      versao: cot.versao,
      ator: { tipo: 'sistema', userId: params.userId },
      motivo: params.motivo,
    });
    if (!r.ok) console.error('[material] cancelar cotação pelo chamado falhou:', r.error);
    return r.ok;
  } catch (e) {
    console.error('[material] cancelar cotação pelo chamado falhou:', e);
    return false;
  }
}

/**
 * A nova tentativa do cancelamento automático (AC-12): o gancho roda uma
 * vez, depois de o chamado já ter mudado, e uma falha ali deixaria a
 * cotação em trâmite e a reserva presa no empenho. A rodada diária do cron
 * cancela a cotação em trâmite de todo chamado cancelado ou recusado, com
 * autor `sistema` (quem encerrou o chamado não fica no chamado).
 */
export async function cancelarCotacoesDeChamadosEncerrados(): Promise<{
  verificadas: number;
  canceladas: number;
}> {
  const emTramite = await CotacaoMaterialModel.find({ emTramite: true }).select('chamadoId').lean();
  if (emTramite.length === 0) return { verificadas: 0, canceladas: 0 };
  const encerrados = await ChamadoModel.find({
    _id: { $in: emTramite.map((c) => c.chamadoId) },
    status: { $in: ['cancelado', 'recusado'] },
  })
    .select('status')
    .lean();
  let canceladas = 0;
  for (const ch of encerrados) {
    const ok = await cancelarCotacaoPeloChamado({
      chamadoId: String(ch._id),
      userId: null,
      motivo: ch.status === 'recusado' ? 'chamado_recusado' : 'chamado_cancelado',
    });
    if (ok) canceladas++;
  }
  return { verificadas: encerrados.length, canceladas };
}
