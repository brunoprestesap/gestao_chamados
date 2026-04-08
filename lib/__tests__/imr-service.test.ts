import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only (já via alias), dbConnect, e ChamadoModel
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockAggregate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: { aggregate: (...args: unknown[]) => mockAggregate(...args) },
}));

import { computeImrReport } from '@/lib/imr-service';

beforeEach(() => {
  vi.clearAllMocks();
});

/** Helper: cria facet vazio (sem chamados no período) */
function emptyFacet() {
  return {
    totalPorTipo: [],
    slaPorTipo: [],
    slaPorTipoEPrioridade: [],
    tempoPorTipo: [],
    avaliacaoPorTipo: [],
    penalidadesPorTipo: [],
  };
}

/** Helper: cria facet com dados para um tipo */
function singleTypeFacet(tipo: string) {
  return {
    totalPorTipo: [{ _id: tipo, count: 10 }],
    slaPorTipo: [{ _id: tipo, dentro: 8, fora: 2, total: 10 }],
    slaPorTipoEPrioridade: [
      { _id: { tipo, prioridade: 'NORMAL' }, total: 6, dentro: 5, fora: 1 },
      { _id: { tipo, prioridade: 'ALTA' }, total: 4, dentro: 3, fora: 1 },
    ],
    tempoPorTipo: [{ _id: tipo, somaMs: 36_000_000, count: 5 }], // 5 chamados, soma 10h
    avaliacaoPorTipo: [{ _id: tipo, somaRating: 20, total: 5, negativas: 1 }],
    penalidadesPorTipo: [{ _id: tipo, slaEstourado: 2, avaliacaoNegativa: 1, ambos: 1 }],
  };
}

/** Helper: facet com múltiplos tipos */
function multiTypeFacet() {
  return {
    totalPorTipo: [
      { _id: 'Manutenção Predial', count: 10 },
      { _id: 'Ar-Condicionado', count: 5 },
    ],
    slaPorTipo: [
      { _id: 'Manutenção Predial', dentro: 8, fora: 2, total: 10 },
      { _id: 'Ar-Condicionado', dentro: 4, fora: 1, total: 5 },
    ],
    slaPorTipoEPrioridade: [
      { _id: { tipo: 'Manutenção Predial', prioridade: 'NORMAL' }, total: 6, dentro: 5, fora: 1 },
      { _id: { tipo: 'Manutenção Predial', prioridade: 'ALTA' }, total: 4, dentro: 3, fora: 1 },
      { _id: { tipo: 'Ar-Condicionado', prioridade: 'NORMAL' }, total: 5, dentro: 4, fora: 1 },
    ],
    tempoPorTipo: [
      { _id: 'Manutenção Predial', somaMs: 36_000_000, count: 5 },
      { _id: 'Ar-Condicionado', somaMs: 14_400_000, count: 2 }, // 2h cada
    ],
    avaliacaoPorTipo: [
      { _id: 'Manutenção Predial', somaRating: 20, total: 5, negativas: 1 },
      { _id: 'Ar-Condicionado', somaRating: 12, total: 3, negativas: 0 },
    ],
    penalidadesPorTipo: [
      { _id: 'Manutenção Predial', slaEstourado: 2, avaliacaoNegativa: 1, ambos: 1 },
      { _id: 'Ar-Condicionado', slaEstourado: 1, avaliacaoNegativa: 0, ambos: 0 },
    ],
  };
}

const period = {
  dataInicial: new Date('2024-01-01'),
  dataFinal: new Date('2024-01-31'),
};

// ── Facet vazio (sem chamados) ───────────────────────────────────

describe('computeImrReport — sem chamados', () => {
  it('retorna zeros em todos os indicadores', async () => {
    mockAggregate.mockResolvedValue([emptyFacet()]);

    const result = await computeImrReport(period);

    expect(result.resumoGeral.totalChamados).toBe(0);
    expect(result.resumoGeral.sla.totalDentro).toBe(0);
    expect(result.resumoGeral.sla.totalFora).toBe(0);
    expect(result.resumoGeral.sla.percentualDentro).toBe(0);
    expect(result.resumoGeral.tempoMedioMs).toBeNull();
    expect(result.resumoGeral.avaliacao.mediaGeral).toBe(0);
    expect(result.resumoGeral.avaliacao.totalAvaliacoes).toBe(0);
    expect(result.resumoGeral.penalidades).toEqual([]);
    expect(result.resumoGeral.chamadosForaSla).toBe(0);
  });

  it('porTipoServico retorna um entry por TIPO_SERVICO_OPTIONS com zeros', async () => {
    mockAggregate.mockResolvedValue([emptyFacet()]);

    const result = await computeImrReport(period);

    // Deve ter 3 tipos: Manutenção Predial, Ar-Condicionado, Elevador
    expect(result.porTipoServico).toHaveLength(3);
    for (const tipo of result.porTipoServico) {
      expect(tipo.totalChamados).toBe(0);
      expect(tipo.sla.totalDentro).toBe(0);
      expect(tipo.tempoMedioMs).toBeNull();
      expect(tipo.avaliacao.mediaGeral).toBe(0);
      expect(tipo.penalidades).toEqual([]);
    }
  });
});

