import 'server-only';

import { Types } from 'mongoose';

import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';
import { computeNewResolutionDueAtOnResume } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import { PauseLogModel } from '@/models/PauseLog';
import type { ChamadoHistoryAction } from '@/shared/chamados/history.constants';
import type { SituacaoCotacao } from '@/shared/material/material.constants';
import { MSG_CONCLUSAO_COM_COTACAO, MSG_RETOMADA_COM_COTACAO } from '@/shared/material/mensagens';

/**
 * Os ganchos da cotação de material no ciclo do chamado (spec 0019, AC-2,
 * AC-12, AC-13). Toda ação que leva o chamado a `concluído`, `cancelado` ou
 * `recusado` passa por aqui, e um teste de varredura confere isso.
 */

const MOTIVO_PAUSA = 'falta_peca_aprovacao_cliente';

/** Cotações em trâmite lidas por vez na rodada diária. */
const LOTE_RODADA_DIARIA = 200;

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
  // A gravação do chamado é condicional ao status lido: se outra ação (o
  // cancelamento pelo solicitante) muda o chamado no meio, relê e tenta de
  // novo, e a segunda leitura já cai no fechamento abaixo (item 37 do escopo).
  for (let tentativa = 0; tentativa < TENTATIVAS_RETOMADA; tentativa++) {
    const r = await tentarRetomar(params);
    if (r !== 'corrida') return r;
  }
  console.error(
    `[material] pausa ${params.pauseLogId} do chamado ${params.chamadoId} não retomada depois de ${TENTATIVAS_RETOMADA} tentativas; ela continua presa à cotação.`,
  );
  return false;
}

/** Leituras e gravações da retomada antes de desistir de uma corrida. */
const TENTATIVAS_RETOMADA = 3;

