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
 * A leitura dos corretivos com ativo no Mongo de verdade (spec 0014): o que
 * conta como corretivo, o filtro por tipo, o denominador do percentual e as
 * janelas da ficha no fuso de Belém.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-14, AC-15, AC-16, AC-17, AC-18, AC-20
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('indicadores de ativo (banco real)', () => {
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let calcularIndicadoresAtivos: typeof import('../indicadores').calcularIndicadoresAtivos;
  let indicadoresDoAtivo: typeof import('../indicadores').indicadoresDoAtivo;
  let todos: ModelDeTeste[];

  const H = 60 * 60 * 1000;
  const DIA = 24 * H;
  const categoria = new Types.ObjectId();
  const sala = new Types.ObjectId();
  const ativoA = new Types.ObjectId();
  const ativoB = new Types.ObjectId();
  let n = 0;

  const chamado = (createdAt: string, extra: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    ticket_number: `IND-${(n += 1)}`,
    status: 'em_atendimento',
    tipoServico: 'Ar-Condicionado',
    ativoId: ativoA,
    createdAt: new Date(createdAt),
    ...extra,
  });

  const janeiro = {
    inicio: new Date('2026-01-01T00:00:00.000Z'),
    fim: new Date('2026-01-31T23:59:59.999Z'),
    fimReincidencia: new Date('2026-01-31T23:59:59.999Z'),
  };

  beforeAll(async () => {
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ calcularIndicadoresAtivos, indicadoresDoAtivo } = await import('../indicadores'));
    todos = [ChamadoModel, AtivoModel, CategoriaAtivoModel, LocalizacaoModel] as never;
    await conectarMongoDeTeste(todos, 'severino_test_indicadores');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await CategoriaAtivoModel.collection.insertOne({ _id: categoria, nome: 'Split' });
    await LocalizacaoModel.collection.insertOne({
      _id: sala,
      nome: 'Sala 302',
      caminho: 'Sede/Sala 302',
    });
    await AtivoModel.collection.insertMany([
      {
        _id: ativoA,
        codigo: '11997',
        descricao: 'Split 12k',
        categoriaId: categoria,
        localizacaoId: sala,
        status: 'em_operacao',
      },
      {
        _id: ativoB,
        codigo: '11998',
        descricao: 'Elevador',
        categoriaId: categoria,
        localizacaoId: null,
        status: 'baixado',
      },
    ]);
  });

  afterAll(async () => {
    await limparColecoes(todos);
    await desconectarMongoDeTeste();
  });

  it('conta só corretivo: sem preventiva, sem cancelado nem recusado, com encerrado', async () => {
    // Arrange
    await ChamadoModel.collection.insertMany([
      chamado('2026-01-01T12:00:00Z', {
        sla: { resolvedAt: new Date('2026-01-01T22:00:00Z') },
        totalPausedMinutes: 120,
      }),
      chamado('2026-01-05T12:00:00Z', { originTemplateId: new Types.ObjectId() }),
      chamado('2026-01-06T12:00:00Z', { status: 'cancelado' }),
      chamado('2026-01-07T12:00:00Z', { status: 'recusado' }),
      chamado('2026-01-11T12:00:00Z', { status: 'encerrado' }),
      chamado('2026-01-31T12:00:00Z'),
    ]);

    // Act
    const r = await calcularIndicadoresAtivos(janeiro);

    // Assert
    const ar = r.porTipo['Ar-Condicionado'];
    expect(ar.topo.corretivosComAtivo).toBe(3);
    expect(ar.topo.mtbfMedioMs).toBe(15 * DIA);
    expect(ar.topo.mttrMedioMs).toBe(8 * H);
    expect(ar.ranking[0]).toMatchObject({
      codigo: '11997',
      descricao: 'Split 12k',
      categoria: 'Split',
      caminho: 'Sede/Sala 302',
      corretivos: 3,
    });
  });

  it('o percentual usa os corretivos do período com e sem ativo, por tipo', async () => {
    await ChamadoModel.collection.insertMany([
      chamado('2026-01-10T12:00:00Z'),
      chamado('2026-01-11T12:00:00Z', { ativoId: null }),
      chamado('2026-01-12T12:00:00Z', { ativoId: null }),
      chamado('2026-01-13T12:00:00Z', { ativoId: null, originTemplateId: new Types.ObjectId() }),
      chamado('2026-01-14T12:00:00Z', { ativoId: null, tipoServico: 'Elevador' }),
    ]);
    const r = await calcularIndicadoresAtivos(janeiro);
    expect(r.porTipo['Ar-Condicionado'].topo.percentualComAtivo).toBe(33.33);
    expect(r.geral.topo.percentualComAtivo).toBe(25);
  });

  it('filtra pelo tipo do chamado e deixa o tipo sem dado vazio', async () => {
    await ChamadoModel.collection.insertMany([
      chamado('2026-01-10T12:00:00Z'),
      chamado('2026-01-12T12:00:00Z', { ativoId: ativoB, tipoServico: 'Elevador' }),
    ]);
    const r = await calcularIndicadoresAtivos(janeiro);
    expect(r.porTipo.Elevador.ranking.map((l) => l.codigo)).toEqual(['11998']);
    expect(r.porTipo['Ar-Condicionado'].ranking.map((l) => l.codigo)).toEqual(['11997']);
    expect(r.porTipo['Manutenção Predial'].topo.corretivosComAtivo).toBe(0);
    expect(r.porTipo['Manutenção Predial'].topo.percentualComAtivo).toBeNull();
    expect(r.geral.topo.ativosAfetados).toBe(2);
  });

  it('ativo baixado continua no ranking', async () => {
    await ChamadoModel.collection.insertOne(chamado('2026-01-12T12:00:00Z', { ativoId: ativoB }));
    const r = await calcularIndicadoresAtivos(janeiro);
    expect(r.geral.ranking.map((l) => l.codigo)).toEqual(['11998']);
  });

  it('reincidente olha 90 dias para trás a partir do fim do período', async () => {
    // Arrange: 20/12 e 05/01 → reincidente em janeiro
    await ChamadoModel.collection.insertMany([
      chamado('2025-12-20T12:00:00Z'),
      chamado('2026-01-05T12:00:00Z'),
    ]);

    // Act
    const r = await calcularIndicadoresAtivos(janeiro);

    // Assert
    expect(r.geral.topo.ativosReincidentes).toBe(1);
    expect(r.geral.topo.corretivosComAtivo).toBe(1);
    expect(r.geral.ranking[0]).toMatchObject({ corretivos: 1, corretivos90d: 2 });
  });

  it('o dia do período é em UTC, como no resto do IMR', async () => {
    // 22h de Belém no dia 31 já é 01/02 em UTC: fica fora de janeiro
    await ChamadoModel.collection.insertOne(chamado('2026-02-01T01:00:00Z'));
    const r = await calcularIndicadoresAtivos(janeiro);
    expect(r.geral.topo.corretivosComAtivo).toBe(0);
  });

  describe('indicadoresDoAtivo, a linha da ficha (AC-20)', () => {
    beforeEach(async () => {
      await ChamadoModel.collection.insertMany([
        chamado('2025-08-01T12:00:00Z'),
        chamado('2026-07-20T12:00:00Z'),
        chamado('2026-09-01T12:00:00Z', { sla: { resolvedAt: new Date('2026-09-01T20:00:00Z') } }),
        chamado('2026-09-21T12:00:00Z'),
        chamado('2026-09-30T23:00:00Z'),
        chamado('2026-09-15T12:00:00Z', { status: 'cancelado' }),
      ]);
    });

    it('conta 12 meses e 90 dias até o fim de hoje em Belém', async () => {
      // 01/10 às 02:00 UTC ainda é 30/09 em Belém: o corretivo de 30/09 23:00 UTC entra
      const f = await indicadoresDoAtivo(String(ativoA), new Date('2026-10-01T02:00:00Z'));
      expect(f.corretivos12m).toBe(4);
      expect(f.corretivos90d).toBe(4);
      expect(f.mttrMs).toBe(8 * H);
    });

    it('fora da janela de 90 dias, o corretivo antigo só conta nos 12 meses', async () => {
      const f = await indicadoresDoAtivo(String(ativoA), new Date('2026-10-25T15:00:00Z'));
      expect(f.corretivos12m).toBe(4);
      expect(f.corretivos90d).toBe(3);
    });

    it('ativo sem corretivo devolve zeros e "sem valor" nos tempos', async () => {
      const f = await indicadoresDoAtivo(String(ativoB), new Date('2026-10-01T15:00:00Z'));
      expect(f).toEqual({ corretivos12m: 0, mtbfMs: null, mttrMs: null, corretivos90d: 0 });
    });
  });
});