// ── Facet com 1 tipo ─────────────────────────────────────────────

describe('computeImrReport — único tipo', () => {
  it('calcula indicadores corretamente para Manutenção Predial', async () => {
    mockAggregate.mockResolvedValue([singleTypeFacet('Manutenção Predial')]);

    const result = await computeImrReport(period);

    // Resumo geral
    expect(result.resumoGeral.totalChamados).toBe(10);
    expect(result.resumoGeral.volumePorTipo).toEqual([
      { tipoServico: 'Manutenção Predial', total: 10 },
    ]);

    // SLA global
    expect(result.resumoGeral.sla.totalDentro).toBe(8);
    expect(result.resumoGeral.sla.totalFora).toBe(2);
    expect(result.resumoGeral.sla.percentualDentro).toBe(80);
    expect(result.resumoGeral.sla.percentualFora).toBe(20);

    // SLA por prioridade
    expect(result.resumoGeral.slaPorPrioridade).toHaveLength(2);
    const normal = result.resumoGeral.slaPorPrioridade.find((p) => p.prioridade === 'NORMAL');
    expect(normal?.total).toBe(6);
    expect(normal?.dentroSla).toBe(5);
    expect(normal?.percentualDentro).toBeCloseTo(83.33, 1);

    // Tempo médio: 36_000_000 / 5 = 7_200_000ms = 2h por chamado
    expect(result.resumoGeral.tempoMedioMs).toBe(7_200_000);

    // Avaliação: média = 20/5 = 4.0, 1 negativa de 5 avaliações
    expect(result.resumoGeral.avaliacao.mediaGeral).toBe(4.0);
    expect(result.resumoGeral.avaliacao.totalAvaliacoes).toBe(5);
    expect(result.resumoGeral.avaliacao.totalNegativas).toBe(1);
    expect(result.resumoGeral.avaliacao.percentualNegativas).toBe(20);
    expect(result.resumoGeral.avaliacao.totalNaoAvaliados).toBe(5); // 10 - 5
    expect(result.resumoGeral.avaliacao.percentualNaoAvaliados).toBe(50);

    // Penalidades
    expect(result.resumoGeral.penalidades).toHaveLength(3);
    const slaEstourado = result.resumoGeral.penalidades.find((p) => p.motivo === 'SLA estourado');
    expect(slaEstourado?.quantidade).toBe(2);
    expect(slaEstourado?.percentualSobreTotal).toBe(20);

    expect(result.resumoGeral.chamadosForaSla).toBe(2);
  });

  it('tipo inexistente no facet retorna zeros', async () => {
    mockAggregate.mockResolvedValue([singleTypeFacet('Manutenção Predial')]);

    const result = await computeImrReport(period);
    const elevador = result.porTipoServico.find((t) => t.tipoServico === 'Elevador');
    expect(elevador).toBeDefined();
    expect(elevador!.totalChamados).toBe(0);
    expect(elevador!.sla.totalDentro).toBe(0);
    expect(elevador!.tempoMedioMs).toBeNull();
  });
});

// ── Facet com múltiplos tipos ────────────────────────────────────