async function tentarRetomar(params: {
  chamadoId: string;
  pauseLogId: string;
  userId: string | null;
  agora: Date;
}): Promise<boolean | 'corrida'> {
  const log = await PauseLogModel.findById(params.pauseLogId).lean();
  if (!log || log.resumedAt) return false;
  const doc = await ChamadoModel.findById(params.chamadoId);
  if (!doc || doc.status !== 'aguardando_terceiros' || !doc.slaPausedAt) {
    // O chamado saiu da pausa por outro caminho (cancelado, recusado), sumiu ou
    // perdeu a marca da pausa: fecha o registro da pausa da cotação, para ele
    // não ficar aberto para sempre, com a hora em que o chamado saiu, e não a
    // deste ato (pela rodada diária, a hora atual inflaria o tempo pausado em
    // até um dia).
    const fim = doc
      ? await saidaDaPausa(params.chamadoId, doc.status, log.pausedAt, params.agora)
      : params.agora;
    await fecharRegistroDaPausa(log._id, log.pausedAt, fim, params.userId);
    return false;
  }

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
  if (res.modifiedCount === 0) return 'corrida';
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

async function fecharRegistroDaPausa(
  logId: Types.ObjectId,
  pausedAt: Date,
  fim: Date,
  userId: string | null,
): Promise<void> {
  const pausedMinutes = Math.max(0, Math.round((fim.getTime() - pausedAt.getTime()) / 60000));
  await PauseLogModel.updateOne(
    { _id: logId, resumedAt: { $exists: false } },
    {
      $set: {
        resumedAt: fim,
        pausedMinutes,
        ...(userId ? { resumedByUserId: new Types.ObjectId(userId) } : {}),
      },
    },
  );
}

/**
 * Solta o `pauseLogId` da cotação só quando a pausa do chamado já está
 * fechada (ou o registro sumiu). Com ela ainda aberta, a cotação continua
 * apontando para ela, e o envio seguinte não abre uma segunda pausa. Quem
 * tenta de novo é a próxima transição que retoma, enquanto a cotação está em
 * trâmite, ou `fecharPausasDeCotacoesEncerradas`, na rodada diária, quando a
 * cotação já passou do ponto em que a pausa acaba. A gravação é condicional
 * ao mesmo `pauseLogId`, para nunca apagar uma pausa nova aberta nesse meio.
 */
export async function soltarPausaDaCotacao(
  cotacaoId: Types.ObjectId | string,
  pauseLogId: Types.ObjectId | string,
): Promise<boolean> {
  const log = await PauseLogModel.findById(pauseLogId).select('resumedAt').lean();
  if (log && !log.resumedAt) {
    console.error(
      `[material] pausa ${String(pauseLogId)} ainda aberta; a cotação ${String(cotacaoId)} continua com ela.`,
    );
    return false;
  }
  await CotacaoMaterialModel.updateOne(
    { _id: cotacaoId, pauseLogId: new Types.ObjectId(String(pauseLogId)) },
    { $set: { pauseLogId: null } },
  );
  return true;
}

/**
 * Quando o chamado cancelado ou recusado saiu da pausa: o registro mais
 * recente do histórico com esse status novo, entre o início da pausa e
 * agora. Sem ele (ou em outro status), vale `agora`.
 */
async function saidaDaPausa(
  chamadoId: string,
  status: string,
  pausedAt: Date,
  agora: Date,
): Promise<Date> {
  if (status !== 'cancelado' && status !== 'recusado') return agora;
  const h = await ChamadoHistoryModel.findOne({
    chamadoId: new Types.ObjectId(chamadoId),
    statusNovo: status,
    createdAt: { $gte: pausedAt, $lte: agora },
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  return h?.createdAt ?? agora;
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
    | 'cotacao_material_em_checagem'
    | 'cotacao_material_atendida_almoxarifado'
  >;
  numeroCotacao: string;
  statusAnterior?: string;
  statusNovo?: string;
  /** A frase quando o mesmo código serve a mais de um momento (a saída da checagem). */
  texto?: string;
}): Promise<void> {
  const textos = {
    cotacao_material_enviada: 'enviada para análise',
    cotacao_material_autorizada: 'autorizada',
    cotacao_material_reprovada: 'reprovada',
    cotacao_material_cancelada: 'cancelada',
    cotacao_material_em_checagem: 'em checagem no almoxarifado',
    cotacao_material_atendida_almoxarifado: 'atendida pelo almoxarifado',
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
    observacoes: `Cotação de material ${params.numeroCotacao} ${params.texto ?? textos[params.action]}.`,
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
 *
 * Anda em lotes pelo `chamadoId` crescente (o chamado mais antigo primeiro),
 * pelo índice parcial `uma_em_tramite_por_chamado`: a memória e o `$in` não
 * crescem com o volume em trâmite, e a ordem é a mesma em toda rodada. O
 * cursor é o último `chamadoId` lido, então cancelar no meio do caminho (a
 * cotação sai de `emTramite`) não pula nem repete ninguém.
 */
export async function cancelarCotacoesDeChamadosEncerrados(
  tamanhoLote = LOTE_RODADA_DIARIA,
): Promise<{
  verificadas: number;
  canceladas: number;
}> {
  let verificadas = 0;
  let canceladas = 0;
  let depoisDe: Types.ObjectId | null = null;
  for (;;) {
    const lote: { chamadoId: Types.ObjectId }[] = await CotacaoMaterialModel.find({
      emTramite: true,
      ...(depoisDe ? { chamadoId: { $gt: depoisDe } } : {}),
    })
      .sort({ chamadoId: 1 })
      .limit(tamanhoLote)
      .select('chamadoId')
      .lean();
    if (lote.length === 0) break;
    depoisDe = lote[lote.length - 1].chamadoId;
    const encerrados = await ChamadoModel.find({
      _id: { $in: lote.map((c) => c.chamadoId) },
      status: { $in: ['cancelado', 'recusado'] },
    })
      .sort({ _id: 1 })
      .select('status')
      .lean();
    verificadas += encerrados.length;
    for (const ch of encerrados) {
      const ok = await cancelarCotacaoPeloChamado({
        chamadoId: String(ch._id),
        userId: null,
        motivo: ch.status === 'recusado' ? 'chamado_recusado' : 'chamado_cancelado',
      });
      if (ok) canceladas++;
    }
    if (lote.length < tamanhoLote) break;
  }
  return { verificadas, canceladas };
}

/**
 * Situações em que a pausa da cotação já devia ter acabado: a transição para
 * elas retoma o chamado (ou, em `executada` e `atestada`, a `autorizada` de
 * antes retomou). Com o `pauseLogId` ainda gravado, a retomada falhou.
 */
const SITUACOES_SEM_PAUSA: readonly SituacaoCotacao[] = [
  'autorizada',
  'executada',
  'atestada',
  'reprovada',
  'cancelada',
  'atendida_almoxarifado',
];

/** As transições que encerram a pausa da cotação, no evento da trilha. */
const FIM_DA_PAUSA: readonly SituacaoCotacao[] = [
  'autorizada',
  'reprovada',
  'cancelada',
  'atendida_almoxarifado',
];

const ACAO_DO_FIM: Record<
  string,
  | 'cotacao_material_autorizada'
  | 'cotacao_material_reprovada'
  | 'cotacao_material_cancelada'
  | 'cotacao_material_atendida_almoxarifado'
> = {
  autorizada: 'cotacao_material_autorizada',
  executada: 'cotacao_material_autorizada',
  atestada: 'cotacao_material_autorizada',
  reprovada: 'cotacao_material_reprovada',
  cancelada: 'cotacao_material_cancelada',
  atendida_almoxarifado: 'cotacao_material_atendida_almoxarifado',
};

/**
 * A nova tentativa da retomada que desistiu (item 37 do escopo): a pausa da
 * cotação que passou do ponto em que a pausa acaba e ainda guarda o
 * `pauseLogId` é retomada (ou só fechada, se o chamado já saiu da pausa) com a
 * hora da transição que devia tê-la encerrado, e não a desta rodada, para o
 * tempo pausado não crescer até um dia. Roda na conciliação diária, em lotes
 * pelo `_id` da cotação. Nunca lança por cotação: uma falha só vai para o log.
 */
export async function fecharPausasDeCotacoesEncerradas(
  tamanhoLote = LOTE_RODADA_DIARIA,
  agora = new Date(),
): Promise<{ verificadas: number; fechadas: number }> {
  let verificadas = 0;
  let fechadas = 0;
  let depoisDe: Types.ObjectId | null = null;
  for (;;) {
    const lote: {
      _id: Types.ObjectId;
      chamadoId: Types.ObjectId;
      numero: string;
      situacao: SituacaoCotacao;
      pauseLogId?: Types.ObjectId | null;
    }[] = await CotacaoMaterialModel.find({
      situacao: { $in: SITUACOES_SEM_PAUSA },
      pauseLogId: { $type: 'objectId' },
      ...(depoisDe ? { _id: { $gt: depoisDe } } : {}),
    })
      .sort({ _id: 1 })
      .limit(tamanhoLote)
      .select('_id chamadoId numero situacao pauseLogId')
      .lean();
    if (lote.length === 0) break;
    depoisDe = lote[lote.length - 1]._id;
    for (const cot of lote) {
      const pauseLogId = cot.pauseLogId;
      if (!pauseLogId) continue;
      verificadas++;
      try {
        const fim = await CotacaoMaterialEventoModel.findOne({
          cotacaoId: cot._id,
          para: { $in: FIM_DA_PAUSA },
          $expr: { $ne: ['$de', '$para'] },
        })
          .sort({ em: -1 })
          .select('em')
          .lean();
        const chamadoId = String(cot.chamadoId);
        const retomou = await retomarPelaCotacao({
          chamadoId,
          pauseLogId: String(pauseLogId),
          userId: null,
          // Nunca depois de agora, nem antes da própria pausa (retomar confere).
          agora: fim?.em && fim.em < agora ? fim.em : agora,
        });
        if (await soltarPausaDaCotacao(cot._id, pauseLogId)) fechadas++;
        if (retomou) {
          await registrarNoChamado({
            chamadoId,
            userId: null,
            action: ACAO_DO_FIM[cot.situacao],
            numeroCotacao: cot.numero,
            statusAnterior: 'aguardando_terceiros',
            statusNovo: 'em atendimento',
            texto: 'teve a pausa do chamado encerrada pela conciliação diária',
          });
        }
      } catch (e) {
        console.error(`[material] fechar a pausa presa à cotação ${String(cot._id)} falhou:`, e);
      }
    }
    if (lote.length < tamanhoLote) break;
  }
  return { verificadas, fechadas };
}
