import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O snapshot de SLA (spec 0007): único lugar que calcula o snapshot — a
 * classificação manual e o caminho automático da abertura pela conversa
 * chamam esta mesma função, para os dois caminhos nunca divergirem. Mocka os
 * limites do módulo (banco, expediente, feriados); o cálculo de prazo em si
 * já tem cobertura própria em `lib/__tests__/sla-utils.test.ts`.
 */

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: vi.fn().mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  }),
}));

vi.mock('@/lib/holidays', () => ({
  getActiveHolidaysForRange: vi.fn().mockResolvedValue(new Set()),
}));

const mockSlaFindOne = vi.fn();
vi.mock('@/models/SlaConfig', () => ({
  SlaConfigModel: { findOne: (...args: unknown[]) => mockSlaFindOne(...args) },
}));

import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';

import { montarSnapshotSla } from '../sla-snapshot';

const FROM = new Date('2026-03-18T13:00:00Z');

describe('montarSnapshotSla', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBusinessCalendarConfig).mockResolvedValue({
      timezone: 'America/Belem',
      workdayStart: '08:00',
      workdayEnd: '18:00',
      weekdays: [1, 2, 3, 4, 5],
    });
    vi.mocked(getActiveHolidaysForRange).mockResolvedValue(new Set());
  });

  it('sem config de SLA ativa para a prioridade: ok false, com motivo (AC-4)', async () => {
    mockSlaFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const resultado = await montarSnapshotSla('NORMAL', FROM);

    expect(resultado).toEqual({
      ok: false,
      motivo: expect.stringContaining('NORMAL'),
    });
    if (!resultado.ok) {
      expect(resultado.motivo).toContain('Configurações SLA');
    }
  });

  it('monta o snapshot a partir da config ativa (caminho feliz)', async () => {
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          priority: 'ALTA',
          responseTargetMinutes: 60,
          resolutionTargetMinutes: 240,
          businessHoursOnly: true,
          version: 'v2',
        }),
    });

    const resultado = await montarSnapshotSla('ALTA', FROM);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.snapshot).toMatchObject({
      priority: 'ALTA',
      responseTargetMinutes: 60,
      resolutionTargetMinutes: 240,
      businessHoursOnly: true,
      computedAt: FROM,
      configVersion: 'v2',
    });
    expect(resultado.snapshot.responseDueAt).toBeInstanceOf(Date);
    expect(resultado.snapshot.resolutionDueAt).toBeInstanceOf(Date);
    expect(mockSlaFindOne).toHaveBeenCalledWith({ priority: 'ALTA', isActive: true });
  });

  it('sem version na config ativa: cai no SLA_CONFIG_VERSION do módulo', async () => {
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          priority: 'BAIXA',
          responseTargetMinutes: 480,
          resolutionTargetMinutes: 2880,
          businessHoursOnly: false,
          version: undefined,
        }),
    });

    const resultado = await montarSnapshotSla('BAIXA', FROM);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.snapshot.configVersion).toBeTruthy();
  });

  it('erro ao calcular calendário: nunca lança, devolve ok false com a mensagem do erro', async () => {
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          priority: 'EMERGENCIAL',
          responseTargetMinutes: 30,
          resolutionTargetMinutes: 120,
          businessHoursOnly: false,
          version: 'v1',
        }),
    });
    vi.mocked(getBusinessCalendarConfig).mockRejectedValue(new Error('config indisponível'));

    const resultado = await montarSnapshotSla('EMERGENCIAL', FROM);

    expect(resultado).toEqual({ ok: false, motivo: 'config indisponível' });
  });

  it('erro não-Error: cai na mensagem genérica', async () => {
    mockSlaFindOne.mockReturnValue({
      lean: () => Promise.reject('falha inesperada'),
    });

    const resultado = await montarSnapshotSla('NORMAL', FROM);

    expect(resultado).toEqual({ ok: false, motivo: 'Erro ao calcular o snapshot de SLA.' });
  });
});
