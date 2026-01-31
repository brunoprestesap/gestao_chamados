import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Timezone institucional para exibição de datas. */
export const INSTITUTIONAL_TIMEZONE = 'America/Belem';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

export function formatDate(value: string | Date, options?: { timeZone?: string }) {
  const tz = options?.timeZone ?? INSTITUTIONAL_TIMEZONE;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: tz,
  }).format(toDate(value));
}

export function formatDateTime(value: string | Date, options?: { timeZone?: string }) {
  const tz = options?.timeZone ?? INSTITUTIONAL_TIMEZONE;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(toDate(value));
}

export function formatDateShort(value: string | Date, options?: { timeZone?: string }) {
  const tz = options?.timeZone ?? INSTITUTIONAL_TIMEZONE;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: tz,
  }).format(toDate(value));
}

export function formatTime(value: string | Date, options?: { timeZone?: string }) {
  const tz = options?.timeZone ?? INSTITUTIONAL_TIMEZONE;
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(toDate(value));
}

export function truncate(str: string, max: number) {
  if (!str) return '—';
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}
