import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O custo acumulado por ativo sem banco (spec 0018): a soma por ativo e por
 * janela, a lista da ficha (ordem, teto e chamados sem custo) e a tabela
 * "Mais caros" do IMR (ordem, teto e filtro por tipo). Os casos contra o
 * Mongo de verdade ficam em `custo.db.test.ts`.
 *
 * covers: AC-9, AC-10, AC-11, AC-12
 */

const banco = vi.hoisted(() => ({
  chamados: [] as object[],
  cotacoes: [] as object[],
  filtroCotacao: null as unknown,
  filtroChamado: null as unknown,
  cotacoesLidas: 0,
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    find: (filtro: unknown) => {
      banco.filtroChamado = filtro;
      return { select: () => ({ lean: async () => banco.chamados }) };
    },
  },
}));
vi.mock('@/models/Cotacao', () => ({
  CotacaoModel: {
    find: (filtro: unknown) => {
      banco.filtroCotacao = filtro;
      banco.cotacoesLidas += 1;
      return { select: () => ({ lean: async () => banco.cotacoes }) };
    },
  },
}));
const lerInfoDosAtivos = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ativos/indicadores', async (original) => ({
  ...(await original<typeof import('@/lib/ativos/indicadores')>()),
  lerInfoDosAtivos,
}));

import {
  calcularCustosAtivos,
  custoDaFicha,
  type CustoDeChamado,
  custoPorAtivo,
  lerCustosDosChamados,
} from '../custo';

const agora = new Date('2026-10-08T15:00:00.000Z');
const diasAtras = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);

function custoDe(extra: Partial<CustoDeChamado>): CustoDeChamado {
  return {
    chamadoId: String(new Types.ObjectId()),
    ativoId: 'a1',
    createdAt: diasAtras(5),
    preventiva: false,
    cotacoesCentavos: 0,
    materialCentavos: 0,
    totalCentavos: 0,
    ...extra,
  };
}

function chamado(
  o: {
    _id?: Types.ObjectId;
    ativoId?: Types.ObjectId | null;
    createdAt?: Date;
    preventiva?: boolean;
    materiais?: { quantidade: number; valorUnitario: number }[];
    tipoServico?: string;
    ticket_number?: string;
  } = {},
) {
  return {
    _id: o._id ?? new Types.ObjectId(),
    ativoId: o.ativoId === undefined ? new Types.ObjectId() : o.ativoId,
    createdAt: o.createdAt ?? diasAtras(5),
    originTemplateId: o.preventiva ? new Types.ObjectId() : null,
    materiaisForaCotacao: o.materiais ?? [],
    tipoServico: o.tipoServico ?? 'Ar-Condicionado',
    ticket_number: o.ticket_number ?? 'CHM-1',
  };
}

beforeEach(() => {
  banco.chamados = [];
  banco.cotacoes = [];
  banco.filtroCotacao = null;
  banco.filtroChamado = null;
  banco.cotacoesLidas = 0;
  lerInfoDosAtivos.mockReset();
  lerInfoDosAtivos.mockResolvedValue(new Map());
});

