import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * O custo acumulado por ativo contra o MongoDB de verdade (spec 0018): a
 * conta do chamado, corretivo e preventiva, cancelado fora, a troca de ativo
 * e a paridade entre ficha, IMR e substituição.
 *
 * covers: AC-8, AC-9, AC-10, AC-11, AC-12, AC-14, AC-15
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('custo por ativo, contra o Mongo', () => {
  let custo: typeof import('../custo');
  let substituicao: typeof import('../substituicao');
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let CotacaoModel: typeof import('@/models/Cotacao').CotacaoModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let todos: ModelDeTeste[];

  // Meio do dia em Belém, longe das bordas da janela de 12 meses.
  const agora = new Date('2026-10-08T15:00:00.000Z');
  const diasAtras = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    custo = await import('../custo');
    substituicao = await import('../substituicao');
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ CotacaoModel } = await import('@/models/Cotacao'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    todos = [
      ChamadoModel,
      CotacaoModel,
      AtivoModel,
      CategoriaAtivoModel,
    ] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_custo_ativo');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function categoria(extra: object = {}): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await CategoriaAtivoModel.collection.insertOne({
      _id,
      chave: `cat_${String(_id)}`,
      nome: `Categoria ${String(_id)}`,
      criticidadePadrao: 'media',
      ...extra,
    });
    return _id;
  }

  async function ativo(categoriaId: Types.ObjectId, valorHistorico?: number) {
    const _id = new Types.ObjectId();
    await AtivoModel.collection.insertOne({
      _id,
      codigo: `MNT-${String(_id).slice(-4)}`,
      descricao: 'Split',
      categoriaId,
      tierManutencao: 'A',
      status: 'em_operacao',
      ...(valorHistorico !== undefined && { camposPatrimoniais: { valorHistorico } }),
    });
    return _id;
  }

  async function chamado(
    ativoId: Types.ObjectId | null,
    o: {
      createdAt?: Date;
      status?: string;
      preventiva?: boolean;
      materiais?: { quantidade: number; valorUnitario: number }[];
    } = {},
  ) {
    const _id = new Types.ObjectId();
    await ChamadoModel.collection.insertOne({
      _id,
      ticket_number: `CHM-${String(_id).slice(-5)}`,
      tipoServico: 'Ar-Condicionado',
      status: o.status ?? 'concluído',
      ativoId,
      originTemplateId: o.preventiva ? new Types.ObjectId() : null,
      createdAt: o.createdAt ?? diasAtras(10),
      materiaisForaCotacao: (o.materiais ?? []).map((m) => ({
        _id: new Types.ObjectId(),
        descricao: 'Material',
        criadoPorUserId: new Types.ObjectId(),
        criadoEm: new Date(),
        ...m,
      })),
    });
    return _id;
  }

  async function cotacao(
    chamadoId: Types.ObjectId,
    status: string,
    valorEstimado: number,
    valorFinal?: number,
  ) {
    await CotacaoModel.collection.insertOne({
      chamadoId,
      status,
      valorEstimado,
      ...(valorFinal !== undefined && { valorFinal }),
    });
  }

  it('soma cotação aprovada pelo valor final e material; separa preventiva; ignora cancelado (AC-9, AC-10, AC-11)', async () => {
    // Arrange
    const a = await ativo(await categoria());
    const c1 = await chamado(a, {
      createdAt: diasAtras(5),
      materiais: [{ quantidade: 2.5, valorUnitario: 10 }],
    });
    await cotacao(c1, 'aprovada', 300, 280);
    await cotacao(c1, 'recusada', 999);
    await chamado(a, { preventiva: true, materiais: [{ quantidade: 1, valorUnitario: 40 }] });
    const cancelado = await chamado(a, { status: 'cancelado' });
    await cotacao(cancelado, 'aprovada', 5000);
    await chamado(a, {
      createdAt: diasAtras(400),
      materiais: [{ quantidade: 1, valorUnitario: 100 }],
    });

    // Act
    const ficha = await custo.custoDaFicha(String(a), 50, agora);

    // Assert
    expect(ficha.doze).toEqual({
      corretivoCentavos: 30500,
      preventivaCentavos: 4000,
      totalCentavos: 34500,
    });
    expect(ficha.totalGeralCentavos).toBe(44500);
    expect(ficha.chamados.map((c) => c.totalCentavos)).toEqual([30500, 4000, 10000]);
  });

  it('o custo segue o ativo atual do chamado (AC-8)', async () => {
    // Arrange
    const cat = await categoria();
    const antigo = await ativo(cat);
    const novo = await ativo(cat);
    const c = await chamado(antigo, { materiais: [{ quantidade: 1, valorUnitario: 50 }] });

    // Act
    await ChamadoModel.updateOne({ _id: c }, { $set: { ativoId: novo } });

    // Assert
    expect((await custo.custoDaFicha(String(antigo), 50, agora)).totalGeralCentavos).toBe(0);
    expect((await custo.custoDaFicha(String(novo), 50, agora)).totalGeralCentavos).toBe(5000);
  });

  it('ficha, IMR e substituição mostram o mesmo número (AC-12, AC-14, AC-15)', async () => {
    // Arrange: valor histórico R$ 2.000,00 e R$ 1.000,00 de corretivo (50%, o padrão)
    const a = await ativo(await categoria(), 2000);
    const c = await chamado(a);
    await cotacao(c, 'aprovada', 1000);

    // Act
    const ficha = await custo.custoDaFicha(String(a), 50, agora);
    const imr = await custo.calcularCustosAtivos({ inicio: diasAtras(30), fim: agora });
    const lote = await substituicao.listarSituacoesSubstituicao({ agora });

    // Assert
    expect(ficha.doze.corretivoCentavos).toBe(100000);
    expect(imr.geral.porAtivo[String(a)].totalCentavos).toBe(100000);
    expect(imr.porTipo['Ar-Condicionado'].maisCaros[0]).toMatchObject({
      ativoId: String(a),
      totalCentavos: 100000,
    });
    const linha = lote.candidatos.find((l) => l.ativoId === String(a));
    expect(linha?.motivos).toEqual([
      { criterio: 'custo', custoCentavos: 100000, percentual: 50, limite: 50 },
    ]);
  });

  it('um centavo abaixo do limite não sinaliza; sem valor histórico não avalia (AC-15)', async () => {
    // Arrange
    const cat = await categoria();
    const abaixo = await ativo(cat, 2000);
    await cotacao(await chamado(abaixo), 'aprovada', 999.99);
    const semValor = await ativo(cat);
    await cotacao(await chamado(semValor), 'aprovada', 1_000_000);

    // Act
    const lote = await substituicao.listarSituacoesSubstituicao({ agora });

    // Assert
    expect(lote.candidatos.map((l) => l.ativoId)).toEqual([]);
  });

  it('o limite da categoria troca o padrão (AC-16)', async () => {
    // Arrange: 20% de R$ 2.000,00 = R$ 400,00
    const a = await ativo(await categoria({ limiteCustoPercentual12m: 20 }), 2000);
    await cotacao(await chamado(a), 'aprovada', 400);

    // Act
    const lote = await substituicao.listarSituacoesSubstituicao({ agora });

    // Assert
    expect(lote.candidatos[0]?.motivos).toEqual([
      { criterio: 'custo', custoCentavos: 40000, percentual: 20, limite: 20 },
    ]);
  });
});
