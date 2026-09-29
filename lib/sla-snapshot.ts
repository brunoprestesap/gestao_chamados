import 'server-only';

import { dbConnect } from '@/lib/db';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';
import { addBusinessMinutesWithConfig } from '@/lib/sla-timezone';
import {
  addRealMinutes,
  computeSlaDueDatesFromConfig,
  evaluateResponseBreach,
  type FinalPriority,
  SLA_CONFIG_VERSION,
} from '@/lib/sla-utils';
import { SlaConfigModel } from '@/models/SlaConfig';
import type { EscalationType } from '@/models/SlaEscalation';

/**
 * O snapshot de SLA gravado no chamado (spec 0007): mesmo formato em `sla.*`,
 * imutável depois de gravado.
 */
export type SlaSnapshot = {
  priority: FinalPriority;
  responseTargetMinutes: number;
  resolutionTargetMinutes: number;
  businessHoursOnly: boolean;
  responseDueAt: Date;
  resolutionDueAt: Date;
  computedAt: Date;
  configVersion: string;
};

export type MontarSnapshotSlaResultado =
  | { ok: true; snapshot: SlaSnapshot }
  | { ok: false; motivo: string };

/**
 * Monta o snapshot de SLA para uma prioridade, a partir da config ativa,
 * expediente e feriados. Único lugar que calcula o snapshot: a classificação
 * manual e o caminho automático da abertura pela conversa chamam esta mesma
 * função, com os mesmos parâmetros, para os dois caminhos nunca divergirem.
 *
 * Nunca lança: falha (sem config ativa, ou erro ao calcular calendário e
 * feriados) devolve `{ ok: false, motivo }`, e quem chama decide o que fazer.
 */
export async function montarSnapshotSla(
  priority: FinalPriority,
  from: Date,
): Promise<MontarSnapshotSlaResultado> {
  try {
    await dbConnect();

    const slaConfig = await SlaConfigModel.findOne({ priority, isActive: true }).lean();
    if (!slaConfig) {
      return {
        ok: false,
        motivo: `Não há configuração de SLA ativa para a prioridade "${priority}". Configure em Configurações SLA (/sla).`,
      };
    }

    const calendarConfig = await getBusinessCalendarConfig();
    const endDate = new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000);
    const holidays = await getActiveHolidaysForRange(from, endDate, calendarConfig.timezone);
    const { responseDueAt, resolutionDueAt } = computeSlaDueDatesFromConfig(
      from,
      slaConfig.responseTargetMinutes,
      slaConfig.resolutionTargetMinutes,
      slaConfig.businessHoursOnly,
      calendarConfig,
      holidays,
    );

    return {
      ok: true,
      snapshot: {
        priority,
        responseTargetMinutes: slaConfig.responseTargetMinutes,
        resolutionTargetMinutes: slaConfig.resolutionTargetMinutes,
        businessHoursOnly: slaConfig.businessHoursOnly,
        responseDueAt,
        resolutionDueAt,
        computedAt: from,
        configVersion: slaConfig.version ?? SLA_CONFIG_VERSION,
      },
    };
  } catch (err) {
    return {
      ok: false,
      motivo: err instanceof Error ? err.message : 'Erro ao calcular o snapshot de SLA.',
    };
  }
}

/** O que a correção de prioridade lê do `sla.*` gravado, antes de calcular. */
export type SlaAtualParaCorrecao = {
  resolutionDueAt: Date | null;
  responseDueAt: Date | null;
  responseStartedAt: Date | null;
  resolutionTargetMinutes: number | null;
};

/**
 * O patch a aplicar em `sla.*` (spec 0009, AC-8/AC-9). Só os campos que
 * realmente mudam aparecem aqui — os ausentes descrevem "não muda" (mesma
 * convenção de `$mergeObjects` que a gravação atômica já usa): quem grava
 * mescla este literal sobre o `sla` atual, nunca sobrescrevendo os ausentes.
 */
export type SlaCorrecaoPatch = {
  priority: FinalPriority;
  resolutionDueAt: Date;
  responseDueAt: Date;
  resolutionBreachedAt?: Date | null;
  responseBreachedAt?: Date | null;
  responseTargetMinutes?: number;
  resolutionTargetMinutes?: number;
  businessHoursOnly?: boolean;
  configVersion?: string;
};

export type MontarSnapshotCorrecaoResultado =
  | { ok: true; sla: SlaCorrecaoPatch; escalacoesApagar: EscalationType[] }
  | { ok: false; motivo: string };

