import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * A atribuição automática (spec 0008) diante das ações da gestão, com as ações
 * de verdade e o MongoDB de verdade: a janela de prioridade que fecha, a
 * reatribuição que corrige a decisão da regra, a atribuição manual de quem
 * ficou sem técnico e a corrida entre a gestão e o passo automático.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-7 (corrida), AC-9 (correção pela reatribuição), AC-15 (o marcador
 * sobrevive à atribuição manual), AC-18 (manual e reatribuição intactas), AC-19
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(true),
}));

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('atribuição automática e as ações da gestão, contra o Mongo', () => {
  let actions: typeof import('../actions');
  let passo: typeof import('@/lib/chamados/atribuicao-automatica');
  let salvarConfig: typeof import('@/lib/ia-confianca/config').salvarConfig;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  let IaAutonomiaConfigModel: typeof import('@/models/IaAutonomiaConfig').IaAutonomiaConfigModel;
  let NotificationModel: typeof import('@/models/Notification').NotificationModel;
  let ServiceCatalogModel: typeof import('@/models/ServiceCatalog').ServiceCatalogModel;
  let ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  let ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  let SlaConfigModel: typeof import('@/models/SlaConfig').SlaConfigModel;
  let SlaEscalationModel: typeof import('@/models/SlaEscalation').SlaEscalationModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let UnitModel: typeof import('@/models/unit').UnitModel;
  let todos: ModelDeTeste[];

  const prepostoId = new Types.ObjectId();
  const solicitanteId = new Types.ObjectId();
  const carlaId = new Types.ObjectId();
  const diegoId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  let sequencia = 0;

  beforeAll(async () => {
    vi.doMock('@/lib/dal', () => ({
      requireManager: async () => ({ userId: String(prepostoId), role: 'Preposto' }),
    }));
    actions = await import('../actions');
    passo = await import('@/lib/chamados/atribuicao-automatica');
    ({ salvarConfig } = await import('@/lib/ia-confianca/config'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ DecisaoIaModel } = await import('@/models/DecisaoIa'));
    ({ IaAutonomiaConfigModel } = await import('@/models/IaAutonomiaConfig'));
    ({ NotificationModel } = await import('@/models/Notification'));
    ({ ServiceCatalogModel } = await import('@/models/ServiceCatalog'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ SlaConfigModel } = await import('@/models/SlaConfig'));
    ({ SlaEscalationModel } = await import('@/models/SlaEscalation'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ UnitModel } = await import('@/models/unit'));

    todos = [
      ChamadoModel,
      ChamadoHistoryModel,
      DecisaoIaModel,
      IaAutonomiaConfigModel,
      NotificationModel,
      ServiceCatalogModel,
      ServiceSubTypeModel,
      ServiceTypeModel,
      SlaConfigModel,
      SlaEscalationModel,
      UserModel,
      UnitModel,
    ] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_atribuicao_gestao');
  }, 60_000);

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create([
      { _id: prepostoId, name: 'Paulo', username: 'paulo', role: 'Preposto' },
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
      {
        _id: carlaId,
        name: 'Carla',
        username: 'carla',
        role: 'Técnico',
        specialties: [subtypeId],
        maxAssignedTickets: 5,
      },
      {
        _id: diegoId,
        name: 'Diego',
        username: 'diego',
        role: 'Técnico',
        specialties: [subtypeId],
        maxAssignedTickets: 5,
      },
    ] as never);
    await ServiceTypeModel.create({ _id: typeId, name: 'Manutenção Predial' } as never);
    await ServiceSubTypeModel.create({ _id: subtypeId, typeId, name: 'Iluminação' } as never);
    await ServiceCatalogModel.create({
      _id: catalogServiceId,
      code: 'ELET-0001',
      name: 'Troca de lâmpada',
      description: 'Lâmpada queimada',
      typeId,
      subtypeId,
    } as never);
    await SlaConfigModel.create([
      { priority: 'NORMAL', responseTargetMinutes: 120, resolutionTargetMinutes: 480 },
      { priority: 'ALTA', responseTargetMinutes: 30, resolutionTargetMinutes: 120 },
    ] as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
  });

  afterAll(async () => {
    vi.doUnmock('@/lib/dal');
    await desconectarMongoDeTeste();
  });

  async function ligar() {
    await salvarConfig(
      {
        servico: { limiteConfianca: null, amostraMinima: 30 },
        prioridade: { limiteConfianca: 0.5, amostraMinima: 30 },
        autonomiaAtiva: true,
        atribuicaoAutomaticaAtiva: true,
      },
      String(prepostoId),
    );
  }

  /** Um chamado validado pelo chat, como `confirmarAbertura` o deixa antes do passo. */
  async function chamadoValidado() {
    sequencia += 1;
    return ChamadoModel.create({
      ticket_number: `2026-${String(sequencia).padStart(4, '0')}`,
      titulo: 'Troca de lâmpada — Sala 302',
      status: 'validado',
      solicitanteId,
      unitId,
      localExato: 'Sala 302',
      tipoServico: 'Manutenção Predial',
      subtypeId,
      catalogServiceId,
      canalAbertura: 'chat',
      finalPriority: 'NORMAL',
      classifiedAt: new Date(),
      sla: {
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 480,
        businessHoursOnly: true,
        responseDueAt: new Date(Date.now() + 2 * 3600_000),
        resolutionDueAt: new Date(Date.now() + 8 * 3600_000),
        configVersion: 'v1',
      },
    } as never);
  }

  function tentar(chamado: { _id: unknown; ticket_number: string; titulo: string }) {
    return passo.tentarAtribuicaoAutomatica({
      chamadoId: String(chamado._id),
      solicitanteId: String(solicitanteId),
      subtypeId: String(subtypeId),
      titulo: chamado.titulo,
      ticketNumber: chamado.ticket_number,
    });
  }

  // ── janela de prioridade · AC-19 ────────────────────────────────

  describe('correção de prioridade (AC-19)', () => {
    it('um chamado atribuído sozinho recusa a correção, com a mesma mensagem de um atribuído à mão', async () => {
      // Arrange
      await ligar();
      // Sem carga para ninguém, a regra escolhe um dos dois técnicos; à mão, a gestão atribui
      // o segundo chamado ao Diego. O teste não depende de quem a regra escolhe.
      const automatico = await chamadoValidado();
      const resultado = await tentar(automatico);
      expect(resultado.resultado).toBe('atribuido');
      const manual = await chamadoValidado();
      const atribuidoAMao = await actions.assignTicketAction({
        ticketId: String(manual._id),
        preferredTechnicianId: String(diegoId),
      });
      expect(atribuidoAMao.ok).toBe(true);

      // Act
      const recusaAutomatica = await actions.updateTicketPriorityAction({
        chamadoId: String(automatico._id),
        finalPriority: 'ALTA',
        classificationNotes: '',
      });
      const recusaManual = await actions.updateTicketPriorityAction({
        chamadoId: String(manual._id),
        finalPriority: 'ALTA',
        classificationNotes: '',
      });

      // Assert: a mensagem clara de hoje, e o SLA e a prioridade intocados
      expect(recusaAutomatica.ok).toBe(false);
      expect(recusaManual.ok).toBe(false);
      expect(recusaAutomatica).toEqual(recusaManual);
      const depois = await ChamadoModel.findById(automatico._id).lean();
      expect(depois?.finalPriority).toBe('NORMAL');
      expect(depois?.sla?.responseTargetMinutes).toBe(120);
      expect(depois?.sla?.resolutionDueAt).toEqual(automatico.sla?.resolutionDueAt);
    });

    it('um chamado que ficou sem técnico automático continua na janela: a prioridade ainda se corrige', async () => {
      // Arrange: nenhum técnico ativo com a especialidade
      await ligar();
      await UserModel.updateMany({ role: 'Técnico' }, { $set: { isActive: false } });
      const chamado = await chamadoValidado();
      expect(await tentar(chamado)).toEqual({
        resultado: 'sem_tecnico',
        motivo: 'sem_especialidade',
      });

      // Act
      const corrigido = await actions.updateTicketPriorityAction({
        chamadoId: String(chamado._id),
        finalPriority: 'ALTA',
        classificationNotes: 'Mais grave do que parecia.',
      });

      // Assert
      expect(corrigido).toEqual({ ok: true });
      const depois = await ChamadoModel.findById(chamado._id).lean();
      expect(depois?.finalPriority).toBe('ALTA');
      expect(depois?.atribuicaoAutomatica?.resultado).toBe('sem_tecnico');
    });
  });

  // ── reatribuição · AC-9, AC-18 ──────────────────────────────────

  describe('reatribuição de um chamado atribuído sozinho (AC-9)', () => {
    it('marca a decisão da regra como corrigida, grava correcao_ia e guarda a escolha original', async () => {
      // Arrange: a regra escolhe a Carla (Diego tem carga)
      await ligar();
      await ChamadoModel.create({
        ticket_number: 'CARGA-1',
        titulo: 'Carga',
        status: 'em atendimento',
        solicitanteId,
        unitId,
        localExato: 'Sala 1',
        tipoServico: 'Manutenção Predial',
        subtypeId,
        catalogServiceId,
        assignedToUserId: diegoId,
      } as never);
      const chamado = await chamadoValidado();
      const escolhido = await tentar(chamado);
      expect(escolhido).toMatchObject({ resultado: 'atribuido', tecnicoId: String(carlaId) });

      // Act
      const reatribuido = await actions.reassignTicketAction({
        ticketId: String(chamado._id),
        preferredTechnicianId: String(diegoId),
        notes: 'A Carla está em campo hoje.',
      });

      // Assert
      expect(reatribuido).toMatchObject({ ok: true, technicianId: String(diegoId) });
      const decisao = await DecisaoIaModel.findOne({
        chamadoId: chamado._id,
        campo: 'tecnico',
      }).lean();
      expect(decisao?.situacao).toBe('corrigida');
      expect(String(decisao?.valorIa.tecnicoId)).toBe(String(carlaId));
      expect(String(decisao?.valorFinal.tecnicoId)).toBe(String(diegoId));
      expect(decisao?.correcoes).toHaveLength(1);
      expect(decisao?.correcoes[0]).toMatchObject({
        origem: 'gestao',
        motivo: 'A Carla está em campo hoje.',
      });
      expect(
        await ChamadoHistoryModel.countDocuments({ chamadoId: chamado._id, action: 'correcao_ia' }),
      ).toBe(1);
      expect(
        await ChamadoHistoryModel.countDocuments({
          chamadoId: chamado._id,
          action: 'reatribuicao_tecnico',
        }),
      ).toBe(1);

      // O marcador guarda a escolha original de propósito (AC-15)
      const doc = await ChamadoModel.findById(chamado._id).lean();
      expect(String(doc?.assignedToUserId)).toBe(String(diegoId));
      expect(String(doc?.atribuicaoAutomatica?.tecnicoId)).toBe(String(carlaId));
      expect(doc?.atribuicaoAutomatica?.resultado).toBe('atribuido');
    });

    it('reatribuir chamado sem decisão de técnico segue como hoje, sem nada a corrigir', async () => {
      // Arrange: chamado atribuído à mão, sem passo automático
      const chamado = await chamadoValidado();
      await actions.assignTicketAction({
        ticketId: String(chamado._id),
        preferredTechnicianId: String(carlaId),
      });

      // Act
      const reatribuido = await actions.reassignTicketAction({
        ticketId: String(chamado._id),
        preferredTechnicianId: String(diegoId),
        notes: 'Troca de turno do técnico.',
      });

      // Assert
      expect(reatribuido).toMatchObject({ ok: true, technicianId: String(diegoId) });
      expect(await DecisaoIaModel.countDocuments({ campo: 'tecnico' })).toBe(0);
      expect(
        await ChamadoHistoryModel.countDocuments({ chamadoId: chamado._id, action: 'correcao_ia' }),
      ).toBe(0);
    });
  });

  // ── atribuição manual · AC-15, AC-18 ────────────────────────────

  describe('atribuição manual de um chamado sem técnico automático', () => {
    it('atribui como hoje, com o autor humano, e o marcador continua dizendo que a regra não achou técnico', async () => {
      // Arrange
      await ligar();
      await UserModel.updateMany({ role: 'Técnico' }, { $set: { maxAssignedTickets: 1 } });
      for (const tecnico of [carlaId, diegoId]) {
        await ChamadoModel.create({
          ticket_number: `CARGA-${String(tecnico).slice(-4)}`,
          titulo: 'Carga',
          status: 'em atendimento',
          solicitanteId,
          unitId,
          localExato: 'Sala 1',
          tipoServico: 'Manutenção Predial',
          subtypeId,
          catalogServiceId,
          assignedToUserId: tecnico,
        } as never);
      }
      const chamado = await chamadoValidado();
      expect(await tentar(chamado)).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });
      // Abre vaga e o Preposto atribui à mão
      await UserModel.updateMany({ role: 'Técnico' }, { $set: { maxAssignedTickets: 5 } });

      // Act
      const resultado = await actions.assignTicketAction({
        ticketId: String(chamado._id),
        preferredTechnicianId: String(carlaId),
      });

      // Assert
      expect(resultado).toMatchObject({
        ok: true,
        technicianId: String(carlaId),
        strategy: 'MANUAL',
      });
      const doc = await ChamadoModel.findById(chamado._id).lean();
      expect(doc?.status).toBe('em atendimento');
      expect(String(doc?.assignedByUserId)).toBe(String(prepostoId));
      expect(doc?.atribuicaoAutomatica).toMatchObject({
        resultado: 'sem_tecnico',
        motivo: 'sem_vaga',
      });
      const notificacao = await NotificationModel.findOne({ type: 'ticket:assigned' }).lean();
      expect(notificacao?.title).toBe(`Chamado #${chamado.ticket_number} atribuído a você`);
      expect(notificacao?.data).toMatchObject({
        assignedBy: { id: String(prepostoId), name: 'Paulo' },
      });
    });
  });

  // ── corrida com a gestão · AC-7 ─────────────────────────────────

  describe('corrida entre a gestão e o passo automático (AC-7)', () => {
    it('o passo automático venceu primeiro: a atribuição manual seguinte é recusada e nada é sobrescrito', async () => {
      // Arrange: a ordem forçada, o passo termina antes de a gestão agir
      await ligar();
      const chamado = await chamadoValidado();
      const automatico = await tentar(chamado);
      if (automatico.resultado !== 'atribuido') throw new Error('esperava atribuição');
      const outro = automatico.tecnicoId === String(diegoId) ? carlaId : diegoId;

      // Act
      const manual = await actions.assignTicketAction({
        ticketId: String(chamado._id),
        preferredTechnicianId: String(outro),
      });

      // Assert
      expect(manual.ok).toBe(false);
      const doc = await ChamadoModel.findById(chamado._id).lean();
      expect(String(doc?.assignedToUserId)).toBe(automatico.tecnicoId);
      expect(doc?.assignedByUserId).toBeUndefined();
      expect(doc?.atribuicaoAutomatica?.resultado).toBe('atribuido');
      expect(await NotificationModel.countDocuments({ type: 'ticket:assigned' })).toBe(1);
    });

    it('a gestão venceu primeiro: o passo automático seguinte não atribui, não marca e não avisa', async () => {
      // Arrange: a outra ordem forçada, a gestão atribui antes de o passo agir
      await ligar();
      const chamado = await chamadoValidado();
      const manual = await actions.assignTicketAction({
        ticketId: String(chamado._id),
        preferredTechnicianId: String(diegoId),
      });
      expect(manual.ok).toBe(true);

      // Act
      const automatico = await tentar(chamado);

      // Assert
      expect(automatico).toEqual({ resultado: 'nao_tentada' });
      const doc = await ChamadoModel.findById(chamado._id).lean();
      expect(String(doc?.assignedToUserId)).toBe(String(diegoId));
      expect(String(doc?.assignedByUserId)).toBe(String(prepostoId));
      expect(doc?.atribuicaoAutomatica).toBeUndefined();
      expect(await NotificationModel.countDocuments({ type: 'ticket:assigned' })).toBe(1);
    });

    it('ao mesmo tempo, exatamente um vence, seja qual for a intercalação', async () => {
      // As duas ordens têm teste próprio, logo acima. Aqui vale a invariante de cada rodada,
      // para quem vencer: um técnico só, nada sobrescrito, um aviso só.
      await ligar();

      for (let rodada = 0; rodada < 20; rodada += 1) {
        // Arrange: cada rodada parte de técnicos sem carga, senão o limite de 5 fecha o jogo
        await Promise.all([
          NotificationModel.deleteMany({}),
          ChamadoModel.deleteMany({}),
          DecisaoIaModel.deleteMany({}),
          ChamadoHistoryModel.deleteMany({}),
        ]);
        const chamado = await chamadoValidado();

        // Act: a gestão atribui ao Diego no mesmo instante em que o passo escolhe
        const [automatico, manual] = await Promise.all([
          tentar(chamado),
          actions.assignTicketAction({
            ticketId: String(chamado._id),
            preferredTechnicianId: String(diegoId),
          }),
        ]);

        // Assert: exatamente um vence
        const doc = await ChamadoModel.findById(chamado._id).lean();
        expect(doc?.status).toBe('em atendimento');
        expect(doc?.assignedToUserId).toBeDefined();
        const avisos = await NotificationModel.find({ type: 'ticket:assigned' }).lean();
        expect(avisos).toHaveLength(1);

        if (automatico.resultado === 'atribuido') {
          expect(manual.ok).toBe(false);
          expect(String(doc?.assignedToUserId)).toBe(automatico.tecnicoId);
          expect(doc?.assignedByUserId).toBeUndefined();
          expect(String(avisos[0].userId)).toBe(automatico.tecnicoId);
        } else {
          expect(automatico).toEqual({ resultado: 'nao_tentada' });
          expect(manual).toMatchObject({ ok: true, technicianId: String(diegoId) });
          expect(String(doc?.assignedToUserId)).toBe(String(diegoId));
          expect(String(doc?.assignedByUserId)).toBe(String(prepostoId));
          expect(doc?.atribuicaoAutomatica).toBeUndefined();
          expect(String(avisos[0].userId)).toBe(String(diegoId));
        }
      }
    });
  });
});
