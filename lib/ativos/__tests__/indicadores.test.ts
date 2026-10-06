import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

import {
  calcularFiltro,
  type CorretivoLido,
  type InfoDoAtivo,
  janelaDoPeriodo,
  MS_DIA,
  numerosDoAtivo,
  RANKING_MAX,
} from '../indicadores';

/**
 * O cálculo dos indicadores de equipamento, sem banco (spec 0014): MTBF,
 * MTTR, reincidência, ranking, percentual e os vazios. A leitura dos
 * corretivos no Mongo está em `indicadores.db.test.ts`.
 *
 * covers: AC-16, AC-17, AC-18, AC-19
 */

const H = 60 * 60 * 1000;
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const corretivo = (
  ativoId: string,
  dia: string,
  extra: Partial<CorretivoLido> = {},
): CorretivoLido => ({
  ativoId,
  createdAt: d(dia),
  tipoServico: 'Ar-Condicionado',
  resolvedAt: null,
  totalPausedMinutes: null,
  ...extra,
});

const janelaJaneiro = janelaDoPeriodo(
  new Date('2026-01-01T00:00:00.000Z'),
  new Date('2026-01-31T23:59:59.999Z'),
);

const info = (codigo: string): InfoDoAtivo => ({
  codigo,
  descricao: `Split ${codigo}`,
  categoria: 'Split',
  caminho: null,
});

describe('janelaDoPeriodo', () => {
  it('a reincidência são os 90 dias que terminam no fim do período, não no início', () => {
    expect(janelaJaneiro.inicioReincidencia.getTime()).toBe(
      janelaJaneiro.fim.getTime() - 90 * MS_DIA,
    );
    expect(janelaJaneiro.fimReincidencia).toEqual(janelaJaneiro.fim);
  });
});

describe('numerosDoAtivo (AC-17)', () => {
  it('MTBF é a média dos intervalos entre corretivos seguidos', () => {
    // Arrange: dias 1, 11 e 31 → intervalos de 10 e 20 dias
    const lista = [
      corretivo('a', '2026-01-31'),
      corretivo('a', '2026-01-01'),
      corretivo('a', '2026-01-11'),
    ];

    // Act
    const n = numerosDoAtivo(lista, lista);

    // Assert
    expect(n.mtbfMs).toBe(15 * MS_DIA);
    expect(n.corretivos).toBe(3);
  });

  it('MTBF não existe com menos de 2 corretivos', () => {
    expect(numerosDoAtivo([corretivo('a', '2026-01-01')], []).mtbfMs).toBeNull();
  });

  it('MTTR é a média só dos resolvidos, descontando a pausa', () => {
    const lista = [
      corretivo('a', '2026-01-01', {
        resolvedAt: new Date(d('2026-01-01').getTime() + 10 * H),
        totalPausedMinutes: 120,
      }),
      corretivo('a', '2026-01-05', { resolvedAt: new Date(d('2026-01-05').getTime() + 4 * H) }),
      corretivo('a', '2026-01-09'),
    ];
    const n = numerosDoAtivo(lista, lista);
    expect(n.mttrMs).toBe(6 * H);
    expect(n.somaMttrMs).toBe(12 * H);
  });

  it('MTTR não existe sem nenhum resolvido', () => {
    expect(numerosDoAtivo([corretivo('a', '2026-01-01')], []).mttrMs).toBeNull();
  });
});

describe('calcularFiltro (AC-16 a AC-19)', () => {
  it('o corretivo anterior ao período entra só na reincidência', () => {
    // Arrange: 20/12 fica fora de janeiro, mas dentro dos 90 dias
    const corretivos = [corretivo('a', '2025-12-20'), corretivo('a', '2026-01-05')];

    // Act
    const r = calcularFiltro({
      corretivos,
      totalCorretivos: 1,
      janela: janelaJaneiro,
      info: new Map([['a', info('11997')]]),
    });

    // Assert
    expect(r.topo.corretivosComAtivo).toBe(1);
    expect(r.topo.mtbfMedioMs).toBeNull();
    expect(r.topo.ativosReincidentes).toBe(1);
    expect(r.ranking[0]).toMatchObject({
      codigo: '11997',
      corretivos: 1,
      corretivos90d: 2,
      mtbfMs: null,
    });
  });

  it('o topo soma os números de todos os ativos do filtro', () => {
    const corretivos = [
      corretivo('a', '2026-01-01', { resolvedAt: new Date(d('2026-01-01').getTime() + 2 * H) }),
      corretivo('a', '2026-01-11'),
      corretivo('b', '2026-01-03', { resolvedAt: new Date(d('2026-01-03').getTime() + 4 * H) }),
    ];
    const r = calcularFiltro({
      corretivos,
      totalCorretivos: 6,
      janela: janelaJaneiro,
      info: new Map(),
    });
    expect(r.topo).toEqual({
      corretivosComAtivo: 3,
      percentualComAtivo: 50,
      ativosAfetados: 2,
      mtbfMedioMs: 10 * MS_DIA,
      mttrMedioMs: 3 * H,
      ativosReincidentes: 1,
    });
  });

  it('o percentual com denominador zero é null, nunca zero', () => {
    const r = calcularFiltro({
      corretivos: [],
      totalCorretivos: 0,
      janela: janelaJaneiro,
      info: new Map(),
    });
    expect(r.topo.percentualComAtivo).toBeNull();
    expect(r.topo.mtbfMedioMs).toBeNull();
    expect(r.topo.mttrMedioMs).toBeNull();
    expect(r.topo.corretivosComAtivo).toBe(0);
    expect(r.ranking).toEqual([]);
  });

  it('ordena por corretivos, depois soma de MTTR, depois código numérico', () => {
    // Arrange: c tem 2 corretivos; a e b têm 1 com o mesmo MTTR; d tem 1 com MTTR maior
    const resolvido = (dia: string, horas: number) => ({
      resolvedAt: new Date(d(dia).getTime() + horas * H),
    });
    const corretivos = [
      corretivo('c', '2026-01-02'),
      corretivo('c', '2026-01-03'),
      corretivo('a', '2026-01-04', resolvido('2026-01-04', 1)),
      corretivo('b', '2026-01-05', resolvido('2026-01-05', 1)),
      corretivo('d', '2026-01-06', resolvido('2026-01-06', 5)),
    ];
    const mapa = new Map([
      ['a', info('900')],
      ['b', info('1000')],
      ['c', info('5')],
      ['d', info('7')],
    ]);

    // Act
    const r = calcularFiltro({ corretivos, totalCorretivos: 5, janela: janelaJaneiro, info: mapa });

    // Assert
    expect(r.ranking.map((l) => l.codigo)).toEqual(['5', '7', '900', '1000']);
  });

  it(`lista no máximo ${RANKING_MAX} ativos`, () => {
    const corretivos = Array.from({ length: 12 }, (_, i) => corretivo(`x${i}`, '2026-01-10'));
    const r = calcularFiltro({
      corretivos,
      totalCorretivos: 12,
      janela: janelaJaneiro,
      info: new Map(),
    });
    expect(r.ranking).toHaveLength(RANKING_MAX);
    expect(r.topo.ativosAfetados).toBe(12);
  });

  it('ativo sem informação lida aparece com "—" no código, sem quebrar', () => {
    const r = calcularFiltro({
      corretivos: [corretivo('sumiu', '2026-01-10')],
      totalCorretivos: 1,
      janela: janelaJaneiro,
      info: new Map(),
    });
    expect(r.ranking[0]).toMatchObject({ codigo: '—', categoria: null, caminho: null });
  });
});
