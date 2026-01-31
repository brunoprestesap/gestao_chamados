/**
 * Utilitário de SLA — cálculo de prazos em horário comercial e 24x7.
 * Timezone do sistema: America/Belem (UTC-3).
 * Horário comercial: Segunda a Sexta, 08:00–18:00 (Belem).
 * TODO: Feriados — não considerado nesta versão; ponto de extensão futuro.
 */

/** Belem = UTC-3. Para obter hora/dia em Belem a partir de UTC: subtrair 3h. */
const TIMEZONE_BELEM_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;
const MINUTES_PER_DAY = 24 * 60;
const BUSINESS_MINUTES_PER_DAY = (BUSINESS_END_HOUR - BUSINESS_START_HOUR) * 60;

export type FinalPriority = 'BAIXA' | 'NORMAL' | 'ALTA' | 'EMERGENCIAL';

/** Retorna (dia da semana em Belem 0=Dom..6=Sab, hora fracionada 0-24) */
function getBelemWeekdayAndHour(date: Date): { dayOfWeek: number; hourFraction: number } {
  const belemRef = new Date(date.getTime() - TIMEZONE_BELEM_UTC_OFFSET_MS);
  const dayOfWeek = belemRef.getUTCDay();
  const hourFraction =
    belemRef.getUTCHours() +
    belemRef.getUTCMinutes() / 60 +
    belemRef.getUTCSeconds() / 3600 +
    belemRef.getUTCMilliseconds() / 3600000;
  return { dayOfWeek, hourFraction };
}

/** Verifica se o instante está dentro do horário comercial em Belem (Seg–Sex 08:00–18:00) */
export function isWithinBusinessHours(date: Date): boolean {
  const { dayOfWeek, hourFraction } = getBelemWeekdayAndHour(date);
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const inHours = hourFraction >= BUSINESS_START_HOUR && hourFraction < BUSINESS_END_HOUR;
  return isWeekday && inHours;
}

/**
 * Ajusta o início para o próximo horário útil se estiver fora do expediente.
 * Se já estiver dentro, retorna o mesmo Date.
 */
export function snapToNextBusinessStart(date: Date): Date {
  const { dayOfWeek, hourFraction } = getBelemWeekdayAndHour(date);
  let d = new Date(date.getTime());
  const cameFromWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (dayOfWeek === 0) {
    d = addDays(d, 1);
  } else if (dayOfWeek === 6) {
    d = addDays(d, 2);
  }

  let again = getBelemWeekdayAndHour(d);
  if (again.dayOfWeek >= 1 && again.dayOfWeek <= 5) {
    if (cameFromWeekend) {
      d = setBelemTimeTo(d, BUSINESS_START_HOUR, 0, 0, 0);
    } else if (again.hourFraction < BUSINESS_START_HOUR) {
      d = setBelemTimeTo(d, BUSINESS_START_HOUR, 0, 0, 0);
    } else if (again.hourFraction >= BUSINESS_END_HOUR) {
      d = addDays(d, 1);
      while (true) {
        again = getBelemWeekdayAndHour(d);
        if (again.dayOfWeek >= 1 && again.dayOfWeek <= 5) break;
        d = addDays(d, 1);
      }
      d = setBelemTimeTo(d, BUSINESS_START_HOUR, 0, 0, 0);
    }
  } else {
    d = setBelemTimeTo(d, BUSINESS_START_HOUR, 0, 0, 0);
  }
  return d;
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/** Define hora em Belem (h, m, s, ms) no mesmo dia Belem de `date`; retorna novo Date em UTC */
function setBelemTimeTo(
  date: Date,
  h: number,
  m: number,
  s: number,
  ms: number,
): Date {
  const belemRef = new Date(date.getTime() - TIMEZONE_BELEM_UTC_OFFSET_MS);
  const dayStartUtc = Date.UTC(
    belemRef.getUTCFullYear(),
    belemRef.getUTCMonth(),
    belemRef.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const utcOffsetForBelemHour = (3 + h) * 3600 * 1000 + m * 60 * 1000 + s * 1000 + ms;
  return new Date(dayStartUtc + utcOffsetForBelemHour);
}

/**
 * Adiciona N minutos considerando apenas horário comercial (Seg–Sex 08:00–18:00) em America/Belem.
 * Se `from` estiver fora do expediente, o início é ajustado para o próximo horário útil.
 */
export function addBusinessMinutes(from: Date, minutes: number): Date {
  if (minutes <= 0) return new Date(from.getTime());
  let current = snapToNextBusinessStart(new Date(from.getTime()));
  let remaining = minutes;

  while (remaining > 0) {
    const { dayOfWeek, hourFraction } = getBelemWeekdayAndHour(current);
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const minutesUntilEOD = (BUSINESS_END_HOUR - hourFraction) * 60;
      if (remaining <= minutesUntilEOD) {
        current = new Date(current.getTime() + remaining * 60 * 1000);
        remaining = 0;
      } else {
        remaining -= minutesUntilEOD;
        current = new Date(current.getTime() + minutesUntilEOD * 60 * 1000);
        current = snapToNextBusinessStart(current);
      }
    } else {
      current = snapToNextBusinessStart(current);
    }
  }
  return current;
}

export function addBusinessHours(from: Date, hours: number): Date {
  return addBusinessMinutes(from, Math.round(hours * 60));
}

export function addBusinessDays(from: Date, days: number): Date {
  return addBusinessMinutes(from, days * BUSINESS_MINUTES_PER_DAY);
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
 */
export function computeSlaDueDatesFromConfig(
  from: Date,
  responseTargetMinutes: number,
  resolutionTargetMinutes: number,
  businessHoursOnly: boolean,
): { responseDueAt: Date; resolutionDueAt: Date } {
  const fromDate = new Date(from);
  if (businessHoursOnly) {
    return {
      responseDueAt: addBusinessMinutes(fromDate, responseTargetMinutes),
      resolutionDueAt: addBusinessMinutes(fromDate, resolutionTargetMinutes),
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
