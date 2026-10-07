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
 * Quantos acompanham o chamado, na linha do tempo de `/conversas` (spec 0017):
 * o técnico atribuído e a gestão veem a contagem; o dono nunca vê nada sobre
 * interessados.
 *
 * covers: AC-19
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('lerLinhaDoTempo · interessadosTotal, contra o Mongo', () => {
  let lerLinhaDoTempo: typeof import('../linha-do-tempo').lerLinhaDoTempo;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoInteressadoModel: typeof import('@/models/ChamadoInteressado').ChamadoInteressadoModel;
  let todos: ModelDeTeste[];

  const chamadoId = new Types.ObjectId();
  const dono = new Types.ObjectId();
  const tecnico = new Types.ObjectId();

  beforeAll(async () => {
    ({ lerLinhaDoTempo } = await import('../linha-do-tempo'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoInteressadoModel } = await import('@/models/ChamadoInteressado'));
    const { ChamadoCommentModel } = await import('@/models/ChamadoComment');
    const { ChamadoHistoryModel } = await import('@/models/ChamadoHistory');
    const { DecisaoIaModel } = await import('@/models/DecisaoIa');
    todos = [
      ChamadoModel,
      ChamadoInteressadoModel,
      ChamadoCommentModel,
      ChamadoHistoryModel,
      DecisaoIaModel,
    ] as never;
    await conectarMongoDeTeste(todos, 'severino_test_linha_interessados');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await ChamadoModel.collection.insertOne({
      _id: chamadoId,
      ticket_number: 'CHM-2026-00001',
      solicitanteId: dono,
      assignedToUserId: tecnico,
      conversaId: null,
      status: 'em atendimento',
    });
    await ChamadoInteressadoModel.collection.insertMany([
      {
        chamadoId,
        userId: new Types.ObjectId(),
        origem: 'aviso_duplicado',
        criadoEm: new Date(),
        saiuEm: null,
        avisadoFimEm: null,
      },
      {
        chamadoId,
        userId: new Types.ObjectId(),
        origem: 'aviso_duplicado',
        criadoEm: new Date(),
        saiuEm: null,
        avisadoFimEm: null,
      },
      {
        chamadoId,
        userId: new Types.ObjectId(),
        origem: 'aviso_duplicado',
        criadoEm: new Date(),
        saiuEm: new Date(),
        avisadoFimEm: null,
      },
    ]);
  });

  afterAll(async () => {
    await limparColecoes(todos);
    await desconectarMongoDeTeste();
  });

  it('o técnico atribuído vê a contagem dos interessados ativos', async () => {
    const r = await lerLinhaDoTempo(
      { userId: String(tecnico), role: 'Técnico' },
      String(chamadoId),
    );
    expect(r).toMatchObject({ ok: true, interessadosTotal: 2 });
  });

  it.each(['Preposto', 'Admin'] as const)('%s vê a contagem', async (role) => {
    const r = await lerLinhaDoTempo(
      { userId: String(new Types.ObjectId()), role },
      String(chamadoId),
    );
    expect(r).toMatchObject({ ok: true, interessadosTotal: 2 });
  });

  it('o interesse do próprio técnico atribuído não entra na contagem', async () => {
    await ChamadoInteressadoModel.collection.insertOne({
      chamadoId,
      userId: tecnico,
      origem: 'aviso_duplicado',
      criadoEm: new Date(),
      saiuEm: null,
      avisadoFimEm: null,
    });
    const r = await lerLinhaDoTempo(
      { userId: String(tecnico), role: 'Técnico' },
      String(chamadoId),
    );
    expect(r).toMatchObject({ ok: true, interessadosTotal: 2 });
  });

  it('o dono não vê nada sobre interessados', async () => {
    const r = await lerLinhaDoTempo(
      { userId: String(dono), role: 'Solicitante' },
      String(chamadoId),
    );
    expect(r).toMatchObject({ ok: true, interessadosTotal: null });
  });

  it('o dono que também é gestão continua sem ver', async () => {
    const r = await lerLinhaDoTempo({ userId: String(dono), role: 'Preposto' }, String(chamadoId));
    expect(r).toMatchObject({ ok: true, interessadosTotal: null });
  });
});
