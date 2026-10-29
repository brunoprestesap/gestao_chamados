import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O prazo de fornecimento da cotação de material (spec 0023): fim do
 * expediente do N-ésimo dia útil depois do dia (Belém) da autorização, com o
 * expediente e os feriados do SLA. Sem prazo, a autorização segue sem ele.
 *
 * covers: AC-6
 */

const calendario = vi.hoisted(() => ({
  cfg: { weekdays: [1, 2, 3, 4, 5], workdayEnd: '18:00', timezone: 'America/Belem' },
  feriados: new Set<string>(),
}));

const getActiveHolidaysForRange = vi.hoisted(() =>
  vi.fn<(de: Date, ate: Date, tz: string) => Promise<Set<string>>>(async () => calendario.feriados),
);

vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: async () => calendario.cfg,
}));
vi.mock('@/lib/holidays', () => ({ getActiveHolidaysForRange }));

import { calcularFornecimentoAte } from '../fornecimento';

beforeEach(() => {
  calendario.cfg = { weekdays: [1, 2, 3, 4, 5], workdayEnd: '18:00', timezone: 'America/Belem' };
  calendario.feriados = new Set();
  getActiveHolidaysForRange.mockReset();
  getActiveHolidaysForRange.mockImplementation(async () => calendario.feriados);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('calcularFornecimentoAte', () => {
  // Quinta-feira, 03/09/2026, 12:00 em Belém.
  const quinta = new Date('2026-09-03T15:00:00Z');

  it('autorizada numa quinta com N = 5, vence na quinta seguinte às 18:00 de Belém', async () => {
    expect(await calcularFornecimentoAte(quinta, 5)).toEqual(new Date('2026-09-10T21:00:00Z'));
  });

  it('pula o feriado ativo no meio do prazo', async () => {
    calendario.feriados = new Set(['2026-09-07']);

    expect(await calcularFornecimentoAte(quinta, 5)).toEqual(new Date('2026-09-11T21:00:00Z'));
  });

  it('conta a partir do dia de Belém, não do de UTC', async () => {
    // 02:00 UTC de sexta é 23:00 de quinta em Belém: o primeiro dia útil é a sexta.
    const quintaANoite = new Date('2026-09-04T02:00:00Z');

    expect(await calcularFornecimentoAte(quintaANoite, 1)).toEqual(
      new Date('2026-09-04T21:00:00Z'),
    );
  });

  it('usa o fim do expediente configurado', async () => {
    calendario.cfg = { ...calendario.cfg, workdayEnd: '17:00' };

    expect(await calcularFornecimentoAte(quinta, 1)).toEqual(new Date('2026-09-04T20:00:00Z'));
  });

  it('lê os feriados de 120 dias corridos a partir da autorização, folga para N até 30', async () => {
    await calcularFornecimentoAte(quinta, 30);

    const [de, ate, tz] = getActiveHolidaysForRange.mock.calls[0]!;
    expect(de).toEqual(quinta);
    expect(ate.getTime() - quinta.getTime()).toBe(120 * 24 * 60 * 60 * 1000);
    expect(tz).toBe('America/Belem');
  });

  it('com N = 30 e um feriado no caminho, ainda acha o prazo dentro da janela lida', async () => {
    calendario.feriados = new Set(['2026-09-07', '2026-10-12']);

    // 30 dias úteis de 04/09 em diante, sem 07/09 e 12/10: segunda, 19/10.
    expect(await calcularFornecimentoAte(quinta, 30)).toEqual(new Date('2026-10-19T21:00:00Z'));
  });

  it('sem nenhum dia útil na semana, devolve null em vez de girar para sempre', async () => {
    calendario.cfg = { ...calendario.cfg, weekdays: [] };

    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await calcularFornecimentoAte(quinta, 5)).toBeNull();
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('sem dia útil no expediente'));
  });

  it('com a leitura dos feriados falhando, devolve null em vez de derrubar a autorização', async () => {
    getActiveHolidaysForRange.mockRejectedValueOnce(new Error('banco fora'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await calcularFornecimentoAte(quinta, 5)).toBeNull();
    expect(erro).toHaveBeenCalledOnce();
  });
});
