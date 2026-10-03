import 'server-only';

import { Types } from 'mongoose';

import { idsDaSubarvore } from '@/lib/ativos/localizacao';
import { generateTicketNumber } from '@/lib/chamado-utils';
import { calculateNextRunAt } from '@/lib/recurring-utils';
import { montarSnapshotSla } from '@/lib/sla-snapshot';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { LocalizacaoModel } from '@/models/Localizacao';
import { NotificationModel } from '@/models/Notification';
import { RecurringTicketModel } from '@/models/RecurringTicket';
import { UserModel } from '@/models/user.model';
import {
  CHAMADO_STATUS_NAO_FINALIZADOS,
  type FinalPriority,
  toAttendanceNature,
} from '@/shared/chamados/chamado.constants';
import type { RecurrenceType } from '@/shared/chamados/recurring-ticket.schemas';

/**
 * Preventiva por categoria de ativo (spec 0013, AC-17 a AC-25). Um modelo
 * recorrente com `escopo: 'categoria_ativo'` gera, a cada rodada, um chamado
 * `validado` por ativo Tier A em operação da categoria (e do local, se houver),
 * com o SLA calculado na hora. O modelo é reservado por uma atualização atômica
 * antes de gerar: duas execuções do cron nunca geram o mesmo lote.
 */

const LOCAL_SEM_ATIVO = 'Conforme agendamento';
const TENTATIVAS_NUMERO = 3;

export type ModeloPreventiva = {
  _id: Types.ObjectId;
  name: string;
  titulo: string;
  descricao: string;
  unitId: Types.ObjectId;
  tipoServico: string;
  naturezaAtendimento: string;
  grauUrgencia?: string | null;
  subtypeId: Types.ObjectId;
  catalogServiceId: Types.ObjectId;
  solicitanteId: Types.ObjectId;
  recurrenceType: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  intervalDays?: number | null;
  nextRunAt: Date;
  categoriaAtivoId?: Types.ObjectId | null;
  localizacaoId?: Types.ObjectId | null;
  finalPriority?: string | null;
};

export type ContextoLote = {
  agora: Date;
  weekdays?: number[];
  /** Admin e Preposto ativos, que recebem o aviso do lote. */
  gestores: { _id: Types.ObjectId }[];
};

export type ResultadoLote =
  | { situacao: 'nao_reservado' }
  | {
      situacao: 'concluido';
      gerados: number;
      pulados: number;
      semSla: number;
      erros: number;
      elegiveis: number;
      motivo?: string;
      pausado: boolean;
    };

/**
 * O primeiro horário da recorrência depois de `agora`, partindo do `nextRunAt`
 * atual: com o cron parado por semanas, sai um lote só (AC-22).
 */
export function proximaRodada(modelo: ModeloPreventiva, agora: Date, weekdays?: number[]): Date {
  const opts = {
    dayOfWeek: modelo.dayOfWeek ?? undefined,
    dayOfMonth: modelo.dayOfMonth ?? undefined,
    intervalDays: modelo.intervalDays ?? undefined,
  };
  let proximo = new Date(modelo.nextRunAt);
  // Guarda contra laço infinito se a recorrência não avançar.
  for (let i = 0; i < 1000 && proximo <= agora; i++) {
    const seguinte = calculateNextRunAt(
      modelo.recurrenceType as RecurrenceType,
      opts,
      proximo,
      weekdays,
    );
    if (seguinte <= proximo) break;
    proximo = seguinte;
  }
  if (proximo <= agora) {
    proximo = calculateNextRunAt(modelo.recurrenceType as RecurrenceType, opts, agora, weekdays);
  }
  return proximo;
}

/** Título do aviso do lote (AC-21 e AC-23). */
export function tituloDoLote(
  nome: string,
  r: { gerados: number; pulados: number; semSla: number; erros: number; elegiveis: number },
  pausa?: string,
): string {
  if (pausa) return `Preventiva ${nome} pausada: ${pausa}`;
  if (r.elegiveis === 0) {
    return `Preventiva ${nome}: nenhum ativo elegível, confira a categoria e o local do modelo`;
  }
  const partes = [`${r.gerados} gerados`, `${r.pulados} pulados`];
  if (r.semSla) partes.push(`${r.semSla} sem SLA`);
  if (r.erros) partes.push(`${r.erros} com erro`);
  return `Preventiva ${nome}: ${partes.join(', ')}`;
}

