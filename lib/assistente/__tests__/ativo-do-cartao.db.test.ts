import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * O equipamento sugerido no cartão contra o Mongo de verdade (spec 0014): o
 * ramo do código, a regra por categoria, unidade e local, o teto de 5 e os
 * casos em que a regra não roda. Árvore de locais e filtro de vinculável não
 * aparecem com mock.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-5
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('resolverAtivoDoCartao (banco real)', () => {
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let ConversaMensagemModel: typeof import('@/models/ConversaMensagem').ConversaMensagemModel;
  let resolverAtivoDoCartao: typeof import('../ativo-do-cartao').resolverAtivoDoCartao;
  let todos: ModelDeTeste[];

  const subtipo = new Types.ObjectId();
  const outroSubtipo = new Types.ObjectId();
  const unidade = new Types.ObjectId();
  const outraUnidade = new Types.ObjectId();
  const categoria = new Types.ObjectId();
  const predio = new Types.ObjectId();
  const sala302 = new Types.ObjectId();
  const sala303 = new Types.ObjectId();
  const conversaId = new Types.ObjectId();

  const cartao = {
    conversaId: String(conversaId),
    modo: 'ia' as const,
    servico: { subtypeId: String(subtipo) },
    unidade: { unitId: String(unidade) },
    localExato: 'sala 302',
  };

  async function relato(...textos: string[]) {
    await ConversaMensagemModel.collection.deleteMany({ conversaId });
    if (textos.length === 0) return;
    await ConversaMensagemModel.collection.insertMany(
      textos.map((texto, i) => ({
        conversaId,
        autor: 'solicitante',
        tipo: 'texto',
        texto,
        createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, i)),
      })),
    );
  }

  const ativo = (codigo: string, extra: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    codigo,
    descricao: `Split ${codigo}`,
    categoriaId: categoria,
    tierManutencao: 'A',
    status: 'em_operacao',
    localizacaoId: sala302,
    ...extra,
  });

  beforeAll(async () => {
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ ConversaMensagemModel } = await import('@/models/ConversaMensagem'));
    ({ resolverAtivoDoCartao } = await import('../ativo-do-cartao'));
    todos = [AtivoModel, CategoriaAtivoModel, LocalizacaoModel, ConversaMensagemModel] as never;
    await conectarMongoDeTeste(todos, 'severino_test_ativo_cartao');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await CategoriaAtivoModel.collection.insertOne({
      _id: categoria,
      nome: 'Split',
      serviceSubTypeId: subtipo,
    });
    await LocalizacaoModel.collection.insertMany([
      { _id: predio, nome: 'Sede', caminho: 'Sede', unitId: unidade, isActive: true },
      { _id: sala302, nome: 'Sala 302', caminho: 'Sede/Sala 302', isActive: true },
      { _id: sala303, nome: 'Sala 303', caminho: 'Sede/Sala 303', isActive: true },
    ]);
    await AtivoModel.collection.insertMany([
      ativo('11997'),
      ativo('11998', { localizacaoId: sala303 }),
      ativo('11999', { localizacaoId: sala303 }),
      ativo('50000', { status: 'baixado' }),
      ativo('60000', { tierManutencao: 'C' }),
      ativo('MNT-0012', { localizacaoId: null }),
    ]);
  });

  afterAll(async () => {
    await limparColecoes(todos);
    await desconectarMongoDeTeste();
  });

  describe('ramo do código (AC-1)', () => {
    it('acha o ativo pelo tombo digitado, com código, descrição e caminho', async () => {
      // Arrange
      await relato('o ar de tombo 11997 pinga');

      // Act
      const r = await resolverAtivoDoCartao(cartao);

      // Assert
      expect(r).toEqual({
        origem: 'codigo',
        candidatos: [
          expect.objectContaining({
            codigo: '11997',
            descricao: 'Split 11997',
            caminho: 'Sede/Sala 302',
          }),
        ],
      });
    });

    it('vale no cartão manual e sem unidade', async () => {
      await relato('o bebedouro de código MNT-0012 vaza');
      const r = await resolverAtivoDoCartao({
        ...cartao,
        modo: 'manual',
        servico: null,
        unidade: null,
      });
      expect(r?.origem).toBe('codigo');
      expect(r?.candidatos).toEqual([
        expect.objectContaining({ codigo: 'MNT-0012', caminho: null }),
      ]);
    });

    it('ignora em silêncio o código de ativo baixado, Tier C ou inexistente', async () => {
      await relato('tombo 50000, tombo 60000 e tombo 77777');
      const r = await resolverAtivoDoCartao({ ...cartao, modo: 'manual', servico: null });
      expect(r).toBeNull();
    });

    it('não conta número solto sem a palavra', async () => {
      await relato('ramal 11997');
      const r = await resolverAtivoDoCartao({ ...cartao, modo: 'manual', servico: null });
      expect(r).toBeNull();
    });

    it('mantém a ordem do texto e corta em 5', async () => {
      // Arrange: 6 ativos válidos citados, em ordem invertida de código
      const extras = ['21006', '21005', '21004', '21003', '21002', '21001'];
      await AtivoModel.collection.insertMany(extras.map((c) => ativo(c)));
      await relato(extras.map((c) => `tombo ${c}`).join(', '));

      // Act
      const r = await resolverAtivoDoCartao(cartao);

      // Assert
      expect(r?.candidatos.map((c) => c.codigo)).toEqual(extras.slice(0, 5));
    });

    it('o código vence a regra mesmo quando a regra acharia outro', async () => {
      await relato('o ar pinga, é o tombo 11998');
      const r = await resolverAtivoDoCartao(cartao);
      expect(r).toEqual({
        origem: 'codigo',
        candidatos: [expect.objectContaining({ codigo: '11998' })],
      });
    });
  });

  describe('ramo da regra (AC-2, AC-3)', () => {
    beforeEach(async () => {
      await relato('o ar pinga');
    });

    it('acha pelo subtipo, pela unidade do prédio herdada pela sala e pelo local', async () => {
      const r = await resolverAtivoDoCartao(cartao);
      expect(r).toEqual({
        origem: 'regra',
        candidatos: [expect.objectContaining({ codigo: '11997' })],
      });
    });

    it('com local que casa dois, devolve os dois', async () => {
      const r = await resolverAtivoDoCartao({ ...cartao, localExato: 'Sala 303' });
      expect(r?.candidatos.map((c) => c.codigo)).toEqual(['11998', '11999']);
    });

    it('sem local que case, devolve todos, sem o baixado e sem o Tier C', async () => {
      const r = await resolverAtivoDoCartao({ ...cartao, localExato: 'perto da janela' });
      expect(r?.candidatos.map((c) => c.codigo)).toEqual(['11997', '11998', '11999']);
    });

    it('com mais de 5 depois do desempate, não sugere nada (AC-3)', async () => {
      await AtivoModel.collection.insertMany(['31001', '31002', '31003'].map((c) => ativo(c)));
      const r = await resolverAtivoDoCartao({ ...cartao, localExato: 'perto da janela' });
      expect(r).toBeNull();
    });

    it('ignora sala desativada', async () => {
      await LocalizacaoModel.collection.updateOne({ _id: sala302 }, { $set: { isActive: false } });
      const r = await resolverAtivoDoCartao({ ...cartao, localExato: 'perto da janela' });
      expect(r?.candidatos.map((c) => c.codigo)).toEqual(['11998', '11999']);
    });

    it('não acha com categoria de outro subtipo', async () => {
      await CategoriaAtivoModel.collection.updateOne(
        { _id: categoria },
        { $set: { serviceSubTypeId: outroSubtipo } },
      );
      expect(await resolverAtivoDoCartao(cartao)).toBeNull();
    });

    it('não acha quando o prédio é de outra unidade', async () => {
      const r = await resolverAtivoDoCartao({
        ...cartao,
        unidade: { unitId: String(outraUnidade) },
      });
      expect(r).toBeNull();
    });

    it('ativo sem local nunca entra pela regra', async () => {
      const r = await resolverAtivoDoCartao({ ...cartao, localExato: 'bebedouro' });
      expect(r?.candidatos.map((c) => c.codigo)).not.toContain('MNT-0012');
    });
  });

  describe('sem sinal suficiente (AC-4)', () => {
    beforeEach(async () => {
      await relato('o ar pinga');
    });

    it('cartão manual não recebe candidato de regra', async () => {
      expect(await resolverAtivoDoCartao({ ...cartao, modo: 'manual', servico: null })).toBeNull();
    });

    it('cartão sem unidade não recebe candidato de regra', async () => {
      expect(await resolverAtivoDoCartao({ ...cartao, unidade: null })).toBeNull();
    });
  });

  it('o candidato nunca leva campos patrimoniais (AC-5)', async () => {
    await AtivoModel.collection.updateOne(
      { codigo: '11997' },
      { $set: { camposPatrimoniais: { responsavelNome: 'Fulano', responsavelMatricula: '123' } } },
    );
    await relato('tombo 11997');
    const r = await resolverAtivoDoCartao(cartao);
    expect(Object.keys(r!.candidatos[0]!).sort()).toEqual([
      'ativoId',
      'caminho',
      'codigo',
      'descricao',
    ]);
    expect(JSON.stringify(r)).not.toContain('Fulano');
  });
});