describe('computeImrReport — múltiplos tipos', () => {
  it('soma corretamente os indicadores globais', async () => {
    mockAggregate.mockResolvedValue([multiTypeFacet()]);

    const result = await computeImrReport(period);

    // Total: 10 + 5 = 15
    expect(result.resumoGeral.totalChamados).toBe(15);

    // SLA global: dentro = 8+4 = 12, fora = 2+1 = 3
    expect(result.resumoGeral.sla.totalDentro).toBe(12);
    expect(result.resumoGeral.sla.totalFora).toBe(3);
    expect(result.resumoGeral.sla.percentualDentro).toBe(80); // 12/15

    // Tempo médio ponderado: (36_000_000 + 14_400_000) / (5 + 2) = 50_400_000/7
    expect(result.resumoGeral.tempoMedioMs).toBeCloseTo(50_400_000 / 7, 0);

    // Avaliação global: soma rating = 32, total = 8, negativas = 1
    expect(result.resumoGeral.avaliacao.mediaGeral).toBe(4.0); // 32/8
    expect(result.resumoGeral.avaliacao.totalAvaliacoes).toBe(8);
    expect(result.resumoGeral.avaliacao.totalNaoAvaliados).toBe(7); // 15 - 8

    // SLA por prioridade (agrupada): NORMAL = 6+5=11, ALTA = 4
    const normal = result.resumoGeral.slaPorPrioridade.find((p) => p.prioridade === 'NORMAL');
    expect(normal?.total).toBe(11);
    expect(normal?.dentroSla).toBe(9); // 5+4
    expect(normal?.foraSla).toBe(2); // 1+1
  });

  it('tempo médio por tipo é calculado individualmente', async () => {
    mockAggregate.mockResolvedValue([multiTypeFacet()]);

    const result = await computeImrReport(period);

    expect(result.resumoGeral.tempoMedioPorTipo).toHaveLength(2);
    const manut = result.resumoGeral.tempoMedioPorTipo.find(
      (t) => t.tipoServico === 'Manutenção Predial',
    );
    expect(manut?.tempoMedioMs).toBe(7_200_000); // 36M / 5

    const arCond = result.resumoGeral.tempoMedioPorTipo.find(
      (t) => t.tipoServico === 'Ar-Condicionado',
    );
    expect(arCond?.tempoMedioMs).toBe(7_200_000); // 14.4M / 2
  });

  it('porTipoServico retorna dados corretos por tipo', async () => {
    mockAggregate.mockResolvedValue([multiTypeFacet()]);

    const result = await computeImrReport(period);

    const manut = result.porTipoServico.find((t) => t.tipoServico === 'Manutenção Predial');
    expect(manut?.totalChamados).toBe(10);
    expect(manut?.sla.totalDentro).toBe(8);
    expect(manut?.slaPorPrioridade).toHaveLength(2);
    expect(manut?.chamadosForaSla).toBe(2);

    const arCond = result.porTipoServico.find((t) => t.tipoServico === 'Ar-Condicionado');
    expect(arCond?.totalChamados).toBe(5);
    expect(arCond?.sla.totalDentro).toBe(4);
    expect(arCond?.slaPorPrioridade).toHaveLength(1);
  });
});

// ── Período ──────────────────────────────────────────────────────

describe('computeImrReport — período', () => {
  it('ajusta dataInicial para startOfDay e dataFinal para endOfDay', async () => {
    mockAggregate.mockResolvedValue([emptyFacet()]);

    const result = await computeImrReport({
      dataInicial: new Date('2024-03-15T14:30:00Z'),
      dataFinal: new Date('2024-03-20T09:00:00Z'),
    });

    expect(result.periodo.dataInicial.toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(result.periodo.dataFinal.toISOString()).toBe('2024-03-20T23:59:59.999Z');
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe('computeImrReport — edge cases', () => {
  it('avaliação com soma 0 e total 0 → média 0', async () => {
    const facet = {
      ...singleTypeFacet('Manutenção Predial'),
      avaliacaoPorTipo: [], // nenhuma avaliação
    };
    mockAggregate.mockResolvedValue([facet]);

    const result = await computeImrReport(period);
    expect(result.resumoGeral.avaliacao.mediaGeral).toBe(0);
    expect(result.resumoGeral.avaliacao.totalNaoAvaliados).toBe(10);
    expect(result.resumoGeral.avaliacao.percentualNaoAvaliados).toBe(100);
  });

  it('tempo sem nenhum chamado resolvido → null', async () => {
    const facet = {
      ...singleTypeFacet('Manutenção Predial'),
      tempoPorTipo: [], // nenhum tempo calculável
    };
    mockAggregate.mockResolvedValue([facet]);

    const result = await computeImrReport(period);
    expect(result.resumoGeral.tempoMedioMs).toBeNull();
    expect(result.resumoGeral.tempoMedioPorTipo).toEqual([]);
  });

  it('percentual arredonda para 2 casas decimais', async () => {
    const facet = {
      totalPorTipo: [{ _id: 'Manutenção Predial', count: 3 }],
      slaPorTipo: [{ _id: 'Manutenção Predial', dentro: 1, fora: 2, total: 3 }],
      slaPorTipoEPrioridade: [],
      tempoPorTipo: [],
      avaliacaoPorTipo: [],
      penalidadesPorTipo: [],
    };
    mockAggregate.mockResolvedValue([facet]);

    const result = await computeImrReport(period);
    // 1/3 = 33.33...% → arredondado para 33.33
    expect(result.resumoGeral.sla.percentualDentro).toBe(33.33);
    // 2/3 = 66.66...% → arredondado para 66.67
    expect(result.resumoGeral.sla.percentualFora).toBe(66.67);
  });
});
