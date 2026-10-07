import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

import { conferirMesesEmitidos } from '../cadastro';
import {
  calcularRelatorio,
  type ChamadoDoContrato,
  type EntradaDoCalculo,
  situacaoSla,
} from '../relatorio';

/** O cálculo puro do relatório por contrato (spec 0016). covers: AC-3, AC-9, AC-11, AC-12, AC-13, AC-14 */

const H = 60 * 60 * 1000;
const agora = new Date('2026-10-20T15:00:00.000Z');

let n = 0;
function chamado(extra: Partial<ChamadoDoContrato> = {}): ChamadoDoContrato {
  n += 1;
  return {
    ativoId: 'a1',
    createdAt: new Date(`2026-09-${String(10 + (n % 10)).padStart(2, '0')}T12:00:00.000Z`),
    tipoServico: 'Ar-Condicionado',
    resolvedAt: null,
    totalPausedMinutes: 0,
    originTemplateId: null,
    status: 'em_atendimento',
    resolutionDueAt: null,
    ...extra,
  };
}

function entrada(chamados: ChamadoDoContrato[], extra: Partial<EntradaDoCalculo> = {}) {
  return {
    contrato: {
      id: 'c1',
      numero: '12/2025',
      empresa: 'Empresa',
      cnpjFormatado: '11.222.333/0001-81',
      processoSei: 'SEI',
      objeto: null,
      fiscal: null,
      tiposServico: ['Ar-Condicionado'],
      vigenciaInicio: '2025-03-01',
      vigenciaFim: '2027-02-28',
      isActive: true,
    },
    mes: '2026-09',
    inicio: new Date('2026-09-01T00:00:00.000Z'),
    fim: new Date('2026-09-30T23:59:59.999Z'),
    inicioYmd: '2026-09-01',
    fimYmd: '2026-09-30',
    chamados,
    totalCorretivos: chamados.filter((c) => !c.originTemplateId).length,
    info: new Map([
      [
        'a1',
        { codigo: '100', descricao: 'Split', categoriaId: 'k1', categoria: 'Split', caminho: null },
      ],
      [
        'a2',
        { codigo: '200', descricao: 'Self', categoriaId: 'k2', categoria: 'Self', caminho: 'Sede' },
      ],
      [
        'a3',
        { codigo: '300', descricao: 'Sem', categoriaId: null, categoria: null, caminho: null },
      ],
    ]),
    categoriasDoEscopo: [
      { id: 'k1', nome: 'Split' },
      { id: 'k9', nome: 'Chiller' },
    ],
    ativosNoEscopo: new Map([
      ['k1', 12],
      ['k9', 3],
    ]),
    agora,
    geradoPorNome: 'Admin',
    ...extra,
  } satisfies EntradaDoCalculo;
}

describe('situacaoSla (AC-13)', () => {
  const prazo = new Date('2026-10-10T00:00:00.000Z');

  it('dentro e fora pelo resolvedAt contra o prazo', () => {
    expect(situacaoSla(chamado({ resolutionDueAt: prazo, resolvedAt: prazo }), agora)).toBe(
      'dentro',
    );
    expect(
      situacaoSla(
        chamado({ resolutionDueAt: prazo, resolvedAt: new Date(prazo.getTime() + 1) }),
        agora,
      ),
    ).toBe('fora');
  });

  it('aberto com prazo vencido é fora; no prazo é em andamento', () => {
    expect(situacaoSla(chamado({ resolutionDueAt: prazo }), agora)).toBe('fora');
    expect(
      situacaoSla(chamado({ resolutionDueAt: new Date('2026-10-30T00:00:00.000Z') }), agora),
    ).toBe('emAndamento');
  });

  it('pausado com prazo passado continua em andamento', () => {
    expect(
      situacaoSla(chamado({ resolutionDueAt: prazo, status: 'aguardando_terceiros' }), agora),
    ).toBe('emAndamento');
    expect(
      situacaoSla(chamado({ resolutionDueAt: prazo, status: 'aguardando_solicitante' }), agora),
    ).toBe('emAndamento');
  });

  it('sem snapshot conta em sem SLA', () => {
    expect(situacaoSla(chamado(), agora)).toBe('semSla');
  });
});

