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
 * Os interessados contra o Mongo de verdade (spec 0017): o índice único, a
 * volta depois de sair, o aviso de fim no máximo uma vez por fim (inclusive
 * com duas chamadas ao mesmo tempo), a reabertura e a contagem da gestão.
 *
 * covers: AC-9, AC-11, AC-16, AC-17, AC-18, AC-19
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('interessados, contra o Mongo', () => {
  let m: typeof import('../interessados');
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoInteressadoModel: typeof import('@/models/ChamadoInteressado').ChamadoInteressadoModel;
  let NotificationModel: typeof import('@/models/Notification').NotificationModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let todos: ModelDeTeste[];

  const chamadoId = new Types.ObjectId();
  const ana = new Types.ObjectId();
  const bia = new Types.ObjectId();
  const C = String(chamadoId);

  beforeAll(async () => {
    m = await import('../interessados');
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoInteressadoModel } = await import('@/models/ChamadoInteressado'));
    ({ NotificationModel } = await import('@/models/Notification'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    todos = [
      ChamadoModel,
      ChamadoInteressadoModel,
      NotificationModel,
      UserModel,
      ChamadoHistoryModel,
    ] as never;
    await conectarMongoDeTeste(todos, 'severino_test_interessados');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await ChamadoModel.collection.insertOne({
      _id: chamadoId,
      ticket_number: 'CHM-2026-00042',
      status: 'concluído',
    });
    await UserModel.collection.insertMany([
      { _id: ana, name: 'Ana Souza', username: 'ana' },
      { _id: bia, name: 'Bia Lima', username: 'bia' },
    ]);
  });

  afterAll(async () => {
    await limparColecoes(todos);
    await desconectarMongoDeTeste();
  });

  const registro = (userId: Types.ObjectId) =>
    ChamadoInteressadoModel.findOne({ chamadoId, userId }).lean();

  describe('registrarInteresse (AC-9, AC-11)', () => {
    it('cria o registro ativo, com a origem do aviso', async () => {
      expect(await m.registrarInteresse(C, String(ana), true)).toEqual({ novo: true });
      expect(await registro(ana)).toMatchObject({
        origem: 'aviso_duplicado',
        saiuEm: null,
        avisadoFimEm: null,
      });
    });

    it('com o interesse ativo, repetir não muda nada e diz que não é novo', async () => {
      await m.registrarInteresse(C, String(ana), true);
      const antes = await registro(ana);

      expect(await m.registrarInteresse(C, String(ana), true)).toEqual({ novo: false });

      expect((await registro(ana))!.criadoEm).toEqual(antes!.criadoEm);
      expect(await ChamadoInteressadoModel.countDocuments({ chamadoId })).toBe(1);
    });

    it('dois cliques ao mesmo tempo deixam um registro só', async () => {
      const r = await Promise.all(
        Array.from({ length: 6 }, () => m.registrarInteresse(C, String(ana), true)),
      );
      expect(await ChamadoInteressadoModel.countDocuments({ chamadoId, userId: ana })).toBe(1);
      expect(r.filter((x) => x.novo)).toHaveLength(1);
    });

    it('reativa quem tinha saído: saiuEm e avisadoFimEm zerados, criadoEm novo', async () => {
      // Arrange
      const velho = new Date('2026-01-01T00:00:00Z');
      await ChamadoInteressadoModel.collection.insertOne({
        chamadoId,
        userId: ana,
        origem: 'aviso_duplicado',
        criadoEm: velho,
        saiuEm: velho,
        avisadoFimEm: velho,
      });

      // Act
      const r = await m.registrarInteresse(C, String(ana), true);

      // Assert
      const doc = await registro(ana);
      expect(r).toEqual({ novo: true });
      expect(doc).toMatchObject({ saiuEm: null, avisadoFimEm: null });
      expect(doc!.criadoEm.getTime()).toBeGreaterThan(velho.getTime());
    });

    describe('localVisivel (AC-9, revisão de 2026-10-07)', () => {
      it.each([true, false])('grava localVisivel %s na criação', async (valor) => {
        await m.registrarInteresse(C, String(ana), valor);
        expect((await registro(ana))!.localVisivel).toBe(valor);
      });

      it.each([
        [false, true],
        [true, false],
      ])(
        'na reativação regrava localVisivel de %s para %s, o valor do cartão novo',
        async (antes, depois) => {
          // Arrange
          await m.registrarInteresse(C, String(ana), antes);
          await m.sairDoInteresse(C, String(ana));

          // Act
          const r = await m.registrarInteresse(C, String(ana), depois);

          // Assert
          expect(r).toEqual({ novo: true });
          expect(await registro(ana)).toMatchObject({ saiuEm: null, localVisivel: depois });
        },
      );

      it('reativa um registro gravado antes do campo e passa a ter o valor do clique', async () => {
        const velho = new Date('2026-01-01T00:00:00Z');
        await ChamadoInteressadoModel.collection.insertOne({
          chamadoId,
          userId: ana,
          origem: 'aviso_duplicado',
          criadoEm: velho,
          saiuEm: velho,
          avisadoFimEm: null,
        });

        await m.registrarInteresse(C, String(ana), true);

        expect((await registro(ana))!.localVisivel).toBe(true);
      });

      it.each([
        [true, false],
        [false, true],
      ])(
        'com o interesse ativo (%s), um clique de outro cartão (%s) não muda nada',
        async (primeiro, segundo) => {
          // Arrange
          await m.registrarInteresse(C, String(ana), primeiro);

          // Act
          const r = await m.registrarInteresse(C, String(ana), segundo);

          // Assert
          expect(r).toEqual({ novo: false });
          expect((await registro(ana))!.localVisivel).toBe(primeiro);
        },
      );
    });

    it('não cria nenhuma entrada de ChamadoHistory (AC-19)', async () => {
      await m.registrarInteresse(C, String(ana), true);
      await m.sairDoInteresse(C, String(ana));
      expect(await ChamadoHistoryModel.countDocuments({})).toBe(0);
    });
  });

  describe('sairDoInteresse (AC-16)', () => {
    it('grava saiuEm uma vez e não apaga o registro; sair de novo mantém a data', async () => {
      await m.registrarInteresse(C, String(ana), true);
      expect(await m.sairDoInteresse(C, String(ana))).toBe(true);
      const primeira = (await registro(ana))!.saiuEm;
      expect(primeira).toBeInstanceOf(Date);

      expect(await m.sairDoInteresse(C, String(ana))).toBe(true);
      expect((await registro(ana))!.saiuEm).toEqual(primeira);
    });

    it('quem nunca acompanhou recebe false', async () => {
      expect(await m.sairDoInteresse(C, String(bia))).toBe(false);
    });

    it('depois de sair, interesseAtivo devolve null', async () => {
      await m.registrarInteresse(C, String(ana), true);
      expect(await m.interesseAtivo(C, String(ana))).not.toBeNull();
      await m.sairDoInteresse(C, String(ana));
      expect(await m.interesseAtivo(C, String(ana))).toBeNull();
    });

    // covers: AC-14
    it.each([true, false])('interesseAtivo devolve o localVisivel %s gravado', async (valor) => {
      await m.registrarInteresse(C, String(ana), valor);
      expect(await m.interesseAtivo(C, String(ana))).toMatchObject({ localVisivel: valor });
    });

    // covers: AC-14
    it('interesseAtivo trata registro sem o campo como localVisivel false', async () => {
      await ChamadoInteressadoModel.collection.insertOne({
        chamadoId,
        userId: ana,
        origem: 'aviso_duplicado',
        criadoEm: new Date(),
        saiuEm: null,
        avisadoFimEm: null,
      });
      expect(await m.interesseAtivo(C, String(ana))).toMatchObject({ localVisivel: false });
    });
  });

  describe('aviso de fim (AC-17, AC-18)', () => {
    const notas = () => NotificationModel.find({ type: 'interesse:fim' }).lean();

    it('avisa cada interessado ativo uma vez, com título, corpo vazio e os dados do chamado', async () => {
      await m.registrarInteresse(C, String(ana), true);
      await m.registrarInteresse(C, String(bia), true);

      await m.notificarFimAosInteressados(C, 'concluído');

      const n = await notas();
      expect(n).toHaveLength(2);
      expect(n[0]).toMatchObject({
        title: 'O chamado #CHM-2026-00042 que você acompanha foi concluído',
        body: '',
        data: { chamadoId: C, ticketNumber: 'CHM-2026-00042', status: 'concluído' },
      });
      expect((await registro(ana))!.avisadoFimEm).toBeInstanceOf(Date);
    });

    it('não avisa quem saiu', async () => {
      await m.registrarInteresse(C, String(ana), true);
      await m.sairDoInteresse(C, String(ana));
      await m.notificarFimAosInteressados(C, 'cancelado');
      expect(await notas()).toHaveLength(0);
    });

    it('duas chamadas ao mesmo tempo geram um aviso só por pessoa', async () => {
      await m.registrarInteresse(C, String(ana), true);
      await Promise.all([
        m.notificarFimAosInteressados(C, 'concluído'),
        m.notificarFimAosInteressados(C, 'concluído'),
        m.notificarFimAosInteressados(C, 'concluído'),
      ]);
      expect(await notas()).toHaveLength(1);
    });

    it('o mesmo fim não avisa de novo; depois da reabertura, o próximo fim avisa', async () => {
      await m.registrarInteresse(C, String(ana), true);
      await m.notificarFimAosInteressados(C, 'concluído');
      await m.notificarFimAosInteressados(C, 'concluído');
      expect(await notas()).toHaveLength(1);

      await m.zerarAvisoDeFim(C);
      expect((await registro(ana))!.avisadoFimEm).toBeNull();

      await m.notificarFimAosInteressados(C, 'concluído');
      expect(await notas()).toHaveLength(2);
    });

    it('chamado que não existe não gera aviso nem lança', async () => {
      await ChamadoModel.deleteMany({});
      await m.registrarInteresse(C, String(ana), true);
      await expect(m.notificarFimAosInteressados(C, 'recusado')).resolves.toBeUndefined();
      expect(await notas()).toHaveLength(0);
    });
  });

  describe('quem virou o técnico atribuído deixa de contar', () => {
    it('não recebe o aviso de fim, não conta e não sai nos nomes', async () => {
      // Arrange: Ana acompanhava e depois foi atribuída ao chamado
      await m.registrarInteresse(C, String(ana), true);
      await m.registrarInteresse(C, String(bia), true);
      await ChamadoModel.collection.updateOne(
        { _id: chamadoId },
        { $set: { assignedToUserId: ana } },
      );

      // Act
      await m.notificarFimAosInteressados(C, 'concluído');

      // Assert
      const notas = await NotificationModel.find({ type: 'interesse:fim' }).lean();
      expect(notas.map((n) => String(n.userId))).toEqual([String(bia)]);
      expect(await m.contarInteressados(C)).toBe(1);
      expect((await m.interessadosDosChamados([C])).get(C)).toEqual({
        total: 1,
        nomes: ['Bia Lima'],
      });
    });
  });

  describe('notificação que falha (AC-17)', () => {
    it('não deixa a pessoa marcada como avisada, e uma nova chamada a avisa', async () => {
      // Arrange
      await m.registrarInteresse(C, String(ana), true);
      const espiao = vi
        .spyOn(NotificationModel, 'insertMany')
        .mockRejectedValueOnce(new Error('fora'));

      // Act
      await m.notificarFimAosInteressados(C, 'concluído');

      // Assert
      expect((await registro(ana))!.avisadoFimEm).toBeNull();
      espiao.mockRestore();
      await m.notificarFimAosInteressados(C, 'concluído');
      expect(await NotificationModel.countDocuments({ type: 'interesse:fim' })).toBe(1);
    });

    it('falha só em parte: desmarca quem ficou sem notificação e mantém quem foi avisado', async () => {
      // Arrange: a gravação em lote só consegue gravar o aviso da Bia
      await m.registrarInteresse(C, String(ana), true);
      await m.registrarInteresse(C, String(bia), true);
      const erro = Object.assign(new Error('parcial'), { insertedDocs: [{ userId: bia }] });
      const espiao = vi.spyOn(NotificationModel, 'insertMany').mockRejectedValueOnce(erro);

      // Act
      await m.notificarFimAosInteressados(C, 'concluído');
      espiao.mockRestore();

      // Assert
      expect((await registro(ana))!.avisadoFimEm).toBeNull();
      expect((await registro(bia))!.avisadoFimEm).toBeInstanceOf(Date);
    });
  });

  describe('aviso de fim em lotes', () => {
    it('avisa uma vez cada um de 120 interessados, em mais de um lote', async () => {
      // Arrange
      const pessoas = Array.from({ length: 120 }, () => new Types.ObjectId());
      await ChamadoInteressadoModel.collection.insertMany(
        pessoas.map((userId) => ({
          chamadoId,
          userId,
          origem: 'aviso_duplicado',
          criadoEm: new Date(),
          saiuEm: null,
          avisadoFimEm: null,
          localVisivel: true,
        })),
      );
      const espiao = vi.spyOn(NotificationModel, 'insertMany');

      // Act
      await m.notificarFimAosInteressados(C, 'concluído');

      // Assert
      const notas = await NotificationModel.find({ type: 'interesse:fim' }).lean();
      expect(new Set(notas.map((n) => String(n.userId))).size).toBe(120);
      expect(notas).toHaveLength(120);
      expect(espiao).toHaveBeenCalledTimes(3);
      expect(await ChamadoInteressadoModel.countDocuments({ chamadoId, avisadoFimEm: null })).toBe(
        0,
      );
      espiao.mockRestore();
    });
  });

  describe('contagem e nomes para a gestão (AC-19)', () => {
    it('conta só os ativos e devolve os nomes em ordem de entrada', async () => {
      const outro = new Types.ObjectId();
      await m.registrarInteresse(C, String(ana), true);
      await m.registrarInteresse(C, String(bia), true);
      await m.registrarInteresse(String(outro), String(ana), true);
      await m.sairDoInteresse(String(outro), String(ana));

      expect(await m.contarInteressados(C)).toBe(2);
      const mapa = await m.interessadosDosChamados([C, String(outro)]);
      expect(mapa.get(C)).toEqual({ total: 2, nomes: ['Ana Souza', 'Bia Lima'] });
      expect(mapa.has(String(outro))).toBe(false);
    });

    it('lista vazia ou ids inválidos não consultam e devolvem mapa vazio', async () => {
      expect((await m.interessadosDosChamados([])).size).toBe(0);
      expect((await m.interessadosDosChamados(['nao-e-id'])).size).toBe(0);
    });
  });
});