describe('custoPorAtivo (AC-10)', () => {
  it('separa corretivo e preventiva e soma os dois no total', () => {
    // Arrange
    const custos = [
      custoDe({ totalCentavos: 1000 }),
      custoDe({ totalCentavos: 250, preventiva: true }),
    ];

    // Act
    const r = custoPorAtivo(custos);

    // Assert
    expect(r.get('a1')).toEqual({
      corretivoCentavos: 1000,
      preventivaCentavos: 250,
      totalCentavos: 1250,
    });
  });

  it('ignora chamado sem ativo', () => {
    const r = custoPorAtivo([custoDe({ ativoId: null, totalCentavos: 500 })]);
    expect(r.size).toBe(0);
  });

  it('conta as bordas da janela e deixa de fora o que passa delas', () => {
    // Arrange
    const inicio = new Date('2026-09-01T03:00:00.000Z');
    const fim = new Date('2026-10-01T02:59:59.999Z');
    const custos = [
      custoDe({ createdAt: inicio, totalCentavos: 1 }),
      custoDe({ createdAt: fim, totalCentavos: 10 }),
      custoDe({ createdAt: new Date(inicio.getTime() - 1), totalCentavos: 100 }),
      custoDe({ createdAt: new Date(fim.getTime() + 1), totalCentavos: 1000 }),
    ];

    // Act
    const r = custoPorAtivo(custos, { inicio, fim });

    // Assert
    expect(r.get('a1')?.totalCentavos).toBe(11);
  });

  it('sem janela soma tudo', () => {
    const custos = [
      custoDe({ createdAt: diasAtras(1000), totalCentavos: 7 }),
      custoDe({ totalCentavos: 3 }),
    ];
    expect(custoPorAtivo(custos).get('a1')?.totalCentavos).toBe(10);
  });

  it('nunca muda o objeto zero compartilhado entre ativos', () => {
    const r = custoPorAtivo([
      custoDe({ ativoId: 'a1', totalCentavos: 5 }),
      custoDe({ ativoId: 'a2', totalCentavos: 9 }),
    ]);
    expect(r.get('a1')?.totalCentavos).toBe(5);
    expect(r.get('a2')?.totalCentavos).toBe(9);
  });
});

describe('lerCustosDosChamados (AC-9)', () => {
  it('lista vazia não consulta as cotações', async () => {
    expect(await lerCustosDosChamados([])).toEqual([]);
    expect(banco.cotacoesLidas).toBe(0);
  });

  it('busca só cotações aprovadas e soma cada uma no próprio chamado', async () => {
    // Arrange
    const c1 = chamado({ materiais: [{ quantidade: 2.5, valorUnitario: 10 }] });
    const c2 = chamado({ preventiva: true });
    banco.cotacoes = [
      { chamadoId: c1._id, status: 'aprovada', valorEstimado: 300, valorFinal: 280 },
      { chamadoId: c2._id, status: 'aprovada', valorEstimado: 40, valorFinal: null },
      { chamadoId: c2._id, status: 'aprovada', valorEstimado: 10 },
    ];

    // Act
    const r = await lerCustosDosChamados([c1, c2]);

    // Assert
    expect(banco.filtroCotacao).toMatchObject({ status: 'aprovada' });
    expect(r).toEqual([
      expect.objectContaining({
        chamadoId: String(c1._id),
        ativoId: String(c1.ativoId),
        preventiva: false,
        cotacoesCentavos: 28000,
        materialCentavos: 2500,
        totalCentavos: 30500,
      }),
      expect.objectContaining({
        chamadoId: String(c2._id),
        preventiva: true,
        cotacoesCentavos: 5000,
        materialCentavos: 0,
        totalCentavos: 5000,
      }),
    ]);
  });

  it('chamado sem ativo e sem material vale zero e ativo null', async () => {
    const c = chamado({ ativoId: null });
    delete (c as { materiaisForaCotacao?: unknown }).materiaisForaCotacao;
    const [r] = await lerCustosDosChamados([c]);
    expect(r).toMatchObject({ ativoId: null, totalCentavos: 0 });
  });
});

