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
 * A vista de quem acompanha e a seção "Acompanhando" da lateral contra o
 * Mongo de verdade (spec 0017): só os campos fechados, os marcos de status,
 * a exigência de interesse ativo e a janela de 7 dias depois do fim.
 *
 * covers: AC-14, AC-15, AC-16
 */

const rodar = temMongoDeTeste ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

rodar('acompanhamento, contra o Mongo', () => {
  let lerAcompanhamento: typeof import('../acompanhamento').lerAcompanhamento;
  let lerAcompanhandoDaLateral: typeof import('../lateral').lerAcompanhandoDaLateral;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let ChamadoInteressadoModel: typeof import('@/models/ChamadoInteressado').ChamadoInteressadoModel;
  let ServiceCatalogModel: typeof import('@/models/ServiceCatalog').ServiceCatalogModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let todos: ModelDeTeste[];

  const eu = new Types.ObjectId();
  const dono = new Types.ObjectId();
  const tecnico = new Types.ObjectId();
  const servico = new Types.ObjectId();
  const ativo = new Types.ObjectId();
  const viewer = { userId: String(eu), role: 'Solicitante' as const };
  const abertoEm = new Date('2026-10-01T12:00:00Z');

  async function chamado(extra: Record<string, unknown> = {}) {
    const _id = new Types.ObjectId();
    await ChamadoModel.collection.insertOne({
      _id,
      ticket_number: `CHM-2026-${String(_id).slice(-5)}`,
      titulo: 'Título privado',
      descricao: 'Relato privado do dono',
      solicitanteId: dono,
      assignedToUserId: tecnico,
      finalPriority: 'ALTA',
      localExato: ' sala 205 ',
      catalogServiceId: servico,
      ativoId: ativo,
      status: 'em atendimento',
      createdAt: abertoEm,
      ...extra,
    });
    return _id;
  }

  /** Por padrão, o interesse de quem o cartão deixou ver o local (mesma unidade). */
  async function interesse(chamadoId: Types.ObjectId, extra: Record<string, unknown> = {}) {
    await ChamadoInteressadoModel.collection.insertOne({
      chamadoId,
      userId: eu,
      origem: 'aviso_duplicado',
      criadoEm: new Date('2026-10-02T09:00:00Z'),
      saiuEm: null,
      avisadoFimEm: null,
      localVisivel: true,
      ...extra,
    });
  }

  /** Interesse gravado antes do campo `localVisivel` existir. */
  async function interesseSemCampo(chamadoId: Types.ObjectId) {
    await interesse(chamadoId);
    await ChamadoInteressadoModel.collection.updateOne(
      { chamadoId, userId: eu },
      { $unset: { localVisivel: '' } },
    );
  }

  beforeAll(async () => {
    ({ lerAcompanhamento } = await import('../acompanhamento'));
    ({ lerAcompanhandoDaLateral } = await import('../lateral'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ ChamadoInteressadoModel } = await import('@/models/ChamadoInteressado'));
    ({ ServiceCatalogModel } = await import('@/models/ServiceCatalog'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    todos = [
      ChamadoModel,
      ChamadoHistoryModel,
      ChamadoInteressadoModel,
      ServiceCatalogModel,
      AtivoModel,
    ] as never;
    await conectarMongoDeTeste(todos, 'severino_test_acompanhamento');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await ServiceCatalogModel.collection.insertOne({ _id: servico, name: 'REPARO DE SPLIT' });
    await AtivoModel.collection.insertOne({ _id: ativo, codigo: 'MNT-0001' });
  });

  afterAll(async () => {
    await limparColecoes(todos);
    await desconectarMongoDeTeste();
  });

  describe('lerAcompanhamento (AC-14)', () => {
    it('mostra só os campos fechados da vista, com os marcos de mudança de status', async () => {
      // Arrange
      const id = await chamado();
      await interesse(id);
      await ChamadoHistoryModel.collection.insertMany([
        {
          chamadoId: id,
          userId: dono,
          action: 'abertura',
          statusAnterior: null,
          statusNovo: 'aberto',
          observacoes: 'texto privado',
          createdAt: new Date('2026-10-01T12:00:00Z'),
        },
        {
          chamadoId: id,
          userId: tecnico,
          action: 'comentario',
          statusAnterior: 'aberto',
          statusNovo: 'aberto',
          observacoes: 'comentário privado',
          createdAt: new Date('2026-10-01T13:00:00Z'),
        },
        {
          chamadoId: id,
          userId: tecnico,
          action: 'atribuicao',
          statusAnterior: 'validado',
          statusNovo: 'em atendimento',
          observacoes: 'Técnico Fulano',
          createdAt: new Date('2026-10-02T14:20:00Z'),
        },
      ]);

      // Act
      const r = await lerAcompanhamento(viewer, String(id));

      // Assert
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.acompanhamento).toEqual({
        chamadoId: String(id),
        ticketNumber: expect.stringMatching(/^CHM-2026-/),
        rotuloServico: 'REPARO DE SPLIT',
        localExato: 'sala 205',
        ativoCodigo: 'MNT-0001',
        situacao: 'Em atendimento',
        statusChave: 'em atendimento',
        abertoEm: abertoEm.toISOString(),
        acompanhaDesde: '2026-10-02T09:00:00.000Z',
        marcos: [
          expect.objectContaining({ rotulo: 'Aberto', em: '2026-10-01T12:00:00.000Z' }),
          expect.objectContaining({ rotulo: 'Em atendimento', em: '2026-10-02T14:20:00.000Z' }),
        ],
      });
      const texto = JSON.stringify(r.acompanhamento);
      expect(texto).not.toMatch(/privado|Fulano|ALTA/);
      expect(texto).not.toContain(String(dono));
      expect(texto).not.toContain(String(tecnico));
    });

    it('chamado sem serviço nem equipamento mostra "A definir na triagem" e nenhum código', async () => {
      const id = await chamado({ catalogServiceId: null, ativoId: null, localExato: '' });
      await interesse(id);
      const r = await lerAcompanhamento(viewer, String(id));
      expect(r).toMatchObject({
        ok: true,
        acompanhamento: {
          rotuloServico: 'A definir na triagem',
          ativoCodigo: null,
          localExato: null,
        },
      });
    });

    it('sem interesse, ou depois de sair, não abre (AC-16)', async () => {
      const id = await chamado();
      expect(await lerAcompanhamento(viewer, String(id))).toEqual({ ok: false });
      await interesse(id, { saiuEm: new Date() });
      expect(await lerAcompanhamento(viewer, String(id))).toEqual({ ok: false });
    });

    it('interesse de outra pessoa não abre para mim', async () => {
      const id = await chamado();
      await interesse(id, { userId: new Types.ObjectId() });
      expect(await lerAcompanhamento(viewer, String(id))).toEqual({ ok: false });
    });

    it('id inválido não abre', async () => {
      expect(await lerAcompanhamento(viewer, '../x')).toEqual({ ok: false });
    });

    // covers: AC-6, AC-14 (revisão de 2026-10-07)
    it('esconde o local quando o cartão o escondeu no clique (localVisivel false)', async () => {
      // Arrange
      const id = await chamado();
      await interesse(id, { localVisivel: false });

      // Act
      const r = await lerAcompanhamento(viewer, String(id));

      // Assert
      expect(r).toMatchObject({ ok: true, acompanhamento: { localExato: null } });
      expect(JSON.stringify(r)).not.toContain('sala 205');
    });

    // covers: AC-14
    it('interesse gravado antes do campo localVisivel não mostra o local', async () => {
      const id = await chamado();
      await interesseSemCampo(id);

      const r = await lerAcompanhamento(viewer, String(id));

      expect(r).toMatchObject({ ok: true, acompanhamento: { localExato: null } });
    });

    // covers: AC-14 (comparação estrita: só `true` mostra)
    it('valor não booleano em localVisivel não mostra o local', async () => {
      const id = await chamado();
      await interesse(id, { localVisivel: 'true' });

      const r = await lerAcompanhamento(viewer, String(id));

      expect(r).toMatchObject({ ok: true, acompanhamento: { localExato: null } });
    });
  });

  describe('lerAcompanhandoDaLateral (AC-15)', () => {
    const agora = new Date('2026-10-10T12:00:00Z');

    it('monta o item com número e serviço no título, local no apoio e o endereço do chamado', async () => {
      const id = await chamado({ status: 'validado' });
      await interesse(id);
      expect(await lerAcompanhandoDaLateral(viewer, agora)).toEqual([
        {
          tipo: 'acompanhamento',
          id: String(id),
          href: `/conversas/${String(id)}`,
          titulo: expect.stringMatching(/^#CHM-2026-\w+ · REPARO DE SPLIT$/),
          apoio: 'sala 205',
          situacao: 'Validado',
          statusChave: 'validado',
          em: '2026-10-02T09:00:00.000Z',
          confirmando: false,
        },
      ]);
    });

    it('chamado terminado fica até 7 dias depois do aviso de fim e some depois', async () => {
      const seis = await chamado({ status: 'concluído' });
      const oito = await chamado({ status: 'concluído' });
      const semAviso = await chamado({ status: 'cancelado' });
      await interesse(seis, { avisadoFimEm: new Date(agora.getTime() - 6 * DIA) });
      await interesse(oito, { avisadoFimEm: new Date(agora.getTime() - 8 * DIA) });
      await interesse(semAviso);

      const ids = (await lerAcompanhandoDaLateral(viewer, agora)).map((i) => i.id);

      expect(ids).toEqual([String(seis)]);
    });

    it('não mostra interesse que saiu, e ordena do interesse mais recente para o mais antigo', async () => {
      const velho = await chamado();
      const novo = await chamado();
      const saiu = await chamado();
      await interesse(velho, { criadoEm: new Date('2026-10-01T00:00:00Z') });
      await interesse(novo, { criadoEm: new Date('2026-10-05T00:00:00Z') });
      await interesse(saiu, { saiuEm: new Date() });

      const ids = (await lerAcompanhandoDaLateral(viewer, agora)).map((i) => i.id);

      expect(ids).toEqual([String(novo), String(velho)]);
    });

    it('para em 20 itens, sem "carregar mais"', async () => {
      for (let i = 0; i < 22; i += 1) {
        const id = await chamado();
        await interesse(id, { criadoEm: new Date(Date.UTC(2026, 9, 1, i)) });
      }
      expect(await lerAcompanhandoDaLateral(viewer, agora)).toHaveLength(20);
    });

    it('quem virou o técnico atribuído não vê o chamado em "Acompanhando"', async () => {
      const id = await chamado({ assignedToUserId: eu });
      await interesse(id);
      expect(await lerAcompanhandoDaLateral(viewer, agora)).toEqual([]);
    });

    // covers: AC-6, AC-15 (revisão de 2026-10-07)
    it('deixa o apoio vazio quando o interesse não pode ver o local, sem esconder o item', async () => {
      // Arrange
      const escondido = await chamado({ status: 'validado' });
      const antigo = await chamado({ status: 'validado' });
      await interesse(escondido, {
        localVisivel: false,
        criadoEm: new Date('2026-10-03T00:00:00Z'),
      });
      await interesseSemCampo(antigo);

      // Act
      const itens = await lerAcompanhandoDaLateral(viewer, agora);

      // Assert
      expect(itens.map((i) => [i.id, i.apoio])).toEqual([
        [String(escondido), ''],
        [String(antigo), ''],
      ]);
    });

    it('sem interesse nenhum, devolve lista vazia', async () => {
      expect(await lerAcompanhandoDaLateral(viewer, agora)).toEqual([]);
    });
  });
});
