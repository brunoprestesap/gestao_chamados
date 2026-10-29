import { describe, expect, it } from 'vitest';

import {
  avaliarReincidencia,
  estadoDoMes,
  mesTerminou,
  reincidenciaDaFoto,
  somaEFaixa,
} from '../fechamento.regras';

const d = (iso: string) => new Date(iso);

describe('estadoDoMes', () => {
  it('sem fechamento, o mês está aberto na versão 0', () => {
    expect(estadoDoMes([], [])).toEqual({ fechado: false, maiorVersao: 0, intervalos: [] });
  });

  it('a maior versão sem reabertura fecha o mês (AC-10)', () => {
    const e = estadoDoMes([{ versao: 1, fechadoEm: d('2026-11-03T12:00:00Z') }], []);
    expect(e.fechado).toBe(true);
    expect(e.maiorVersao).toBe(1);
    expect(e.intervalos).toEqual([{ de: d('2026-11-03T12:00:00Z'), ate: null }]);
  });

  it('reabrir a maior versão volta o mês para aberto e fecha o intervalo (AC-11)', () => {
    const e = estadoDoMes(
      [{ versao: 1, fechadoEm: d('2026-11-03T12:00:00Z') }],
      [{ versaoReaberta: 1, em: d('2026-11-05T12:00:00Z') }],
    );
    expect(e.fechado).toBe(false);
    expect(e.maiorVersao).toBe(1);
    expect(e.intervalos).toEqual([
      { de: d('2026-11-03T12:00:00Z'), ate: d('2026-11-05T12:00:00Z') },
    ]);
  });

  it('a versão 2 depois da reabertura da 1 fecha de novo', () => {
    const e = estadoDoMes(
      [
        { versao: 2, fechadoEm: d('2026-11-06T12:00:00Z') },
        { versao: 1, fechadoEm: d('2026-11-03T12:00:00Z') },
      ],
      [{ versaoReaberta: 1, em: d('2026-11-05T12:00:00Z') }],
    );
    expect(e.fechado).toBe(true);
    expect(e.maiorVersao).toBe(2);
    expect(e.intervalos).toHaveLength(2);
    expect(e.intervalos[1]).toEqual({ de: d('2026-11-06T12:00:00Z'), ate: null });
  });
});

describe('somaEFaixa (AC-10, AC-17)', () => {
  it.each([
    [100, 1, 100],
    [80, 1, 100],
    [79, 0.97, 97],
    [70, 0.97, 97],
    [69, 0.95, 95],
    [60, 0.95, 95],
    [59, 0.93, 93],
    [50, 0.93, 93],
    [49, 0.9, 90],
    [0, 0.9, 90],
  ])('total %i dá fator %s', (total, fator, percentual) => {
    // Distribui o total entre os quatro indicadores sem passar dos máximos.
    const i1 = Math.min(40, total);
    const i2 = Math.min(20, total - i1);
    const i3 = Math.min(20, total - i1 - i2);
    const i4 = total - i1 - i2 - i3;
    expect(somaEFaixa({ i1, i2, i3, i4 })).toEqual({ total, faixa: { fator, percentual } });
  });
});

describe('avaliarReincidencia (AC-12)', () => {
  const base = { competencia: '2026-11', vigenciaInicio: '2025-03-01' };

  it('zero no I3 em dois meses fechados seguidos é reincidência', () => {
    expect(
      avaliarReincidencia({
        ...base,
        atual: { i1: 40, i2: 20, i3: 0, i4: 15 },
        anterior: { i1: 40, i2: 20, i3: 0, i4: 0 },
      }),
    ).toEqual({ avaliada: true, zerados: [3] });
  });

  it('sem zero repetido, avaliada sem reincidência', () => {
    expect(
      avaliarReincidencia({
        ...base,
        atual: { i1: 0, i2: 20, i3: 20, i4: 0 },
        anterior: { i1: 40, i2: 20, i3: 0, i4: 5 },
      }),
    ).toEqual({ avaliada: true, zerados: [] });
  });

  it('na prévia, I1 e I2 nulos ficam de fora', () => {
    expect(
      avaliarReincidencia({
        ...base,
        atual: { i1: null, i2: null, i3: 0, i4: 0 },
        anterior: { i1: 0, i2: 0, i3: 0, i4: 0 },
      }),
    ).toEqual({ avaliada: true, zerados: [3, 4] });
  });

  it('mês anterior aberto: não avaliada', () => {
    expect(
      avaliarReincidencia({ ...base, atual: { i1: 0, i2: 0, i3: 0, i4: 0 }, anterior: null }),
    ).toEqual({ avaliada: false, motivo: 'mes_anterior_aberto' });
  });

  it('primeiro mês da vigência: não avaliada, mesmo com dado anterior', () => {
    expect(
      avaliarReincidencia({
        competencia: '2025-03',
        vigenciaInicio: '2025-03-15',
        atual: { i1: 0, i2: 0, i3: 0, i4: 0 },
        anterior: { i1: 0, i2: 0, i3: 0, i4: 0 },
      }),
    ).toEqual({ avaliada: false, motivo: 'primeiro_mes' });
  });

  it('janeiro olha dezembro do ano anterior', () => {
    expect(
      avaliarReincidencia({
        competencia: '2026-01',
        vigenciaInicio: '2025-12-01',
        atual: { i1: 40, i2: 20, i3: 0, i4: 20 },
        anterior: null,
      }),
    ).toEqual({ avaliada: false, motivo: 'mes_anterior_aberto' });
  });
});

describe('reincidenciaDaFoto', () => {
  it('devolve os zerados quando avaliada', () => {
    expect(
      reincidenciaDaFoto({
        competencia: '2026-11',
        reincidenciaZero: [4],
        reincidenciaAvaliada: true,
        parametros: { vigencia: { inicio: '2025-03-01' } },
      }),
    ).toEqual({ avaliada: true, zerados: [4] });
  });

  it('distingue o primeiro mês do mês anterior aberto pela vigência gravada', () => {
    const foto = { reincidenciaZero: [], reincidenciaAvaliada: false };
    expect(
      reincidenciaDaFoto({
        ...foto,
        competencia: '2025-03',
        parametros: { vigencia: { inicio: '2025-03-01' } },
      }),
    ).toEqual({ avaliada: false, motivo: 'primeiro_mes' });
    expect(
      reincidenciaDaFoto({
        ...foto,
        competencia: '2025-04',
        parametros: { vigencia: { inicio: '2025-03-01' } },
      }),
    ).toEqual({ avaliada: false, motivo: 'mes_anterior_aberto' });
  });
});

describe('mesTerminou (AC-10)', () => {
  it('só depois do último dia do mês, em Belém', () => {
    expect(mesTerminou('2026-10', '2026-10-31')).toBe(false);
    expect(mesTerminou('2026-10', '2026-11-01')).toBe(true);
    expect(mesTerminou('2026-12', '2027-01-01')).toBe(true);
  });
});
