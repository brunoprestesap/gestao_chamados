import { describe, expect, it } from 'vitest';

import {
  BUSINESS_MINUTES_PER_DAY,
  MAX_BUSINESS_MINUTES,
  MAX_REAL_MINUTES,
  SlaConfigItemSchema,
  toMinutes,
} from '@/shared/sla/sla-config.schemas';

// ── toMinutes ────────────────────────────────────────────────────

describe('toMinutes', () => {
  it('converte 1 hora para 60 minutos', () => {
    expect(toMinutes(1, 'Horas')).toBe(60);
  });

  it('converte 2.5 horas para 150 minutos', () => {
    expect(toMinutes(2.5, 'Horas')).toBe(150);
  });

  it('converte 0.5 horas para 30 minutos', () => {
    expect(toMinutes(0.5, 'Horas')).toBe(30);
  });

  it('converte 1 dia para 600 minutos (padrão)', () => {
    expect(toMinutes(1, 'Dias')).toBe(BUSINESS_MINUTES_PER_DAY);
  });

  it('converte 1 dia com businessMinutesPerDay customizado', () => {
    expect(toMinutes(1, 'Dias', 480)).toBe(480);
  });

  it('converte 0.5 dia para 300 minutos', () => {
    expect(toMinutes(0.5, 'Dias')).toBe(300);
  });

  it('arredonda resultado para inteiro', () => {
    // 1/3 hora = 20 min (arredondado de 19.999...)
    expect(toMinutes(1 / 3, 'Horas')).toBe(20);
  });
});

// ── Constants ────────────────────────────────────────────────────

describe('SLA config constants', () => {
  it('BUSINESS_MINUTES_PER_DAY = 600 (10h)', () => {
    expect(BUSINESS_MINUTES_PER_DAY).toBe(600);
  });

  it('MAX_BUSINESS_MINUTES = 30 dias úteis', () => {
    expect(MAX_BUSINESS_MINUTES).toBe(30 * 600);
  });

  it('MAX_REAL_MINUTES = 30 dias corridos', () => {
    expect(MAX_REAL_MINUTES).toBe(30 * 24 * 60);
  });
});

// ── SlaConfigItemSchema ──────────────────────────────────────────

describe('SlaConfigItemSchema', () => {
  const validItem = {
    priority: 'NORMAL' as const,
    responseValue: 2,
    responseUnit: 'Horas' as const,
    resolutionValue: 8,
    resolutionUnit: 'Horas' as const,
    businessHoursOnly: true,
  };

  it('aceita input válido', () => {
    expect(SlaConfigItemSchema.safeParse(validItem).success).toBe(true);
  });

  it('rejeita responseValue <= 0', () => {
    const result = SlaConfigItemSchema.safeParse({ ...validItem, responseValue: 0 });
    expect(result.success).toBe(false);
  });

  it('rejeita prioridade inválida', () => {
    const result = SlaConfigItemSchema.safeParse({ ...validItem, priority: 'INVALIDA' });
    expect(result.success).toBe(false);
  });

  it('rejeita unidade inválida', () => {
    const result = SlaConfigItemSchema.safeParse({ ...validItem, responseUnit: 'Minutos' });
    expect(result.success).toBe(false);
  });

  it('rejeita valor que excede limite (businessHoursOnly)', () => {
    // 31 dias úteis em horas = 310h → 18600 min > MAX_BUSINESS_MINUTES (18000)
    const result = SlaConfigItemSchema.safeParse({
      ...validItem,
      resolutionValue: 310,
      resolutionUnit: 'Horas',
      businessHoursOnly: true,
    });
    expect(result.success).toBe(false);
  });

  it('aceita valor no limite exato (businessHoursOnly)', () => {
    // 30 dias úteis = 300h → 18000 min = MAX_BUSINESS_MINUTES
    const result = SlaConfigItemSchema.safeParse({
      ...validItem,
      resolutionValue: 300,
      resolutionUnit: 'Horas',
      businessHoursOnly: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejeita valor que excede limite (24x7)', () => {
    // 31 dias corridos = 744h → 44640 min > MAX_REAL_MINUTES (43200)
    const result = SlaConfigItemSchema.safeParse({
      ...validItem,
      resolutionValue: 744,
      resolutionUnit: 'Horas',
      businessHoursOnly: false,
    });
    expect(result.success).toBe(false);
  });
});