describe('calcularRelatorio', () => {
  it('topo, tabela por ativo e por categoria com preventiva, SLA e sem categoria', () => {
    const r = calcularRelatorio(
      entrada([
        chamado({
          createdAt: new Date('2026-09-02T10:00:00.000Z'),
          resolvedAt: new Date('2026-09-02T14:00:00.000Z'),
          resolutionDueAt: new Date('2026-09-03T00:00:00.000Z'),
        }),
        chamado({ createdAt: new Date('2026-09-20T10:00:00.000Z') }),
        // Corretivo de agosto: só conta na reincidência (90 dias).
        chamado({ createdAt: new Date('2026-08-20T10:00:00.000Z') }),
        chamado({
          ativoId: 'a2',
          originTemplateId: 't1',
          resolvedAt: new Date('2026-09-15T00:00:00.000Z'),
        }),
        chamado({ ativoId: 'a3', createdAt: new Date('2026-09-05T10:00:00.000Z') }),
      ]),
    );

    expect(r.topo.corretivosTotal).toBe(3 + 1); // 4 corretivos na lista; um é de agosto
    expect(r.topo.corretivosComAtivo).toBe(3);
    expect(r.topo.ativosAfetados).toBe(2);
    expect(r.topo.mttrMedioMs).toBe(4 * H);
    expect(r.topo.ativosReincidentes).toBe(1);
    expect(r.topo.preventivasGeradas).toBe(1);
    expect(r.topo.preventivasConcluidas).toBe(1);
    expect(r.topo.sla).toEqual({
      dentro: 1,
      fora: 0,
      emAndamento: 0,
      semSla: 2,
      percentualDentro: 100,
    });

    // Ordem: categoria (sem categoria no fim), depois corretivos.
    expect(r.ativos.map((a) => a.codigo)).toEqual(['200', '100', '300']);
    const a1 = r.ativos.find((a) => a.ativoId === 'a1')!;
    expect(a1).toMatchObject({ corretivos: 2, corretivos90d: 3, reincidente: true });
    expect(a1.mtbfMs).toBe(18 * 24 * H);
    const a2 = r.ativos.find((a) => a.ativoId === 'a2')!;
    expect(a2).toMatchObject({ corretivos: 0, preventivasGeradas: 1, mtbfMs: null, mttrMs: null });

    expect(r.categorias.map((c) => c.nome)).toEqual(['Chiller', 'Self', 'Split', 'Sem categoria']);
    expect(r.categorias[0]).toMatchObject({
      ativosNoEscopo: 3,
      ativosComChamado: 0,
      mttrMedioMs: null,
    });
    expect(r.categorias[2]).toMatchObject({
      ativosNoEscopo: 12,
      ativosComChamado: 1,
      corretivos: 2,
      reincidentes: 1,
      slaDentro: 1,
    });
    expect(r.categorias[3]).toMatchObject({ categoriaId: null, ativosNoEscopo: 0, corretivos: 1 });
  });

  it('sem chamado: topo zerado com "—" onde não há denominador', () => {
    const r = calcularRelatorio(entrada([]));
    expect(r.topo.corretivosTotal).toBe(0);
    expect(r.topo.percentualComAtivo).toBeNull();
    expect(r.topo.mtbfMedioMs).toBeNull();
    expect(r.topo.sla.percentualDentro).toBeNull();
    expect(r.ativos).toEqual([]);
  });

  it('a tabela por ativo não tem o limite de 10 do ranking', () => {
    const muitos = Array.from({ length: 14 }, (_, i) => chamado({ ativoId: `x${i}` }));
    expect(calcularRelatorio(entrada(muitos)).ativos).toHaveLength(14);
  });

  it('marca o mês atual em Belém como parcial', () => {
    expect(calcularRelatorio(entrada([], { mes: '2026-10' })).janela.parcial).toBe(true);
    expect(calcularRelatorio(entrada([])).janela.parcial).toBe(false);
  });
});

describe('conferirMesesEmitidos (AC-3)', () => {
  const antes = {
    tiposServico: ['Ar-Condicionado', 'Elevador'],
    vigenciaInicio: '2026-03-15',
    vigenciaFim: '2027-03-14',
  };

  it('sem emissão, tudo pode mudar', () => {
    expect(conferirMesesEmitidos(antes, { ...antes, tiposServico: ['Elevador'] }, [])).toBeNull();
  });

  it('recusa tirar tipo quando há emissão', () => {
    expect(
      conferirMesesEmitidos(antes, { ...antes, tiposServico: ['Elevador'] }, ['2026-04']),
    ).toBe(
      'Já há relatório emitido para 04/2026; a vigência e os tipos desse período não podem mudar.',
    );
  });

  it('recusa encurtar sobre um mês emitido e aceita estender', () => {
    expect(
      conferirMesesEmitidos(antes, { ...antes, vigenciaInicio: '2026-03-20' }, ['2026-03']),
    ).toContain('03/2026');
    expect(
      conferirMesesEmitidos(antes, { ...antes, vigenciaInicio: '2026-05-01' }, ['2026-04']),
    ).toContain('04/2026');
    expect(
      conferirMesesEmitidos(
        antes,
        { ...antes, vigenciaInicio: '2026-03-01', vigenciaFim: '2027-12-31' },
        ['2026-03'],
      ),
    ).toBeNull();
    expect(
      conferirMesesEmitidos(
        antes,
        { ...antes, tiposServico: [...antes.tiposServico, 'Manutenção Predial'] },
        ['2026-03'],
      ),
    ).toBeNull();
  });
});