describe('custoDaFicha (AC-11)', () => {
  const ativoId = new Types.ObjectId();

  it('deixa fora de cancelado e recusado na leitura', async () => {
    await custoDaFicha(String(ativoId), 50, agora);
    expect(banco.filtroChamado).toMatchObject({
      status: { $nin: expect.arrayContaining(['cancelado', 'recusado']) },
    });
  });

  it('a lista traz só chamados com custo, do mais novo ao mais antigo', async () => {
    // Arrange
    const novo = chamado({
      ativoId,
      createdAt: diasAtras(1),
      ticket_number: 'CHM-NOVO',
      materiais: [{ quantidade: 1, valorUnitario: 1 }],
    });
    const semCusto = chamado({ ativoId, createdAt: diasAtras(2) });
    const velho = chamado({
      ativoId,
      createdAt: diasAtras(30),
      ticket_number: 'CHM-VELHO',
      preventiva: true,
      materiais: [{ quantidade: 1, valorUnitario: 2 }],
    });
    banco.chamados = [velho, semCusto, novo];

    // Act
    const r = await custoDaFicha(String(ativoId), 50, agora);

    // Assert
    expect(r.chamados.map((c) => c.numero)).toEqual(['CHM-NOVO', 'CHM-VELHO']);
    expect(r.chamados[1]).toMatchObject({
      id: String(velho._id),
      preventiva: true,
      totalCentavos: 200,
      abertoEm: velho.createdAt.toISOString(),
    });
  });

  it('no empate de abertura, o maior _id vem primeiro', async () => {
    // Arrange
    const mesmoDia = diasAtras(3);
    const menor = new Types.ObjectId('000000000000000000000001');
    const maior = new Types.ObjectId('000000000000000000000002');
    const m = [{ quantidade: 1, valorUnitario: 1 }];
    banco.chamados = [
      chamado({ _id: menor, ativoId, createdAt: mesmoDia, materiais: m }),
      chamado({ _id: maior, ativoId, createdAt: mesmoDia, materiais: m }),
    ];

    // Act
    const r = await custoDaFicha(String(ativoId), 50, agora);

    // Assert
    expect(r.chamados.map((c) => c.id)).toEqual([String(maior), String(menor)]);
  });

  it('os totais não dependem do teto da lista', async () => {
    // Arrange
    banco.chamados = Array.from({ length: 3 }, (_, i) =>
      chamado({
        ativoId,
        createdAt: diasAtras(i + 1),
        materiais: [{ quantidade: 1, valorUnitario: 1 }],
      }),
    );

    // Act
    const r = await custoDaFicha(String(ativoId), 1, agora);

    // Assert
    expect(r.chamados).toHaveLength(1);
    expect(r.doze.totalCentavos).toBe(300);
    expect(r.totalGeralCentavos).toBe(300);
  });

  it('chamado de 400 dias entra só no total desde sempre', async () => {
    // Arrange
    banco.chamados = [
      chamado({
        ativoId,
        createdAt: diasAtras(10),
        materiais: [{ quantidade: 1, valorUnitario: 5 }],
      }),
      chamado({
        ativoId,
        createdAt: diasAtras(400),
        materiais: [{ quantidade: 1, valorUnitario: 100 }],
      }),
    ];

    // Act
    const r = await custoDaFicha(String(ativoId), 50, agora);

    // Assert
    expect(r.doze).toEqual({ corretivoCentavos: 500, preventivaCentavos: 0, totalCentavos: 500 });
    expect(r.totalGeralCentavos).toBe(10500);
  });

  it('ativo sem nenhum chamado devolve tudo zerado', async () => {
    const r = await custoDaFicha(String(ativoId), 50, agora);
    expect(r).toEqual({
      doze: { corretivoCentavos: 0, preventivaCentavos: 0, totalCentavos: 0 },
      totalGeralCentavos: 0,
      chamados: [],
    });
  });
});

