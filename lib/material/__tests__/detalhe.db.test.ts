import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

/**
 * O detalhe repaginado (spec 0021, fatia 2) contra o MongoDB de verdade: o
 * bloco Empenho por situação, sem desconto em dobro depois da reserva, as
 * datas da jornada e os campos novos filtrados por visão.
 *
 * Fatia 4: a faixa de quem aprova só vai ao próprio aprovador TRF1, em
 * aprovação, quando ela cobre o valor.
 *
 * covers: AC-5, AC-8, AC-10, AC-24
 */

function cru(m: {
  createIndexes(): PromiseLike<unknown>;
  collection: { deleteMany(f: object): Promise<unknown>; indexes(): Promise<unknown> };
}): ModelDeTeste {
  return {
    createIndexes: () => m.createIndexes(),
    deleteMany: (f) => m.collection.deleteMany(f),
    collection: m.collection,
  };
}

const rodar = temMongoDeTeste ? describe : describe.skip;

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date();
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);
const ANO = Number(
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric' }).format(AGORA),
);

rodar('detalhe da cotação repaginado, contra o Mongo', () => {
  let leitura: typeof import('../leitura');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Empenho: typeof import('@/models/Empenho').EmpenhoModel;
    Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
  };
  let todos: ModelDeTeste[];

  const ids = {
    rt: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    tecnico: String(new Types.ObjectId()),
  };
  const fiscal = { userId: ids.fiscal, role: 'Admin' };
  const rt = { userId: ids.rt, role: 'Preposto' };
  const tecnico = { userId: ids.tecnico, role: 'Técnico' };

  async function empenho(numero: string, liquido: number, comprometido: number) {
    const e = await M.Empenho.create({
      numero,
      exercicio: ANO,
      valorInicialCentavos: liquido,
      valorLiquidoCentavos: liquido,
      comprometidoCentavos: comprometido,
      criadoPorUserId: new Types.ObjectId(),
    });
    return e._id;
  }

  /** Grava um chamado e uma cotação crus, com a trilha que o teste pedir. */
  async function cotacao(p: {
    situacao: string;
    valor: number;
    empenhoId?: Types.ObjectId;
    fiscalAssumiu?: boolean;
    eventos?: { de: string | null; para: string; acao: string; ha: number }[];
  }) {
    const chamadoId = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id: chamadoId,
      ticket_number: '2274',
      titulo: 'Troca do disjuntor',
      status: 'em atendimento',
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(),
    });
    const _id = new Types.ObjectId();
    await M.Cotacao.collection.insertOne({
      _id,
      numero: 'COT-2026-0145',
      chamadoId,
      situacao: p.situacao,
      emTramite: [
        'rascunho',
        'enviada',
        'em_analise',
        'em_aprovacao',
        'devolvida',
        'autorizada',
      ].includes(p.situacao),
      versao: 1,
      itens: [
        {
          _id: new Types.ObjectId(),
          descricao: 'Disjuntor bipolar 40 A',
          unidade: 'un',
          quantidade: 1,
          motivo: 'Troca',
          doDiagnostico: true,
          origem: 'orcamento',
          precoAplicadoCentavos: p.valor,
          quantidadeExecutada: null,
          valorExecutadoCentavos: null,
          referencias: [],
        },
      ],
      orcamentos: [],
      advertencias: [],
      montadoPorUserId: new Types.ObjectId(ids.rt),
      fiscalUserId: p.fiscalAssumiu ? new Types.ObjectId(ids.fiscal) : null,
      diagnosticadoPorUserId: new Types.ObjectId(ids.tecnico),
      diagnosticadoEm: diasAtras(10),
      valorTotalCentavos: p.valor,
      empenhoId: p.empenhoId ?? null,
      valorAutorizadoCentavos: p.empenhoId ? p.valor : null,
      autorizadoEm: p.empenhoId ? diasAtras(1) : null,
      executadoEm: null,
      valorExecutadoCentavos: null,
      urgencia: null,
      notaFiscal: null,
      createdAt: diasAtras(10),
      updatedAt: diasAtras(0),
    });
    for (const e of p.eventos ?? []) {
      await M.Evento.collection.insertOne({
        cotacaoId: _id,
        de: e.de,
        para: e.para,
        acao: e.acao,
        papel: 'sistema',
        autorNome: null,
        advertenciasNoAto: [],
        em: diasAtras(e.ha),
      });
    }
    return String(_id);
  }

  beforeAll(async () => {
    leitura = await import('../leitura');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Empenho: (await import('@/models/Empenho')).EmpenhoModel,
      Faixa: (await import('@/models/FaixaCompetencia')).FaixaCompetenciaModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_detalhe');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await M.User.collection.insertMany([
      {
        _id: new Types.ObjectId(ids.rt),
        username: 'rt',
        name: 'Carlos RT',
        role: 'Preposto',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.fiscal),
        username: 'fiscal',
        name: 'Marina Fiscal',
        role: 'Admin',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.tecnico),
        username: 'tec',
        name: 'José Técnico',
        role: 'Técnico',
        isActive: true,
      },
    ]);
    const designar = (userId: string, papel: string) =>
      M.Designacao.create({
        userId: new Types.ObjectId(userId),
        papel: papel as never,
        vigenciaInicio: '2000-01-01',
        ato: 'Portaria de teste',
        criadoPorUserId: new Types.ObjectId(),
        em: new Date(),
      });
    await designar(ids.rt, 'responsavel_tecnico');
    await designar(ids.fiscal, 'fiscal');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('em aprovação, cada elegível mostra o saldo menos o valor da cotação (AC-8)', async () => {
    await empenho('NE-A', 1000_00, 200_00);
    await empenho('NE-B', 500_00, 0);
    const id = await cotacao({ situacao: 'em_aprovacao', valor: 300_00 });

    const d = await leitura.lerDetalhe(id, fiscal);
    const emp = d?.cotacao.empenho;
    expect(emp?.modo).toBe('aprovacao');
    expect(
      emp?.barras.map((b) => [b.numero, b.estaCotacaoCentavos, b.saldoDepoisCentavos]),
    ).toEqual([
      ['NE-A', 300_00, 500_00],
      ['NE-B', 300_00, 200_00],
    ]);
    expect(emp?.barras[0]).toMatchObject({
      liquidoCentavos: 1000_00,
      comprometidoCentavos: 200_00,
    });
    expect(emp?.podemAprovar).toEqual([]);
  });

  it('autorizada: o saldo depois é o saldo de agora, sem descontar a reserva de novo (AC-8)', async () => {
    // A reserva de 300 já está nos 500 comprometidos.
    const daCotacao = await empenho('NE-A', 1000_00, 500_00);
    await empenho('NE-B', 500_00, 0);
    const id = await cotacao({ situacao: 'autorizada', valor: 300_00, empenhoId: daCotacao });

    const d = await leitura.lerDetalhe(id, fiscal);
    const emp = d?.cotacao.empenho;
    expect(emp?.modo).toBe('da_cotacao');
    expect(emp?.barras).toHaveLength(1);
    expect(emp?.barras[0]).toMatchObject({
      numero: 'NE-A',
      comprometidoCentavos: 200_00,
      estaCotacaoCentavos: 300_00,
      saldoDepoisCentavos: 500_00,
    });
    expect(emp?.podemAprovar).toBeNull();
    expect(d?.empenhoNumero).toBe('NE-A');
  });

  it('antes da aprovação, os elegíveis vêm com o saldo de agora e sem o valor da cotação (AC-8)', async () => {
    await empenho('NE-A', 1000_00, 200_00);
    const id = await cotacao({ situacao: 'em_analise', valor: 300_00, fiscalAssumiu: true });

    const emp = (await leitura.lerDetalhe(id, fiscal))?.cotacao.empenho;
    expect(emp?.modo).toBe('elegiveis');
    expect(emp?.barras[0]).toMatchObject({
      estaCotacaoCentavos: null,
      saldoDepoisCentavos: 800_00,
    });
  });

  it('sem empenho elegível, o bloco vem sem barra, nunca com zero (AC-8)', async () => {
    const id = await cotacao({ situacao: 'enviada', valor: 300_00 });
    const emp = (await leitura.lerDetalhe(id, fiscal))?.cotacao.empenho;
    expect(emp).toEqual({ modo: 'elegiveis', barras: [], podemAprovar: null });
  });

  it('a jornada data cada etapa e, depois da devolução, conta a partir do reenvio (AC-5)', async () => {
    const id = await cotacao({
      situacao: 'em_analise',
      valor: 100_00,
      fiscalAssumiu: true,
      eventos: [
        { de: null, para: 'rascunho', acao: 'criar', ha: 10 },
        { de: 'rascunho', para: 'enviada', acao: 'enviar', ha: 9 },
        { de: 'enviada', para: 'em_analise', acao: 'assumir', ha: 8 },
        { de: 'em_analise', para: 'devolvida', acao: 'devolver', ha: 7 },
        { de: 'devolvida', para: 'enviada', acao: 'enviar', ha: 5 },
        { de: 'enviada', para: 'em_analise', acao: 'assumir', ha: 4 },
      ],
    });

    const etapas = (await leitura.lerDetalhe(id, fiscal))?.cotacao.etapas;
    expect(etapas).toEqual([
      { situacao: 'rascunho', em: diasAtras(10).toISOString() },
      { situacao: 'enviada', em: diasAtras(5).toISOString() },
      { situacao: 'em_analise', em: diasAtras(4).toISOString() },
    ]);
  });

  it('os campos novos seguem a visão: nome do fiscal e empenho só no TRF1, nada de jornada datada ao técnico (AC-24)', async () => {
    await empenho('NE-A', 1000_00, 0);
    const id = await cotacao({ situacao: 'em_analise', valor: 300_00, fiscalAssumiu: true });

    const trf1 = await leitura.lerDetalhe(id, fiscal);
    expect(trf1?.cotacao.quemAgeAgora).toEqual({ papel: 'fiscal', nome: 'Marina Fiscal' });
    expect(trf1?.cotacao.montadoPorNome).toBe('Carlos RT');
    expect(trf1?.papeis).toEqual(['fiscal']);

    const contratada = await leitura.lerDetalhe(id, rt);
    expect(contratada?.cotacao.visao).toBe('contratada');
    expect(contratada?.cotacao.quemAgeAgora).toEqual({ papel: 'fiscal', nome: null });
    expect(contratada?.cotacao.montadoPorNome).toBe('Carlos RT');
    expect(contratada?.cotacao.empenho).toBeUndefined();
    expect(JSON.stringify(contratada)).not.toMatch(/Marina|NE-A|saldoDepois|liquidoCentavos/);

    const tec = await leitura.lerDetalhe(id, tecnico);
    expect(tec?.cotacao.visao).toBe('tecnico');
    expect(tec?.cotacao.etapas).toBeUndefined();
    expect(tec?.cotacao.montadoPorNome).toBeUndefined();
    expect(tec?.cotacao.empenho).toBeUndefined();
    expect(tec?.papeis).toEqual(['tecnico']);
    expect(JSON.stringify(tec)).not.toMatch(/Marina|Carlos|NE-A/);
  });
  it('a faixa de quem aprova só vai ao aprovador TRF1, em aprovação, quando cobre o valor (AC-10, AC-24)', async () => {
    await empenho('NE-A', 1000_00, 0);
    const faixa = await M.Faixa.create({
      nome: 'Faixa II',
      limiteCentavos: 500_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    await M.Designacao.create({
      userId: new Types.ObjectId(ids.fiscal),
      papel: 'aprovador' as never,
      faixaId: faixa._id,
      vigenciaInicio: '2000-01-01',
      ato: 'Portaria de teste',
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });

    const cobre = await cotacao({ situacao: 'em_aprovacao', valor: 300_00 });
    const trf1 = await leitura.lerDetalhe(cobre, fiscal);
    expect(trf1?.faixaDoLeitor).toEqual({ nome: 'Faixa II', limiteCentavos: 500_00 });
    // A lista de quem pode aprovar sai sem o nome da faixa.
    expect(trf1?.aprovadoresQueCobrem).toEqual([
      { userId: ids.fiscal, nome: 'Marina Fiscal', limiteCentavos: 500_00 },
    ]);

    const contratada = await leitura.lerDetalhe(cobre, rt);
    expect(contratada?.faixaDoLeitor).toBeUndefined();
    expect(JSON.stringify(contratada)).not.toMatch(/Faixa II/);

    const mudar = (campos: object) =>
      M.Cotacao.collection.updateOne({ _id: new Types.ObjectId(cobre) }, { $set: campos });
    await mudar({ valorTotalCentavos: 800_00 });
    expect((await leitura.lerDetalhe(cobre, fiscal))?.faixaDoLeitor).toBeUndefined();

    await mudar({ valorTotalCentavos: 300_00, situacao: 'em_analise' });
    expect((await leitura.lerDetalhe(cobre, fiscal))?.faixaDoLeitor).toBeUndefined();
  });
});
