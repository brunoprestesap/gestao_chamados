/**
 * Utilitário de SLA — cálculo de prazos em horário comercial e 24x7.
 * Utiliza configuração institucional (timezone, expediente, dias úteis) e feriados.
 */

import type { BusinessCalendarConfig } from '@/lib/expediente-config';
import {
  addBusinessMinutesWithConfig,
  getBusinessMinutesPerDay,
} from '@/lib/sla-timezone';

export type FinalPriority = 'BAIXA' | 'NORMAL' | 'ALTA' | 'EMERGENCIAL';

/** Re-exporta para uso legado; prefira addBusinessMinutesWithConfig com config. */
export function addBusinessMinutes(
  from: Date,
  minutes: number,
  config?: BusinessCalendarConfig,
): Date {
  const c = config ?? getDefaultCalendarConfig();
  return addBusinessMinutesWithConfig(from, minutes, c);
}

/** Config padrão (fallback quando não há documento no banco). */
function getDefaultCalendarConfig(): BusinessCalendarConfig {
  return {
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  };
}

export function addBusinessHours(
  from: Date,
  hours: number,
  config?: BusinessCalendarConfig,
): Date {
  return addBusinessMinutes(from, Math.round(hours * 60), config);
}

export function addBusinessDays(
  from: Date,
  days: number,
  config?: BusinessCalendarConfig,
): Date {
  const c = config ?? getDefaultCalendarConfig();
  const minsPerDay = getBusinessMinutesPerDay(c);
  return addBusinessMinutesWithConfig(from, days * minsPerDay, c);
}

/**
 * Adiciona tempo corrido (24x7) em minutos — usado quando businessHoursOnly = false.
 */
export function addElapsedMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60 * 1000);
}

/** Alias para contagem corrida (24x7) em minutos */
export function addRealMinutes(from: Date, minutes: number): Date {
  return addElapsedMinutes(from, minutes);
}

export function addElapsedHours(from: Date, hours: number): Date {
  return addElapsedMinutes(from, hours * 60);
}

export const SLA_CONFIG_VERSION = 'v1';

/**
 * Calcula responseDueAt e resolutionDueAt a partir da configuração de SLA (minutos e se é horário comercial).
 * Usado ao classificar: consome a config ativa e persiste no chamado (imutável).
 * @param calendarConfig configuração institucional (timezone, expediente, dias úteis). Se omitida, usa defaults.
 * @param holidays feriados ativos (YYYY-MM-DD) — dias não úteis no cálculo. Se omitido, não considera feriados.
 */
export function computeSlaDueDatesFromConfig(
  from: Date,
  responseTargetMinutes: number,
  resolutionTargetMinutes: number,
  businessHoursOnly: boolean,
  calendarConfig?: BusinessCalendarConfig,
  holidays?: Set<string>,
): { responseDueAt: Date; resolutionDueAt: Date } {
  const fromDate = new Date(from);
  const calendar = calendarConfig ?? getDefaultCalendarConfig();
  if (businessHoursOnly) {
    return {
      responseDueAt: addBusinessMinutesWithConfig(fromDate, responseTargetMinutes, calendar, holidays),
      resolutionDueAt: addBusinessMinutesWithConfig(fromDate, resolutionTargetMinutes, calendar, holidays),
    };
  }
  return {
    responseDueAt: addRealMinutes(fromDate, responseTargetMinutes),
    resolutionDueAt: addRealMinutes(fromDate, resolutionTargetMinutes),
  };
}

/**
 * Avalia breach de resposta: resposta não iniciada antes do prazo.
 * Retorna a data do breach (now) se now > responseDueAt e responseStartedAt ainda null (ou iniciada após o prazo).
 */
export function evaluateResponseBreach(
  now: Date,
  responseDueAt: Date | null,
  responseStartedAt: Date | null,
): Date | null {
  if (!responseDueAt) return null;
  if (responseStartedAt) {
    return responseStartedAt > responseDueAt ? responseStartedAt : null;
  }
  return now > responseDueAt ? now : null;
}

/**
 * Avalia breach de solução: não resolvido antes do prazo.
 */
export function evaluateResolutionBreach(
  now: Date,
  resolutionDueAt: Date | null,
  resolvedAt: Date | null,
): Date | null {
  if (!resolutionDueAt) return null;
  if (resolvedAt) {
    return resolvedAt > resolutionDueAt ? resolvedAt : null;
  }
  return now > resolutionDueAt ? now : null;
}

/**
 * Status de exibição do SLA para UI: "No prazo" | "Próximo do vencimento" | "Atrasado"
 */
export type SlaStatusDisplay = 'no_prazo' | 'proximo_vencimento' | 'atrasado';

/**
 * Calcula o status de exibição do SLA (resolução). Considera resolutionDueAt e resolvedAt/breach.
 * Regras: atrasado se breach ou now > due e não resolvido; próximo se falta <= 20% do tempo total (ou <= 4h para ALTA); senão no prazo.
 * @param resolutionStartAt opcional: início do prazo (ex. classifiedAt) para calcular "20% do tempo total"
 */
export function getSlaResolutionStatus(
  now: Date,
  resolutionDueAt: Date | null,
  resolvedAt: Date | null,
  resolutionBreachedAt: Date | null,
  finalPriority: FinalPriority,
  resolutionStartAt?: Date | null,
): SlaStatusDisplay {
  if (resolutionBreachedAt != null || (resolutionDueAt != null && now > resolutionDueAt && resolvedAt == null)) {
    return 'atrasado';
  }
  if (resolvedAt != null) {
    return resolutionBreachedAt != null ? 'atrasado' : 'no_prazo';
  }
  if (!resolutionDueAt) return 'no_prazo';

  const remainingMs = resolutionDueAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 'no_prazo';

  const fourHoursMs = 4 * 60 * 60 * 1000;
  if (finalPriority === 'ALTA' && remainingMs <= fourHoursMs) return 'proximo_vencimento';

  if (resolutionStartAt) {
    const totalMs = resolutionDueAt.getTime() - resolutionStartAt.getTime();
    if (totalMs > 0 && remainingMs <= totalMs * 0.2) return 'proximo_vencimento';
  }
  return 'no_prazo';
}
