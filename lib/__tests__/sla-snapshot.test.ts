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

import { montarSnapshotCorrecao, montarSnapshotSla } from '../sla-snapshot';

const FROM = new Date('2026-03-18T13:00:00Z');

/**
 * Alvos por prioridade usados só nos testes de `montarSnapshotCorrecao`
 * (spec 0009, AC-8/AC-9): todos 24x7 por padrão, para a aritmética ficar
 * simples de verificar a olho; os testes de horário comercial ligam
 * `businessHoursOnly` explicitamente.
 */
const ALVOS_POR_PRIORIDADE: Record<
  string,
  { responseTargetMinutes: number; resolutionTargetMinutes: number; businessHoursOnly: boolean }
> = {
  BAIXA: { responseTargetMinutes: 240, resolutionTargetMinutes: 2880, businessHoursOnly: false },
  NORMAL: { responseTargetMinutes: 120, resolutionTargetMinutes: 1440, businessHoursOnly: false },
  ALTA: { responseTargetMinutes: 60, resolutionTargetMinutes: 480, businessHoursOnly: false },
  EMERGENCIAL: { responseTargetMinutes: 15, resolutionTargetMinutes: 120, businessHoursOnly: false },
};

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

describe('montarSnapshotCorrecao', () => {
  const CLASSIFIED_AT = new Date('2026-03-10T08:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBusinessCalendarConfig).mockResolvedValue({
      timezone: 'America/Belem',
      workdayStart: '08:00',
      workdayEnd: '18:00',
      weekdays: [1, 2, 3, 4, 5],
    });
    vi.mocked(getActiveHolidaysForRange).mockResolvedValue(new Set());
    mockSlaFindOne.mockImplementation(({ priority }: { priority: string }) => ({
      lean: () =>
        Promise.resolve(
          ALVOS_POR_PRIORIDADE[priority]
            ? { priority, version: 'v1', ...ALVOS_POR_PRIORIDADE[priority] }
            : null,
        ),
    }));
  });

  describe('sobe (mais rígida)', () => {
    it('mantém o prazo quando o atual ainda é mais apertado que o novo (nunca estende)', async () => {
      // ALTA corrigida de NORMAL: classificado há 6h, restam 2h do prazo de 8h.
      const now = new Date(CLASSIFIED_AT.getTime() + 6 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 8 * 60 * 60 * 1000); // 2h restantes

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'ALTA',
        direcao: 'sobe',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 4 * 60 * 60 * 1000),
          responseStartedAt: new Date(CLASSIFIED_AT.getTime() + 30 * 60 * 1000),
          resolutionTargetMinutes: 1440,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.resolutionDueAt).toEqual(Dc);
      expect(resultado.sla.resolutionTargetMinutes).toBeUndefined();
      expect(resultado.sla.businessHoursOnly).toBeUndefined();
      expect(resultado.escalacoesApagar).toEqual([]);
    });

    it('encolhe para o prazo novo quando o atual está folgado', async () => {
      // BAIXA (48h) corrigida para EMERGENCIAL (2h): prazo novo é bem mais curto.
      const now = new Date(CLASSIFIED_AT.getTime() + 1 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 48 * 60 * 60 * 1000);

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'EMERGENCIAL',
        direcao: 'sobe',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 240 * 60 * 1000),
          responseStartedAt: null,
          resolutionTargetMinutes: 2880,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.resolutionDueAt).toEqual(new Date(now.getTime() + 120 * 60 * 1000));
      expect(resultado.sla.resolutionTargetMinutes).toBe(120);
      expect(resultado.sla.businessHoursOnly).toBe(false);
      expect(resultado.escalacoesApagar).toEqual(['warning_80']);
    });

    it('prazo já vencido: fica como está', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 10 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 8 * 60 * 60 * 1000); // já venceu há 2h

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'EMERGENCIAL',
        direcao: 'sobe',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 240 * 60 * 1000),
          responseStartedAt: null,
          resolutionTargetMinutes: 1440,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.resolutionDueAt).toEqual(Dc);
      expect(resultado.escalacoesApagar).toEqual([]);
    });

    it('não mexe em computedAt, classifiedAt, responseStartedAt nem nas violações registradas', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 6 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 8 * 60 * 60 * 1000);

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'ALTA',
        direcao: 'sobe',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 4 * 60 * 60 * 1000),
          responseStartedAt: new Date(CLASSIFIED_AT.getTime() + 30 * 60 * 1000),
          resolutionTargetMinutes: 1440,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla).not.toHaveProperty('computedAt');
      expect(resultado.sla).not.toHaveProperty('resolutionBreachedAt');
      expect(resultado.sla).not.toHaveProperty('responseBreachedAt');
    });

    it('resposta com responseStartedAt: fica, mesmo com prazo novo mais curto', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 1 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 48 * 60 * 60 * 1000);
      const responseDueAtAtual = new Date(CLASSIFIED_AT.getTime() + 240 * 60 * 1000);

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'EMERGENCIAL',
        direcao: 'sobe',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: responseDueAtAtual,
          responseStartedAt: new Date(CLASSIFIED_AT.getTime() + 10 * 60 * 1000),
          resolutionTargetMinutes: 2880,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.responseDueAt).toEqual(responseDueAtAtual);
    });

    it('sem prazo de resolução calculado: recusa sem lançar', async () => {
      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'ALTA',
        direcao: 'sobe',
        now: new Date(),
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: null,
          responseDueAt: null,
          responseStartedAt: null,
          resolutionTargetMinutes: null,
        },
      });

      expect(resultado).toEqual({ ok: false, motivo: expect.any(String) });
    });
  });

  describe('desce, sem técnico', () => {
    it('dá o prazo desde classifiedAt (regra da 0007)', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 6 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 8 * 60 * 60 * 1000);

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'NORMAL',
        direcao: 'desce',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
          responseStartedAt: null,
          resolutionTargetMinutes: 480,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.resolutionDueAt).toEqual(
        new Date(CLASSIFIED_AT.getTime() + 1440 * 60 * 1000),
      );
      expect(resultado.sla.responseDueAt).toEqual(
        new Date(CLASSIFIED_AT.getTime() + 120 * 60 * 1000),
      );
      expect(resultado.sla.resolutionTargetMinutes).toBe(1440);
      expect(resultado.escalacoesApagar).toContain('warning_80');
    });

    it('violação de resolução zerada só quando o prazo novo ainda não venceu', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 2000 * 60 * 1000); // bem depois de 1440min
      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'NORMAL',
        direcao: 'desce',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: new Date(CLASSIFIED_AT.getTime() + 120 * 60 * 1000),
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
          responseStartedAt: null,
          resolutionTargetMinutes: 120,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      // o prazo novo (1440min desde classifiedAt) já venceu em relação a `now`.
      expect(resultado.sla).not.toHaveProperty('resolutionBreachedAt');
      expect(resultado.escalacoesApagar).not.toContain('breach_resolution');
      expect(resultado.escalacoesApagar).toContain('warning_80');
    });

    it('resposta reavaliada por evaluateResponseBreach quando há responseStartedAt', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 6 * 60 * 60 * 1000);
      // responde depois do novo prazo de resposta (120min = 2h de NORMAL).
      const respondeuEm = new Date(CLASSIFIED_AT.getTime() + 180 * 60 * 1000);

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'NORMAL',
        direcao: 'desce',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: false,
        atual: {
          resolutionDueAt: new Date(CLASSIFIED_AT.getTime() + 480 * 60 * 1000),
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
          responseStartedAt: respondeuEm,
          resolutionTargetMinutes: 480,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.responseBreachedAt).toEqual(respondeuEm);
      expect(resultado.escalacoesApagar).not.toContain('breach_response');
    });
  });

  describe('desce, com técnico', () => {
    it('soma só a diferença de alvos ao prazo atual (carrega pausas sem derivar)', async () => {
      // ALTA (480min) corrigida para NORMAL (1440min): diferença de 960min.
      const now = new Date(CLASSIFIED_AT.getTime() + 3 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 5 * 60 * 60 * 1000); // já carrega pausa

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'NORMAL',
        direcao: 'desce',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: true,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
          responseStartedAt: new Date(CLASSIFIED_AT.getTime() + 10 * 60 * 1000),
          resolutionTargetMinutes: 480,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.resolutionDueAt).toEqual(new Date(Dc.getTime() + 960 * 60 * 1000));
      // responseDueAt não depende do técnico: sempre desde classifiedAt.
      expect(resultado.sla.responseDueAt).toEqual(
        new Date(CLASSIFIED_AT.getTime() + 120 * 60 * 1000),
      );
    });

    it('alvo novo igual ao atual (sobe que não moveu, seguida de descida à mesma prioridade): soma zero', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 3 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 5 * 60 * 60 * 1000);

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'ALTA',
        direcao: 'desce',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: true,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
          responseStartedAt: new Date(CLASSIFIED_AT.getTime() + 10 * 60 * 1000),
          // O alvo gravado já é o de ALTA (a subida anterior não moveu o prazo).
          resolutionTargetMinutes: 480,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.sla.resolutionDueAt).toEqual(Dc);
    });

    it('horário comercial: soma a diferença com addBusinessMinutesWithConfig, considerando feriado', async () => {
      const now = new Date(CLASSIFIED_AT.getTime() + 3 * 60 * 60 * 1000);
      const Dc = new Date(CLASSIFIED_AT.getTime() + 5 * 60 * 60 * 1000);
      vi.mocked(getActiveHolidaysForRange).mockResolvedValue(new Set(['2026-03-11']));
      mockSlaFindOne.mockImplementation(({ priority }: { priority: string }) => ({
        lean: () =>
          Promise.resolve(
            priority === 'NORMAL'
              ? { priority, version: 'v1', responseTargetMinutes: 120, resolutionTargetMinutes: 1440, businessHoursOnly: true }
              : { priority, version: 'v1', ...ALVOS_POR_PRIORIDADE[priority] },
          ),
      }));

      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'NORMAL',
        direcao: 'desce',
        now,
        classifiedAt: CLASSIFIED_AT,
        comTecnico: true,
        atual: {
          resolutionDueAt: Dc,
          responseDueAt: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
          responseStartedAt: new Date(CLASSIFIED_AT.getTime() + 10 * 60 * 1000),
          resolutionTargetMinutes: 480,
        },
      });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      // 960min úteis somados a partir de Dc, com o feriado no intervalo — bem
      // mais tarde que a soma corrida ingênua (o cálculo real é testado à
      // parte em lib/__tests__/sla-timezone.test.ts; aqui só confere a rota).
      expect(getActiveHolidaysForRange).toHaveBeenCalled();
      expect(resultado.sla.resolutionDueAt.getTime()).toBeGreaterThan(
        Dc.getTime() + 960 * 60 * 1000,
      );
    });

    it('sem prazo de resolução calculado: recusa sem lançar', async () => {
      const resultado = await montarSnapshotCorrecao({
        novaPrioridade: 'NORMAL',
        direcao: 'desce',
        now: new Date(),
        classifiedAt: CLASSIFIED_AT,
        comTecnico: true,
        atual: {
          resolutionDueAt: null,
          responseDueAt: null,
          responseStartedAt: null,
          resolutionTargetMinutes: null,
        },
      });

      expect(resultado).toEqual({ ok: false, motivo: expect.any(String) });
    });
  });

  it('sem config de SLA ativa para a prioridade nova: ok false, nunca lança', async () => {
    mockSlaFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const resultado = await montarSnapshotCorrecao({
      novaPrioridade: 'ALTA',
      direcao: 'sobe',
      now: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
      classifiedAt: CLASSIFIED_AT,
      comTecnico: false,
      atual: {
        resolutionDueAt: new Date(CLASSIFIED_AT.getTime() + 8 * 60 * 60 * 1000),
        responseDueAt: new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000),
        responseStartedAt: null,
        resolutionTargetMinutes: 480,
      },
    });

    expect(resultado).toEqual({ ok: false, motivo: expect.any(String) });
  });
});