function ehNumeroRepetido(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const erro = e as { code?: number; keyPattern?: Record<string, unknown> };
  return erro.code === 11000 && Boolean(erro.keyPattern && 'ticket_number' in erro.keyPattern);
}

async function avisarGestores(
  contexto: ContextoLote,
  modelo: ModeloPreventiva,
  titulo: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (contexto.gestores.length === 0) return;
  await NotificationModel.insertMany(
    contexto.gestores.map((g) => ({
      userId: g._id,
      type: 'preventiva:lote',
      title: titulo,
      body: modelo.titulo,
      data,
      readAt: null,
    })),
  );
}

export async function gerarLotePreventiva(
  modelo: ModeloPreventiva,
  contexto: ContextoLote,
): Promise<ResultadoLote> {
  const { agora } = contexto;

  // 1. Reserva: só quem avança o `nextRunAt` lido gera o lote.
  const reservado = await RecurringTicketModel.findOneAndUpdate(
    { _id: modelo._id, nextRunAt: modelo.nextRunAt, isActive: true },
    {
      $set: {
        nextRunAt: proximaRodada(modelo, agora, contexto.weekdays),
        lastRunAt: agora,
        ultimoLote: {
          situacao: 'em_andamento',
          em: agora,
          gerados: 0,
          pulados: 0,
          semSla: 0,
          erros: 0,
          motivo: null,
        },
      },
    },
    { new: true },
  ).lean();
  if (!reservado) return { situacao: 'nao_reservado' };

  const r = { gerados: 0, pulados: 0, semSla: 0, erros: 0, elegiveis: 0 };

  // 2. Pré condições: categoria ativa e solicitante ativo; senão pausa o modelo.
  const [categoria, solicitante] = await Promise.all([
    modelo.categoriaAtivoId
      ? CategoriaAtivoModel.findById(modelo.categoriaAtivoId).select('isActive').lean<{
          isActive?: boolean;
        }>()
      : Promise.resolve(null),
    UserModel.findById(modelo.solicitanteId).select('isActive').lean<{ isActive?: boolean }>(),
  ]);
  const motivoPausa =
    !categoria || categoria.isActive === false
      ? 'categoria desativada'
      : !solicitante || solicitante.isActive === false
        ? 'solicitante inativo'
        : null;
  if (motivoPausa) {
    await RecurringTicketModel.updateOne(
      { _id: modelo._id },
      {
        $set: {
          isActive: false,
          ultimoLote: { situacao: 'concluido', em: agora, ...semElegiveis(r), motivo: motivoPausa },
        },
      },
    );
    await avisarGestores(contexto, modelo, tituloDoLote(modelo.name, r, motivoPausa), {
      recurringId: String(modelo._id),
      nome: modelo.name,
      ...semElegiveis(r),
      pausado: true,
    });
    return { situacao: 'concluido', ...r, motivo: motivoPausa, pausado: true };
  }

  // 3. Elegíveis: Tier A, em operação, da categoria e do recorte de local.
  const filtroLocal = modelo.localizacaoId
    ? { localizacaoId: { $in: await idsDaSubarvore(String(modelo.localizacaoId)) } }
    : {};
  const ativos = await AtivoModel.find({
    categoriaId: modelo.categoriaAtivoId,
    tierManutencao: 'A',
    status: 'em_operacao',
    ...filtroLocal,
  })
    .select('codigo localizacaoId')
    .lean<{ _id: Types.ObjectId; codigo: string; localizacaoId?: Types.ObjectId | null }[]>();
  ativos.sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' }),
  );
  r.elegiveis = ativos.length;

  // 4. Pulados: ainda têm preventiva deste modelo não finalizada.
  const comAberto = ativos.length
    ? await ChamadoModel.distinct('ativoId', {
        originTemplateId: modelo._id,
        ativoId: { $in: ativos.map((a) => a._id) },
        status: { $in: [...CHAMADO_STATUS_NAO_FINALIZADOS] },
      })
    : [];
  const pular = new Set(comAberto.map((id) => String(id)));

  // 5. Snapshot uma vez por lote: a prioridade e o instante são os mesmos.
  const prioridade = (modelo.finalPriority ?? 'BAIXA') as FinalPriority;
  const snapshot = await montarSnapshotSla(prioridade, agora);

  // `localExato` de cada ativo, numa consulta só.
  const localIds = [
    ...new Set(ativos.filter((a) => a.localizacaoId).map((a) => String(a.localizacaoId))),
  ];
  const locais = localIds.length
    ? await LocalizacaoModel.find({ _id: { $in: localIds } })
        .select('caminho')
        .lean<{ _id: Types.ObjectId; caminho: string }[]>()
    : [];
  const caminhoPorId = new Map(locais.map((l) => [String(l._id), l.caminho]));

  const naturezaForm = modelo.naturezaAtendimento === 'Urgente' ? 'Urgente' : 'Padrão';
  const classificacao = snapshot.ok
    ? {
        status: 'validado' as const,
        finalPriority: prioridade,
        attendanceNature: toAttendanceNature(naturezaForm),
        classifiedAt: agora,
        sla: snapshot.snapshot,
      }
    : { status: 'aberto' as const };

  // 6. Um por um, em sequência.
  for (const ativo of ativos) {
    if (pular.has(String(ativo._id))) {
      r.pulados += 1;
      continue;
    }
    try {
      let criado: { _id: Types.ObjectId } | null = null;
      for (let tentativa = 1; tentativa <= TENTATIVAS_NUMERO && !criado; tentativa++) {
        try {
          criado = await ChamadoModel.create({
            ticket_number: await generateTicketNumber(),
            titulo: `${modelo.titulo} · ${ativo.codigo}`,
            descricao: modelo.descricao,
            solicitanteId: modelo.solicitanteId,
            unitId: modelo.unitId,
            localExato: ativo.localizacaoId
              ? (caminhoPorId.get(String(ativo.localizacaoId)) ?? LOCAL_SEM_ATIVO)
              : LOCAL_SEM_ATIVO,
            tipoServico: modelo.tipoServico,
            naturezaAtendimento: modelo.naturezaAtendimento,
            requestedAttendanceNature: toAttendanceNature(naturezaForm),
            grauUrgencia: modelo.grauUrgencia ?? 'Normal',
            subtypeId: modelo.subtypeId,
            catalogServiceId: modelo.catalogServiceId,
            originTemplateId: modelo._id,
            ativoId: ativo._id,
            ...classificacao,
          });
        } catch (e) {
          if (!ehNumeroRepetido(e) || tentativa === TENTATIVAS_NUMERO) throw e;
        }
      }
      if (!criado) throw new Error('chamado não criado');

      await ChamadoHistoryModel.create({
        chamadoId: criado._id,
        userId: null,
        actorType: 'sistema',
        action: 'abertura',
        statusAnterior: null,
        statusNovo: classificacao.status,
        observacoes: `Preventiva gerada pelo agendamento ${modelo.name}`,
      });
      r.gerados += 1;
      if (!snapshot.ok) r.semSla += 1;
    } catch (e) {
      r.erros += 1;
      console.error(
        `[preventiva] erro ao gerar o chamado do ativo ${ativo.codigo} (modelo ${String(modelo._id)}):`,
        e,
      );
    }
  }

  // 7. Fecho.
  const lote = { gerados: r.gerados, pulados: r.pulados, semSla: r.semSla, erros: r.erros };
  await RecurringTicketModel.updateOne(
    { _id: modelo._id },
    {
      $set: { ultimoLote: { situacao: 'concluido', em: agora, ...lote, motivo: null } },
      $inc: { totalGenerated: r.gerados },
    },
  );
  await avisarGestores(contexto, modelo, tituloDoLote(modelo.name, r), {
    recurringId: String(modelo._id),
    nome: modelo.name,
    ...lote,
    pausado: false,
  });
  return { situacao: 'concluido', ...r, pausado: false };
}

function semElegiveis(r: { gerados: number; pulados: number; semSla: number; erros: number }) {
  return { gerados: r.gerados, pulados: r.pulados, semSla: r.semSla, erros: r.erros };
}