function menorData(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Monta o patch de SLA de uma correção de prioridade com o atendimento em
 * curso (spec 0009, AC-8/AC-9): regra assimétrica — subir nunca dá mais prazo
 * do que o chamado já tinha, descer dá o prazo da prioridade nova. Nunca
 * lança (mesma convenção de `montarSnapshotSla`): falha vira
 * `{ ok: false, motivo }`, e quem chama decide o que fazer.
 *
 * `now` é sempre injetado pelo chamador (nunca `new Date()` aqui dentro),
 * para os testes fixarem o instante e a corrida (o snapshot é recalculado
 * inteiro dentro do filtro atômico da action, não fora dele).
 */
export async function montarSnapshotCorrecao(params: {
  novaPrioridade: FinalPriority;
  direcao: 'sobe' | 'desce';
  now: Date;
  classifiedAt: Date;
  comTecnico: boolean;
  atual: SlaAtualParaCorrecao;
}): Promise<MontarSnapshotCorrecaoResultado> {
  const { novaPrioridade, direcao, now, classifiedAt, comTecnico, atual } = params;

  try {
    if (direcao === 'sobe') {
      const Dc = atual.resolutionDueAt;
      if (!Dc) {
        return { ok: false, motivo: 'Chamado sem prazo de resolução calculado.' };
      }

      const novo = await montarSnapshotSla(novaPrioridade, now);
      if (!novo.ok) return { ok: false, motivo: novo.motivo };

      // Prazo já vencido: fica como está, subir nunca reabre um prazo vencido.
      const resolutionDueAt = Dc.getTime() > now.getTime() ? menorData(Dc, novo.snapshot.resolutionDueAt) : Dc;
      const prazoMoveu = resolutionDueAt.getTime() !== Dc.getTime();

      let responseDueAt = atual.responseDueAt ?? novo.snapshot.responseDueAt;
      if (!atual.responseStartedAt && atual.responseDueAt) {
        responseDueAt =
          atual.responseDueAt.getTime() > now.getTime()
            ? menorData(atual.responseDueAt, novo.snapshot.responseDueAt)
            : atual.responseDueAt;
      }

      const sla: SlaCorrecaoPatch = { priority: novaPrioridade, resolutionDueAt, responseDueAt };
      if (prazoMoveu) {
        sla.responseTargetMinutes = novo.snapshot.responseTargetMinutes;
        sla.resolutionTargetMinutes = novo.snapshot.resolutionTargetMinutes;
        sla.businessHoursOnly = novo.snapshot.businessHoursOnly;
        sla.configVersion = novo.snapshot.configVersion;
      }
      // computedAt, classifiedAt, responseStartedAt e as violações registradas
      // não entram no patch: ausentes aqui significa "não muda" para quem grava.

      return { ok: true, sla, escalacoesApagar: prazoMoveu ? ['warning_80'] : [] };
    }

    // Desce (menos rígida): o prazo desde `classifiedAt` é a regra da 0007,
    // com ou sem técnico — só o `resolutionDueAt` muda de fórmula quando há
    // técnico (soma a diferença de alvos ao prazo atual, não deriva de novo).
    const novo = await montarSnapshotSla(novaPrioridade, classifiedAt);
    if (!novo.ok) return { ok: false, motivo: novo.motivo };

    let resolutionDueAt: Date;
    if (comTecnico) {
      const Dc = atual.resolutionDueAt;
      if (!Dc) {
        return { ok: false, motivo: 'Chamado sem prazo de resolução calculado.' };
      }
      const Tn = novo.snapshot.resolutionTargetMinutes;
      const Tc = atual.resolutionTargetMinutes ?? 0;
      const diffMinutos = Math.max(0, Tn - Tc);

      if (novo.snapshot.businessHoursOnly) {
        const calendarConfig = await getBusinessCalendarConfig();
        const endDate = new Date(Dc.getTime() + 365 * 24 * 60 * 60 * 1000);
        const holidays = await getActiveHolidaysForRange(Dc, endDate, calendarConfig.timezone);
        resolutionDueAt = addBusinessMinutesWithConfig(Dc, diffMinutos, calendarConfig, holidays);
      } else {
        resolutionDueAt = addRealMinutes(Dc, diffMinutos);
      }
    } else {
      resolutionDueAt = novo.snapshot.resolutionDueAt;
    }
    const responseDueAt = novo.snapshot.responseDueAt;

    const sla: SlaCorrecaoPatch = {
      priority: novaPrioridade,
      resolutionDueAt,
      responseDueAt,
      responseTargetMinutes: novo.snapshot.responseTargetMinutes,
      resolutionTargetMinutes: novo.snapshot.resolutionTargetMinutes,
      businessHoursOnly: novo.snapshot.businessHoursOnly,
      configVersion: novo.snapshot.configVersion,
    };

    if (resolutionDueAt.getTime() > now.getTime()) {
      sla.resolutionBreachedAt = null;
    }

    if (atual.responseStartedAt) {
      sla.responseBreachedAt = evaluateResponseBreach(now, responseDueAt, atual.responseStartedAt);
    } else if (responseDueAt.getTime() > now.getTime()) {
      sla.responseBreachedAt = null;
    }

    const escalacoesApagar: EscalationType[] = ['warning_80'];
    if (sla.resolutionBreachedAt === null) escalacoesApagar.push('breach_resolution');
    if (sla.responseBreachedAt === null) escalacoesApagar.push('breach_response');

    return { ok: true, sla, escalacoesApagar };
  } catch (err) {
    return {
      ok: false,
      motivo: err instanceof Error ? err.message : 'Erro ao calcular a correção de SLA.',
    };
  }
}
