import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import { COLECOES_ATIVOS } from '../../../shared/ativos/ativo.constants';
import { CATEGORIAS_CARGA, montarCarga } from '../carga';
import { gerarScriptCarga } from '../carga-script';

/**
 * O script mongosh da carga rodando de verdade contra o Mongo (spec 0011,
 * AC-8 e AC-9): cria tudo numa base vazia, rodar de novo não cria nem altera
 * nada, e uma execução interrompida é completada pela seguinte.
 *
 * O mongosh tem API síncrona; o driver do Node, não. O script é executado
 * como função assíncrona com `await` posto antes de cada `db`, e `db` é o
 * banco de teste pelo driver. A lógica do script (filtros, `$setOnInsert`,
 * contagens) é a mesma que vai para o mongosh.
 */

const CABECALHO =
  'codigo;origemCodigo;tombamento;descricao;tierManutencao;categoriaSugerida;codigoMaterial;numeroSerie;lotacao;setor;responsavelMatricula;responsavelNome;dataTombo;garantiaInicio;garantiaFim;valorHistorico;situacaoSicam;estadoConservacao;classificacaoSicam;fornecedor';
const linha = (codigo: string, categoria: string) =>
  `${codigo};patrimonio;${codigo};"EQUIPAMENTO ${codigo}; FICTICIO";A;${categoria};;SN${codigo};LOT;SET;XX1;PESSOA FICTICIA;2020-01-15;;2023-12-29;8700,9;;;;FORNECEDOR`;
const CSV = [
  CABECALHO,
  linha('100', 'climatizacao'),
  linha('200', 'energia_nobreak'),
  linha('300', 'climatizacao'),
].join('\r\n');

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...a: unknown[]) => Promise<void>;

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('script da carga, contra o Mongo', () => {
  let db: mongoose.mongo.Db;
  const script = gerarScriptCarga(
    montarCarga(CSV),
    CATEGORIAS_CARGA,
    new Date('2026-10-01T00:00:00Z'),
  );
  // Toda chamada ao banco no script começa por "= db": vira "= await db".
  const corpo = script.replace(/=\s*db\b/g, '= await db');

  async function executar(): Promise<string[]> {
    const saida: string[] = [];
    const fn = new AsyncFunction('db', 'print', corpo);
    await fn({ getCollection: (nome: string) => db.collection(nome) }, (m: string) =>
      saida.push(m),
    );
    return saida;
  }
  const c = (nome: keyof typeof COLECOES_ATIVOS) => db.collection(COLECOES_ATIVOS[nome]);

  beforeAll(async () => {
    await conectarMongoDeTeste([], 'severino_test_ativos_carga');
    db = mongoose.connection.db!;
  });
  afterAll(async () => {
    await desconectarMongoDeTeste();
  });
  beforeEach(async () => {
    await db.dropDatabase();
  });

  it('o corpo transformado ainda tem todas as chamadas ao banco aguardadas', () => {
    expect(corpo.match(/= await db/g)?.length).toBe(script.match(/=\s*db\b/g)?.length);
    expect(corpo).not.toMatch(/[^t] db\s*\.getCollection/);
  });

  it('numa base vazia cria as 9 categorias, o contador, os ativos e um histórico de sistema para cada', async () => {
    const saida = await executar();
    expect(saida).toEqual([
      'Categorias criadas: 9 de 9',
      'Contador ativo_mnt criado: sim',
      'Ativos criados: 3 de 3',
      'Históricos de cadastro criados: 3',
    ]);
    expect(await c('categorias').countDocuments()).toBe(9);
    expect(
      await c('contadores').findOne({ _id: 'ativo_mnt' as unknown as mongoose.mongo.ObjectId }),
    ).toMatchObject({ seq: 0 });
    const a = await c('ativos').findOne({ codigo: '100' });
    expect(a).toMatchObject({
      tombamento: '100',
      tierManutencao: 'A',
      status: 'em_operacao',
      statusCadastro: 'importado',
      criticidade: 'media',
      numeroSerie: 'SN100',
      localizacaoId: null,
    });
    expect(a?.camposPatrimoniais.valorHistorico).toBe(8700.9);
    expect(a?.camposPatrimoniais.dataTombo).toBeInstanceOf(Date);
    expect(a?.camposPatrimoniais.importadoEm).toBeInstanceOf(Date);
    expect(a?.createdAt).toBeInstanceOf(Date);
    expect(
      await c('historico').countDocuments({
        actorType: 'sistema',
        autorId: null,
        acao: 'cadastro',
      }),
    ).toBe(3);
  });

  it('rodar de novo não cria nem altera nada, nem o ativo editado (AC-9)', async () => {
    await executar();
    await c('ativos').updateOne(
      { codigo: '100' },
      { $set: { fabricante: 'Editado', 'camposPatrimoniais.setor': 'Mexido' } },
    );
    const saida = await executar();
    expect(saida).toEqual([
      'Categorias criadas: 0 de 9',
      'Contador ativo_mnt criado: não (já existia)',
      'Ativos criados: 0 de 3',
      'Históricos de cadastro criados: 0',
    ]);
    const a = await c('ativos').findOne({ codigo: '100' });
    expect([a?.fabricante, a?.camposPatrimoniais.setor]).toEqual(['Editado', 'Mexido']);
    expect(await c('ativos').countDocuments()).toBe(3);
    expect(await c('historico').countDocuments()).toBe(3);
  });

  it('completa uma execução interrompida: recria o ativo e os históricos que faltam', async () => {
    await executar();
    const apagado = await c('ativos').findOne({ codigo: '300' });
    await c('ativos').deleteOne({ codigo: '300' });
    await c('historico').deleteMany({ ativoId: apagado!._id });
    const outro = await c('ativos').findOne({ codigo: '200' });
    await c('historico').deleteMany({ ativoId: outro!._id });

    const saida = await executar();
    expect(saida).toContain('Ativos criados: 1 de 3');
    expect(saida).toContain('Históricos de cadastro criados: 2');
    expect(await c('historico').countDocuments()).toBe(3);
  });

  it('categoria que já existia mantém o ajuste do Admin, e o ativo novo herda a criticidade dela', async () => {
    await executar();
    await c('categorias').updateOne(
      { chave: 'climatizacao' },
      { $set: { criticidadePadrao: 'baixa', nome: 'Clima (ajustada)' } },
    );
    await c('ativos').deleteOne({ codigo: '300' });
    await executar();
    const cat = await c('categorias').findOne({ chave: 'climatizacao' });
    expect([cat?.nome, cat?.criticidadePadrao]).toEqual(['Clima (ajustada)', 'baixa']);
    expect((await c('ativos').findOne({ codigo: '300' }))?.criticidade).toBe('baixa');
    expect((await c('ativos').findOne({ codigo: '100' }))?.criticidade).toBe('media');
  });
});
