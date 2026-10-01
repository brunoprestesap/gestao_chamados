import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a) }));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(true),
}));
const mockRequireSession = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
  requireManager: () => mockRequireSession(),
}));

/**
 * O prazo para avaliar e o encerramento definitivo contra o MongoDB de verdade
 * (spec 0010). Filtro atômico, corrida entre a avaliação e o cron e a ordem do
 * lote não aparecem com mock.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-11, AC-13
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

type Modulos = {
  executarEncerramentoAutomatico: typeof import('../encerramento-automatico').executarEncerramentoAutomatico;
  submitTicketEvaluationAction: typeof import('@/app/(dashboard)/meus-chamados/actions').submitTicketEvaluationAction;
  refuseServiceAction: typeof import('@/app/(dashboard)/meus-chamados/actions').refuseServiceAction;
  createTicketAction: typeof import('@/app/(dashboard)/meus-chamados/actions').createTicketAction;
  reopenTicketAction: typeof import('@/app/(dashboard)/gestao/actions').reopenTicketAction;
  ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  BusinessCalendarModel: typeof import('@/models/BusinessCalendar').BusinessCalendarModel;
  NotificationModel: typeof import('@/models/Notification').NotificationModel;
  UserModel: typeof import('@/models/user.model').UserModel;
};

const HORA = 3_600_000;

rodar('prazo para avaliar e encerramento definitivo, contra o Mongo', () => {
  let m: Modulos;
  let todos: ModelDeTeste[];

  const solicitanteId = new Types.ObjectId();
  const outroSolicitanteId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();
  let sequencia = 0;

  async function criarChamado(extra: Record<string, unknown> = {}) {
    sequencia += 1;
    return m.ChamadoModel.create({
      ticket_number: `2026-${String(sequencia).padStart(5, '0')}`,
      titulo: 'Ar-Condicionado — Sala 205',
      descricao: 'Não gela.',
      status: 'concluído',
      solicitanteId,
      unitId,
      localExato: 'Sala 205',
      tipoServico: 'Ar-Condicionado',
      subtypeId,
      catalogServiceId,
      concludedAt: new Date(Date.now() - 50 * HORA),
      ...extra,
    } as never);
  }

  async function ler(id: unknown) {
    return (await m.ChamadoModel.findById(id).lean()) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  function comoSolicitante(userId = solicitanteId) {
    mockRequireSession.mockResolvedValue({
      userId: String(userId),
      role: 'Solicitante',
      username: 'maria',
    });
  }

  beforeAll(async () => {
    const meus = await import('@/app/(dashboard)/meus-chamados/actions');
    m = {
      executarEncerramentoAutomatico: (await import('../encerramento-automatico'))
        .executarEncerramentoAutomatico,
      submitTicketEvaluationAction: meus.submitTicketEvaluationAction,
      refuseServiceAction: meus.refuseServiceAction,
      createTicketAction: meus.createTicketAction,
      reopenTicketAction: (await import('@/app/(dashboard)/gestao/actions')).reopenTicketAction,
      ChamadoModel: (await import('@/models/Chamado')).ChamadoModel,
      ChamadoHistoryModel: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      BusinessCalendarModel: (await import('@/models/BusinessCalendar')).BusinessCalendarModel,
      NotificationModel: (await import('@/models/Notification')).NotificationModel,
      UserModel: (await import('@/models/user.model')).UserModel,
    };
    todos = [
      m.ChamadoModel,
      m.ChamadoHistoryModel,
      m.BusinessCalendarModel,
      m.NotificationModel,
      m.UserModel,
    ] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_encerramento_automatico');
  }, 60_000);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEmitToRoom.mockReset().mockResolvedValue(true);
    comoSolicitante();
    await m.UserModel.create([
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
      { _id: outroSolicitanteId, name: 'José', username: 'jose', role: 'Solicitante' },
      { _id: adminId, name: 'Ana', username: 'ana', role: 'Admin', isActive: true },
    ] as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  // ── cron · AC-6, AC-7 ──────────────────────────────────────────

  describe('cron', () => {
    it('encerra os vencidos com closedAt = prazo, preenche os sem prazo e é idempotente', async () => {
      // Arrange
      const prazoVencido = new Date(Date.now() - 2 * HORA);
      const vencido = await criarChamado({ prazoAvaliacaoAte: prazoVencido });
      const aberto = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() + 10 * HORA) });
      const legado = await criarChamado();
      await m.ChamadoModel.collection.updateOne(
        { _id: legado._id },
        { $unset: { prazoAvaliacaoAte: '' } },
      );

      // Act
      const primeira = await m.executarEncerramentoAutomatico();
      const segunda = await m.executarEncerramentoAutomatico();

      // Assert
      expect(primeira).toEqual({ encerrados: 1, prazosPreenchidos: 1 });
      expect(segunda).toEqual({ encerrados: 0, prazosPreenchidos: 0 });

      const v = await ler(vencido._id);
      expect(v?.status).toBe('encerrado');
      expect(v?.closedAt.getTime()).toBe(prazoVencido.getTime());
      expect(v?.closedByUserId ?? null).toBeNull();
      expect(v?.evaluation?.rating).toBeUndefined();

      expect((await ler(aberto._id))?.status).toBe('concluído');
      const l = await ler(legado._id);
      expect(l?.status).toBe('concluído');
      expect(l?.prazoAvaliacaoAte.getTime()).toBeGreaterThan(Date.now() + 47 * HORA);

      const historico = await m.ChamadoHistoryModel.find({ chamadoId: vencido._id }).lean();
      expect(historico).toHaveLength(1);
      expect(historico[0]).toMatchObject({
        action: 'encerramento_automatico',
        actorType: 'sistema',
        userId: null,
        statusAnterior: 'concluído',
        statusNovo: 'encerrado',
      });

      // Só a sala do solicitante, sem `Notification` (AC-9b)
      expect(mockEmitToRoom).toHaveBeenCalledTimes(1);
      expect(mockEmitToRoom.mock.calls[0][0]).toBe(`user:${String(solicitanteId)}`);
      expect(mockEmitToRoom.mock.calls[0][2]).toMatchObject({
        closedBy: null,
        motivo: 'automatico',
      });
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
    });

    it('preenche o legado com as horas configuradas pelo Admin', async () => {
      // Arrange
      await m.BusinessCalendarModel.create({ prazoAvaliacaoHoras: 24 } as never);
      const legado = await criarChamado();
      await m.ChamadoModel.collection.updateOne(
        { _id: legado._id },
        { $unset: { prazoAvaliacaoAte: '' } },
      );
      const antes = Date.now();

      // Act
      await m.executarEncerramentoAutomatico();

      // Assert
      const prazo = (await ler(legado._id))?.prazoAvaliacaoAte.getTime();
      expect(prazo).toBeGreaterThanOrEqual(antes + 24 * HORA);
      expect(prazo).toBeLessThan(antes + 25 * HORA);
    });
  });

  // ── corrida · AC-2, AC-6 ───────────────────────────────────────

  describe('corrida entre avaliação e cron', () => {
    it('só um encerra; se a avaliação venceu, a nota fica', async () => {
      // Arrange: o cron roda com o relógio 2h à frente, então para ele o prazo
      // já venceu, enquanto para a avaliação a janela ainda está aberta. Os dois
      // casam o mesmo chamado e disputam a escrita.
      for (let rodada = 0; rodada < 10; rodada += 1) {
        const chamado = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() + HORA) });

        // Act
        const [avaliacao, cron] = await Promise.all([
          m.submitTicketEvaluationAction({
            ticketId: String(chamado._id),
            rating: 5,
            comment: '',
          }),
          m.executarEncerramentoAutomatico(new Date(Date.now() + 2 * HORA)),
        ]);

        // Assert
        const c = await ler(chamado._id);
        expect(c?.status).toBe('encerrado');
        const historico = await m.ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
        expect(historico).toHaveLength(1);
        expect(Number(avaliacao.ok) + cron.encerrados).toBe(1);
        if (avaliacao.ok) {
          expect(c?.evaluation?.rating).toBe(5);
          expect(historico[0].action).toBe('encerramento_por_avaliacao');
        } else {
          expect(c?.evaluation?.rating).toBeUndefined();
          expect(historico[0].action).toBe('encerramento_automatico');
        }
      }
    });

    it('com o prazo vencido, o cron encerra e a avaliação que chega depois é recusada', async () => {
      // Arrange
      const chamado = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() - HORA) });

      // Act
      const [cron, avaliacao] = await Promise.all([
        m.executarEncerramentoAutomatico(),
        m.submitTicketEvaluationAction({ ticketId: String(chamado._id), rating: 3, comment: '' }),
      ]);

      // Assert
      expect(cron.encerrados).toBe(1);
      expect(avaliacao.ok).toBe(false);
      const c = await ler(chamado._id);
      expect(c?.status).toBe('encerrado');
      expect(c?.evaluation?.rating).toBeUndefined();
    });
  });

  // ── avaliar · AC-2 ─────────────────────────────────────────────

  describe('avaliar', () => {
    it('grava a nota e encerra na mesma escrita, com uma entrada só no histórico', async () => {
      // Arrange
      const chamado = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() + HORA) });

      // Act
      const r = await m.submitTicketEvaluationAction({
        ticketId: String(chamado._id),
        rating: 4,
        comment: 'ok',
      });

      // Assert
      expect(r).toEqual({ ok: true });
      const c = await ler(chamado._id);
      expect(c).toMatchObject({ status: 'encerrado', closureNotes: '' });
      expect(c?.closedAt).toBeInstanceOf(Date);
      expect(c?.evaluation?.rating).toBe(4);
      const historico = await m.ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
      expect(historico).toHaveLength(1);
      expect(historico[0]).toMatchObject({
        action: 'encerramento_por_avaliacao',
        statusAnterior: 'concluído',
        statusNovo: 'encerrado',
        observacoes: 'Avaliação: 4/5',
      });
    });

    it('encerrado devolve "Este chamado já foi encerrado."', async () => {
      // Arrange
      const chamado = await criarChamado({ status: 'encerrado', closedAt: new Date() });

      // Act
      const r = await m.submitTicketEvaluationAction({
        ticketId: String(chamado._id),
        rating: 4,
        comment: '',
      });

      // Assert
      expect(r).toEqual({ ok: false, error: 'Este chamado já foi encerrado.' });
    });

    it('prazo vencido com o cron atrasado devolve o erro de prazo', async () => {
      // Arrange
      const chamado = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() - 60_000) });

      // Act
      const r = await m.submitTicketEvaluationAction({
        ticketId: String(chamado._id),
        rating: 4,
        comment: '',
      });

      // Assert
      expect(r).toEqual({ ok: false, error: 'O prazo para avaliar este chamado terminou.' });
      expect((await ler(chamado._id))?.status).toBe('concluído');
    });
  });

  // ── recusar e reabrir · AC-3, AC-4 ─────────────────────────────

  describe('recusar e reabrir', () => {
    it('recusar limpa o prazo e devolve para em atendimento', async () => {
      // Arrange
      const chamado = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() + HORA) });

      // Act
      const r = await m.refuseServiceAction({
        ticketId: String(chamado._id),
        reason: 'O ar voltou a pingar depois do serviço.',
      });

      // Assert
      expect(r).toEqual({ ok: true });
      const c = await ler(chamado._id);
      expect(c?.status).toBe('em atendimento');
      expect(c?.prazoAvaliacaoAte).toBeNull();
    });

    it('Admin não reabre um encerrado: o encerrado é definitivo', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue({
        userId: String(adminId),
        role: 'Admin',
        username: 'ana',
      });
      const chamado = await criarChamado({ status: 'encerrado', closedAt: new Date() });

      // Act
      const r = await m.reopenTicketAction({
        ticketId: String(chamado._id),
        reason: 'O técnico concluiu errado.',
      });

      // Assert
      expect(r).toEqual({
        ok: false,
        error: 'Chamado encerrado definitivamente. Abra um novo chamado.',
      });
      expect((await ler(chamado._id))?.status).toBe('encerrado');
    });

    it('Admin reabre um concluído dentro do prazo e o prazo é limpo', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue({
        userId: String(adminId),
        role: 'Admin',
        username: 'ana',
      });
      const chamado = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() + HORA) });

      // Act
      const r = await m.reopenTicketAction({
        ticketId: String(chamado._id),
        reason: 'O técnico concluiu errado.',
      });

      // Assert
      expect(r).toEqual({ ok: true });
      const c = await ler(chamado._id);
      expect(c?.status).toBe('em atendimento');
      expect(c?.prazoAvaliacaoAte).toBeNull();
    });
  });

  // ── reincidência · AC-11, AC-12 ────────────────────────────────

  describe('o problema voltou', () => {
    const formulario = {
      unitId: String(unitId),
      localExato: 'Sala 205',
      tipoServico: 'Ar-Condicionado' as const,
      descricao: 'Voltou a pingar.',
      naturezaAtendimento: 'Padrão' as const,
      grauUrgencia: 'Normal' as const,
      telefoneContato: undefined,
      subtypeId: String(subtypeId),
      catalogServiceId: String(catalogServiceId),
    };

    it('o dono cria o chamado novo ligado ao anterior, aberto e sem herdar SLA', async () => {
      // Arrange
      const anterior = await criarChamado({
        status: 'encerrado',
        closedAt: new Date(),
        finalPriority: 'ALTA',
      });

      // Act
      const r = await m.createTicketAction({
        ...formulario,
        chamadoAnteriorId: String(anterior._id),
      });

      // Assert
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const novo = await ler(r.ticketId);
      expect(novo?.status).toBe('aberto');
      expect(String(novo?.chamadoAnteriorId)).toBe(String(anterior._id));
      expect(novo?.finalPriority).toBeUndefined();
      expect(novo?.sla?.resolutionDueAt).toBeUndefined();
      const abertura = await m.ChamadoHistoryModel.findOne({ chamadoId: r.ticketId }).lean();
      expect(abertura?.observacoes).toContain(`Reincidência do chamado #${anterior.ticket_number}`);
    });

    it('recusa anterior de outro solicitante, ou que não está encerrado', async () => {
      // Arrange
      const alheio = await criarChamado({
        status: 'encerrado',
        closedAt: new Date(),
        solicitanteId: outroSolicitanteId,
      });
      const concluido = await criarChamado({ prazoAvaliacaoAte: new Date(Date.now() + HORA) });

      // Act
      const r1 = await m.createTicketAction({
        ...formulario,
        chamadoAnteriorId: String(alheio._id),
      });
      const r2 = await m.createTicketAction({
        ...formulario,
        chamadoAnteriorId: String(concluido._id),
      });

      // Assert
      expect(r1).toEqual({ ok: false, error: 'Chamado anterior inválido.' });
      expect(r2).toEqual({ ok: false, error: 'Chamado anterior inválido.' });
    });
  });
});