describe('calcularCustosAtivos (AC-12)', () => {
  const periodo = { inicio: diasAtras(30), fim: agora };

  function infoDe(ids: Types.ObjectId[], codigos: string[]) {
    return new Map(
      ids.map((id, i) => [
        String(id),
        {
          codigo: codigos[i],
          descricao: `Ativo ${codigos[i]}`,
          categoriaId: null,
          categoria: 'Split',
          caminho: 'Sede',
        },
      ]),
    );
  }

  it('lê o período pela abertura, só com ativo, fora de cancelado e recusado', async () => {
    await calcularCustosAtivos(periodo);
    expect(banco.filtroChamado).toMatchObject({
      ativoId: { $type: 'objectId' },
      status: { $nin: expect.arrayContaining(['cancelado', 'recusado']) },
      createdAt: { $gte: periodo.inicio, $lte: periodo.fim },
    });
  });

  it('ordena por total e desempata pelo código em ordem numérica', async () => {
    // Arrange
    const [a, b, c] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    const m = (v: number) => [{ quantidade: 1, valorUnitario: v }];
    banco.chamados = [
      chamado({ ativoId: a, materiais: m(10) }),
      chamado({ ativoId: b, materiais: m(10) }),
      chamado({ ativoId: c, materiais: m(50) }),
    ];
    lerInfoDosAtivos.mockResolvedValue(infoDe([a, b, c], ['10', '9', '1']));

    // Act
    const r = await calcularCustosAtivos(periodo);

    // Assert
    expect(r.geral.maisCaros.map((l) => l.codigo)).toEqual(['1', '9', '10']);
    expect(r.geral.maisCaros[0]).toMatchObject({
      ativoId: String(c),
      descricao: 'Ativo 1',
      categoria: 'Split',
      caminho: 'Sede',
      corretivoCentavos: 5000,
      preventivaCentavos: 0,
      totalCentavos: 5000,
    });
  });

  it('a tabela "Mais caros" para em 10 e deixa de fora ativo sem custo', async () => {
    // Arrange
    const ids = Array.from({ length: 12 }, () => new Types.ObjectId());
    banco.chamados = [
      ...ids.map((id, i) =>
        chamado({ ativoId: id, materiais: [{ quantidade: 1, valorUnitario: i + 1 }] }),
      ),
      chamado({ ativoId: new Types.ObjectId() }),
    ];
    lerInfoDosAtivos.mockResolvedValue(
      infoDe(
        ids,
        ids.map((_, i) => String(i + 1)),
      ),
    );

    // Act
    const r = await calcularCustosAtivos(periodo);

    // Assert
    expect(r.geral.maisCaros).toHaveLength(10);
    expect(r.geral.maisCaros[0].codigo).toBe('12');
    expect(r.geral.maisCaros.every((l) => l.totalCentavos > 0)).toBe(true);
    expect(lerInfoDosAtivos).toHaveBeenCalledWith(expect.arrayContaining(ids.map(String)));
    expect(lerInfoDosAtivos.mock.calls[0][0]).toHaveLength(12);
  });

  it('cada tipo de serviço só soma os próprios chamados', async () => {
    // Arrange
    const ativo = new Types.ObjectId();
    banco.chamados = [
      chamado({
        ativoId: ativo,
        tipoServico: 'Ar-Condicionado',
        materiais: [{ quantidade: 1, valorUnitario: 10 }],
      }),
      chamado({
        ativoId: ativo,
        tipoServico: 'Manutenção Predial',
        materiais: [{ quantidade: 1, valorUnitario: 3 }],
      }),
    ];

    // Act
    const r = await calcularCustosAtivos(periodo);

    // Assert
    expect(r.geral.porAtivo[String(ativo)].totalCentavos).toBe(1300);
    expect(r.porTipo['Ar-Condicionado'].porAtivo[String(ativo)].totalCentavos).toBe(1000);
    expect(r.porTipo['Manutenção Predial'].porAtivo[String(ativo)].totalCentavos).toBe(300);
  });

  it('ativo sem informação cadastrada aparece com "—" no código', async () => {
    const ativo = new Types.ObjectId();
    banco.chamados = [
      chamado({ ativoId: ativo, materiais: [{ quantidade: 1, valorUnitario: 1 }] }),
    ];
    const r = await calcularCustosAtivos(periodo);
    expect(r.geral.maisCaros[0]).toMatchObject({ codigo: '—', descricao: '', categoria: null });
  });

  it('sem chamados, as listas ficam vazias', async () => {
    const r = await calcularCustosAtivos(periodo);
    expect(r.geral).toEqual({ porAtivo: {}, maisCaros: [] });
    expect(r.porTipo['Ar-Condicionado'].maisCaros).toEqual([]);
  });
});
