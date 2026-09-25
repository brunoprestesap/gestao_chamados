import { readFileSync } from 'node:fs';
import path from 'node:path';

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

/**
 * A atribuição automática ao técnico contra o MongoDB de verdade (spec 0008).
 * Gravação condicional, agregação de carga e a volta do desfazer não aparecem
 * com mock: ou o banco está lá, ou o teste não prova nada.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-9, AC-10, AC-11, AC-14, AC-17
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

type Modulos = {
  tentarAtribuicaoAutomatica: typeof import('../atribuicao-automatica').tentarAtribuicaoAutomatica;
  salvarConfig: typeof import('@/lib/ia-confianca/config').salvarConfig;
  medirCalibragem: typeof import('@/lib/ia-confianca/calibragem').medirCalibragem;
  decisoes: typeof import('@/lib/conversas/decisoes');
  ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  IaAutonomiaConfigModel: typeof import('@/models/IaAutonomiaConfig').IaAutonomiaConfigModel;
  NotificationModel: typeof import('@/models/Notification').NotificationModel;
  UserModel: typeof import('@/models/user.model').UserModel;
};

rodar('tentarAtribuicaoAutomatica, contra o Mongo', () => {
  let m: Modulos;
  let todos: ModelDeTeste[];
  let avisos: string[];
  let erros: string[];

  const solicitanteId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const outroSubtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  let sequencia = 0;

  async function ligar({ autonomia = true, atribuicao = true } = {}) {
    await m.salvarConfig(
      {
        servico: { limiteConfianca: null, amostraMinima: 30 },
        prioridade: { limiteConfianca: 0.5, amostraMinima: 30 },
        autonomiaAtiva: autonomia,
        atribuicaoAutomaticaAtiva: atribuicao,
      },
      String(adminId),
    );
  }

  async function criarTecnico(
    nome: string,
    extra: Record<string, unknown> = {},
  ): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await m.UserModel.create({
      _id,
      name: nome,
      username: `${nome.toLowerCase()}${(sequencia += 1)}`,
      role: 'Técnico',
      isActive: true,
      specialties: [subtypeId],
      maxAssignedTickets: 5,
      ...extra,
    } as never);
    return _id;
  }

  /** Um chamado já com técnico, para dar carga ou histórico de atribuição a ele. */
  async function darCarga(
    tecnicoId: Types.ObjectId,
    quantos: number,
    extra: Record<string, unknown> = {},
  ) {
    for (let i = 0; i < quantos; i += 1) {
      await criarChamado({
        status: 'em atendimento',
        assignedToUserId: tecnicoId,
        assignedAt: new Date('2026-01-10T12:00:00Z'),
        ...extra,
      });
    }
  }

  async function criarChamado(extra: Record<string, unknown> = {}) {
    sequencia += 1;
    return m.ChamadoModel.create({
      ticket_number: `2026-${String(sequencia).padStart(4, '0')}`,
      titulo: 'Troca de lâmpada — Sala 302',
      descricao: 'A lâmpada da sala 302 queimou.',
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
        businessHoursOnly: false,
        responseDueAt: new Date(Date.now() + 2 * 3600_000),
        resolutionDueAt: new Date(Date.now() + 8 * 3600_000),
        configVersion: 'v1',
      },
      ...extra,
    } as never);
  }

  function paramsDe(chamado: { _id: unknown; ticket_number: string; titulo: string }, extra = {}) {
    return {
      chamadoId: String(chamado._id),
      solicitanteId: String(solicitanteId),
      subtypeId: String(subtypeId),
      titulo: chamado.titulo,
      ticketNumber: chamado.ticket_number,
      ...extra,
    };
  }

  async function ler(chamadoId: unknown) {
    return (await m.ChamadoModel.findById(chamadoId).lean()) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  /** A 1ª agregação é a dos candidatos; a 2ª, a recontagem depois de gravar. */
  function falharNaRecontagem() {
    const original = m.ChamadoModel.aggregate.bind(m.ChamadoModel);
    let chamadas = 0;
    vi.spyOn(m.ChamadoModel, 'aggregate').mockImplementation(((...args: unknown[]) => {
      chamadas += 1;
      if (chamadas === 2) throw new Error('recontagem caiu');
      return (original as (...a: unknown[]) => unknown)(...args);
    }) as never);
  }

  function linhasDeLog(tag: string): Record<string, unknown>[] {
    return [...avisos, ...erros]
      .filter((linha) => linha.startsWith(`${tag} `))
      .map((linha) => JSON.parse(linha.slice(tag.length + 1)));
  }

  beforeAll(async () => {
    m = {
      tentarAtribuicaoAutomatica: (await import('../atribuicao-automatica'))
        .tentarAtribuicaoAutomatica,
      salvarConfig: (await import('@/lib/ia-confianca/config')).salvarConfig,
      medirCalibragem: (await import('@/lib/ia-confianca/calibragem')).medirCalibragem,
      decisoes: await import('@/lib/conversas/decisoes'),
      ChamadoModel: (await import('@/models/Chamado')).ChamadoModel,
      ChamadoHistoryModel: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      DecisaoIaModel: (await import('@/models/DecisaoIa')).DecisaoIaModel,
      IaAutonomiaConfigModel: (await import('@/models/IaAutonomiaConfig')).IaAutonomiaConfigModel,
      NotificationModel: (await import('@/models/Notification')).NotificationModel,
      UserModel: (await import('@/models/user.model')).UserModel,
    };
    todos = [
      m.ChamadoModel,
      m.ChamadoHistoryModel,
      m.DecisaoIaModel,
      m.IaAutonomiaConfigModel,
      m.NotificationModel,
      m.UserModel,
    ] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_atribuicao_automatica');
  }, 60_000);

  beforeEach(async () => {
    avisos = [];
    erros = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      avisos.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      erros.push(args.map(String).join(' '));
    });
    mockEmitToRoom.mockReset().mockResolvedValue(true);

    await m.UserModel.create([
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
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

  // ── caminho feliz · AC-1, AC-9, AC-10, AC-11, AC-14, AC-17 ──────

  describe('caminho feliz', () => {
    it('três técnicos com cargas 2, 1 e 3: o de carga 1 recebe, com tudo gravado e avisado', async () => {
      // Arrange
      await ligar();
      const t2 = await criarTecnico('Bruno');
      const t1 = await criarTecnico('Carla');
      const t3 = await criarTecnico('Diego');
      await darCarga(t2, 2);
      await darCarga(t1, 1);
      await darCarga(t3, 3);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert: o resultado devolvido (AC-1, AC-2)
      expect(resultado).toEqual({
        resultado: 'atribuido',
        tecnicoId: String(t1),
        tecnicoNome: 'Carla',
      });

      // O chamado terminou em atendimento, com o técnico e sem autor humano (AC-1)
      const doc = await ler(chamado._id);
      expect(doc).toMatchObject({ status: 'em atendimento' });
      expect(String(doc?.assignedToUserId)).toBe(String(t1));
      expect(doc?.assignedAt).toBeInstanceOf(Date);
      expect(doc?.assignedByUserId).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toMatchObject({ resultado: 'atribuido', motivo: null });
      expect(String(doc?.atribuicaoAutomatica.tecnicoId)).toBe(String(t1));

      // A atribuição conta como início da resposta, no mesmo instante (AC-14)
      expect(doc?.sla.responseStartedAt).toEqual(doc?.assignedAt);
      expect(doc?.sla.responseBreachedAt).toBeUndefined();
      expect(doc?.sla.responseDueAt).toEqual(chamado.sla?.responseDueAt);
      expect(doc?.sla.resolutionDueAt).toEqual(chamado.sla?.resolutionDueAt);

      // Histórico de autor sistema, sem id, motivo nem carga (AC-10)
      const historico = await m.ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
      expect(historico).toHaveLength(1);
      expect(historico[0]).toMatchObject({
        action: 'atribuicao_tecnico',
        actorType: 'sistema',
        userId: null,
        statusAnterior: 'validado',
        statusNovo: 'em atendimento',
        observacoes: 'Atribuído automaticamente a Carla',
      });
      expect(historico[0].observacoes).not.toContain(String(t1));

      // A decisão de técnico, por regra e já aplicada (AC-9)
      const decisao = await m.DecisaoIaModel.findOne({ chamadoId: chamado._id }).lean();
      expect(decisao).toMatchObject({
        campo: 'tecnico',
        decididoPor: 'regra',
        efeito: 'aplicado',
        confianca: null,
        modelo: null,
        promptVersion: null,
        task: null,
        llmCallId: null,
        situacao: 'sem_revisao',
      });
      expect(String(decisao?.valorIa.tecnicoId)).toBe(String(t1));
      expect(decisao?.valorIa.rotulo).toBe('Carla');
      expect(decisao?.motivo.length).toBeGreaterThan(0);
      expect(decisao?.motivo.length).toBeLessThanOrEqual(200);
      expect(decisao?.motivo).toContain('1 de 5');

      // O técnico recebe a notificação de sempre, em variante automática (AC-11)
      const notificacoes = await m.NotificationModel.find({}).lean();
      expect(notificacoes).toHaveLength(1);
      expect(String(notificacoes[0].userId)).toBe(String(t1));
      expect(notificacoes[0]).toMatchObject({
        type: 'ticket:assigned',
        title: `Chamado #${chamado.ticket_number} atribuído a você automaticamente`,
      });
      expect(notificacoes[0].data).toMatchObject({
        assignedBy: { id: 'sistema', name: 'Atribuição automática' },
        assignedTo: { id: String(t1), name: 'Carla' },
      });

      // E o socket avisa o técnico e o solicitante, com o mesmo payload (AC-11)
      const paraTecnico = mockEmitToRoom.mock.calls.find((c) => c[0] === `user:${t1}`);
      const paraSolicitante = mockEmitToRoom.mock.calls.find(
        (c) => c[0] === `user:${solicitanteId}`,
      );
      expect(paraTecnico?.[1]).toBe('ticket:assigned');
      expect(paraSolicitante?.[1]).toBe('ticket:assigned');
      expect(paraSolicitante?.[2]).toEqual(paraTecnico?.[2]);

      // Uma linha de log, sem texto de relato (AC-17)
      const linhas = linhasDeLog('[atribuicao]');
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        chamadoId: String(chamado._id),
        resultado: 'atribuido',
        motivo: null,
        tecnicoId: String(t1),
        candidatos: 1,
      });
      expect(typeof linhas[0].duracaoMs).toBe('number');
      expect(JSON.stringify(linhas[0])).not.toContain('lâmpada');
      expect(JSON.stringify(linhas[0])).not.toContain('Sala 302');
    });

    it('SLA de resposta já vencido: o marcador de breach sai do mesmo cálculo da atribuição manual (AC-14)', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const vencido = new Date(Date.now() - 3600_000);
      const chamado = await criarChamado({ 'sla.responseDueAt': vencido });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado.resultado).toBe('atribuido');
      const doc = await ler(chamado._id);
      expect(doc?.sla.responseBreachedAt).toEqual(doc?.sla.responseStartedAt);
      expect(doc?.sla.responseDueAt).toEqual(vencido);
    });

    it('a decisão de técnico, nem depois de corrigida, altera a amostra de calibragem (AC-9)', async () => {
      // Arrange: uma decisão de serviço da IA, já revisada, é a amostra de controle. Ela é
      // elegível de verdade, então o relatório deixa de ser "0 igual a 0".
      const { ABERTURA_TASK, PROMPT_VERSION } = await import('@/lib/assistente/prompt');
      await m.DecisaoIaModel.create({
        chamadoId: new Types.ObjectId(),
        campo: 'servico',
        decididoPor: 'ia',
        efeito: 'sugestao',
        valorIa: { rotulo: 'Troca de lâmpada' },
        valorFinal: { rotulo: 'Troca de lâmpada' },
        confianca: 0.9,
        motivo: 'Amostra de controle.',
        task: ABERTURA_TASK,
        promptVersion: PROMPT_VERSION,
        revisadaEm: new Date(),
        situacao: 'confirmada',
      } as never);
      const antes = await m.medirCalibragem({ servico: 1, prioridade: 1 });
      expect(antes.servico.totalElegivel).toBe(1);
      expect(antes.prioridade.totalElegivel).toBe(0);

      await ligar();
      const escolhido = await criarTecnico('Bruno');
      const outro = await criarTecnico('Carla');
      await darCarga(outro, 1);
      const chamado = await criarChamado();
      await m.tentarAtribuicaoAutomatica(paramsDe(chamado));
      const prepostoId = new Types.ObjectId();

      // Act: o Preposto troca o técnico, como `reassignTicketAction` faz
      await m.decisoes.aplicarVeredito({
        viewer: { userId: String(prepostoId), role: 'Preposto' },
        chamadoId: String(chamado._id),
        vereditos: [{ campo: 'tecnico', valor: { tecnicoId: String(outro) } }],
      });

      // Assert: corrigida, com a entrada `correcao_ia` pelo caminho de sempre
      const decisao = await m.DecisaoIaModel.findOne({ chamadoId: chamado._id }).lean();
      expect(decisao?.situacao).toBe('corrigida');
      expect(String(decisao?.valorIa.tecnicoId)).toBe(String(escolhido));
      expect(String(decisao?.valorFinal.tecnicoId)).toBe(String(outro));
      const correcao = await m.ChamadoHistoryModel.findOne({
        chamadoId: chamado._id,
        action: 'correcao_ia',
      }).lean();
      expect(correcao).not.toBeNull();

      // A amostra é exatamente a de antes: nem a decisão por regra, nem a correção entram
      const depois = await m.medirCalibragem({ servico: 1, prioridade: 1 });
      expect(depois).toEqual(antes);
      // E o campo `tecnico` nem é medido: a calibragem só conhece serviço e prioridade
      const { IA_CONFIANCA_CAMPOS } = await import('@/shared/ia-confianca/ia-confianca.schemas');
      expect([...IA_CONFIANCA_CAMPOS]).not.toContain('tecnico');
    });

    it('a decisão de técnico é só de Preposto e Admin (AC-9)', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado();
      await m.tentarAtribuicaoAutomatica(paramsDe(chamado));
      const id = String(chamado._id);

      // Act
      const solicitante = await m.decisoes.lerDecisoes(
        { userId: String(solicitanteId), role: 'Solicitante' },
        id,
      );
      const tecnico = await m.decisoes.lerDecisoes(
        { userId: String(new Types.ObjectId()), role: 'Técnico' },
        id,
      );
      const preposto = await m.decisoes.lerDecisoes(
        { userId: String(new Types.ObjectId()), role: 'Preposto' },
        id,
      );

      // Assert
      expect(solicitante).toEqual({ ok: false, reason: 'sem_permissao' });
      expect(tecnico).toEqual({ ok: false, reason: 'sem_permissao' });
      expect(preposto.ok && preposto.decisoes.map((d) => d.campo)).toEqual(['tecnico']);
    });
  });

  // ── o critério · AC-2 ────────────────────────────────────────────

  describe('critério de escolha', () => {
    it('empate de carga: vence quem está há mais tempo sem receber chamado', async () => {
      // Arrange
      await ligar();
      const recente = await criarTecnico('Bruno');
      const antigo = await criarTecnico('Carla');
      await darCarga(recente, 1, { assignedAt: new Date('2026-03-01T12:00:00Z') });
      await darCarga(antigo, 1, { assignedAt: new Date('2026-01-01T12:00:00Z') });
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(antigo) });
      const decisao = await m.DecisaoIaModel.findOne({ chamadoId: chamado._id }).lean();
      expect(decisao?.motivo).toContain('empate');
    });

    it('a reatribuição também conta como receber chamado, e qualquer status entra na data', async () => {
      // Arrange: o `reassignedAt` mais novo faz de Bruno o que recebeu por último
      await ligar();
      const bruno = await criarTecnico('Bruno');
      const carla = await criarTecnico('Carla');
      await darCarga(bruno, 1, {
        assignedAt: new Date('2026-01-01T12:00:00Z'),
        reassignedAt: new Date('2026-04-01T12:00:00Z'),
      });
      await darCarga(carla, 1, { assignedAt: new Date('2026-02-01T12:00:00Z') });
      // Um chamado já concluído de Carla, mais recente que tudo, também conta na data
      // dela, mesmo fora da carga: ela recebeu depois de Bruno.
      await criarChamado({
        status: 'concluído',
        assignedToUserId: carla,
        assignedAt: new Date('2026-05-01T12:00:00Z'),
      });
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert: carga empatada em 1, e a última de Bruno (abril) é anterior à de Carla (maio)
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(bruno) });
    });

    it('quem nunca recebeu chamado vem primeiro no empate, mesmo com o id maior', async () => {
      // Arrange: os dois com carga 0. O de menor id já recebeu um chamado (concluído, então
      // fora da carga, mas com data); o de maior id nunca recebeu. Só a regra "nulo primeiro"
      // manda o de maior id à frente: pelo id, ganharia o outro.
      await ligar();
      const a = await criarTecnico('Carla');
      const b = await criarTecnico('Diego');
      const [menorId, maiorId] = String(a) < String(b) ? [a, b] : [b, a];
      await criarChamado({
        status: 'concluído',
        assignedToUserId: menorId,
        assignedAt: new Date('2020-01-01T12:00:00Z'),
      });
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(maiorId) });
    });

    it('sem diferença de carga nem de data, o menor id desempata por último', async () => {
      // Arrange: dois técnicos que nunca receberam nenhum chamado
      await ligar();
      const a = await criarTecnico('Carla');
      const b = await criarTecnico('Diego');
      const menorId = String(a) < String(b) ? a : b;
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(menorId) });
      const decisao = await m.DecisaoIaModel.findOne({ chamadoId: chamado._id }).lean();
      expect(decisao?.motivo).toContain('ordem do cadastro');
    });

    it('o próprio solicitante nunca é candidato, mesmo sendo técnico com a especialidade', async () => {
      // Arrange
      await ligar();
      await m.UserModel.updateOne(
        { _id: solicitanteId },
        { $set: { role: 'Técnico', specialties: [subtypeId], isActive: true } },
      );
      const outro = await criarTecnico('Bruno');
      await darCarga(outro, 3);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert: o solicitante teria carga 0, mas não entra
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(outro) });
    });

    it('um técnico com maxAssignedTickets 0 nunca recebe', async () => {
      // Arrange
      await ligar();
      const semLimite = await criarTecnico('Bruno');
      await m.UserModel.collection.updateOne(
        { _id: semLimite },
        { $set: { maxAssignedTickets: 0 } },
      );
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert: existe técnico com a especialidade, mas nenhum com vaga
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });
    });

    it('técnico inativo, de outra especialidade ou de outro papel nunca recebe', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Inativo', { isActive: false });
      await criarTecnico('Outra', { specialties: [outroSubtypeId] });
      await criarTecnico('Preposto', { role: 'Preposto' });
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_especialidade' });
    });

    it('a carga só conta validado e em atendimento: pausado e concluído não pesam', async () => {
      // Arrange: Bruno tem 5 chamados, mas todos pausados ou concluídos (limite 5)
      await ligar();
      const bruno = await criarTecnico('Bruno');
      await darCarga(bruno, 3, { status: 'aguardando_terceiros' });
      await darCarga(bruno, 2, { status: 'concluído' });
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(bruno) });
    });
  });

  // ── sem candidato · AC-3 ─────────────────────────────────────────

  describe('sem técnico elegível', () => {
    it('ninguém com a especialidade: sem_tecnico por sem_especialidade, chamado segue validado, sem avisos', async () => {
      // Arrange
      await ligar();
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_especialidade' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.assignedToUserId).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toMatchObject({
        resultado: 'sem_tecnico',
        motivo: 'sem_especialidade',
        tecnicoId: null,
      });
      expect(doc?.atribuicaoAutomatica.em).toBeInstanceOf(Date);
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(await m.ChamadoHistoryModel.countDocuments({})).toBe(0);
      expect(await m.DecisaoIaModel.countDocuments({})).toBe(0);
      expect(mockEmitToRoom).not.toHaveBeenCalled();
    });

    it('todos no limite: sem_tecnico por sem_vaga', async () => {
      // Arrange
      await ligar();
      const bruno = await criarTecnico('Bruno', { maxAssignedTickets: 2 });
      const carla = await criarTecnico('Carla', { maxAssignedTickets: 1 });
      await darCarga(bruno, 2);
      await darCarga(carla, 1);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });
      expect((await ler(chamado._id))?.atribuicaoAutomatica).toMatchObject({
        resultado: 'sem_tecnico',
        motivo: 'sem_vaga',
      });
      const linhas = linhasDeLog('[atribuicao]');
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        resultado: 'sem_tecnico',
        motivo: 'sem_vaga',
        candidatos: 0,
      });
    });
  });

  // ── interruptor · AC-5, AC-17 ────────────────────────────────────

  describe('interruptor', () => {
    it.each([
      ['a atribuição automática desligada', { atribuicao: false }],
      ['a autonomia da IA desligada', { autonomia: false }],
    ])('com %s, nada muda em relação à 0007 e não há linha de log', async (_nome, chaves) => {
      // Arrange
      await ligar(chaves);
      await criarTecnico('Bruno');
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.assignedToUserId).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toBeUndefined();
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(linhasDeLog('[atribuicao]')).toHaveLength(0);
    });

    it('sem nenhum documento de configuração (deploy recém feito), o passo nasce desligado', async () => {
      // Arrange
      await criarTecnico('Bruno');
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      expect((await ler(chamado._id))?.status).toBe('validado');
    });

    it('a chave é lida a cada execução: ligar depois vale para o chamado seguinte, sem afetar o anterior', async () => {
      // Arrange
      await criarTecnico('Bruno');
      await ligar({ atribuicao: false });
      const antes = await criarChamado();
      await m.tentarAtribuicaoAutomatica(paramsDe(antes));

      // Act
      await ligar();
      const depois = await criarChamado();
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(depois));

      // Assert
      expect(resultado.resultado).toBe('atribuido');
      expect((await ler(antes._id))?.status).toBe('validado');
    });
  });

  // ── falhas · AC-4, AC-17 ─────────────────────────────────────────

  describe('falhas nunca impedem a abertura', () => {
    it('falha ao ler a configuração: nao_tentada, nada gravado e nenhuma linha [atribuicao]', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado();
      vi.spyOn(m.IaAutonomiaConfigModel, 'findOneAndUpdate').mockImplementationOnce(() => {
        throw new Error('config fora do ar');
      });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.atribuicaoAutomatica).toBeUndefined();
      expect(linhasDeLog('[atribuicao]')).toHaveLength(0);
    });

    it('falha na agregação, depois de conhecer a chave: sem_tecnico por erro, chamado segue validado', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado();
      vi.spyOn(m.ChamadoModel, 'aggregate').mockImplementationOnce(() => {
        throw new Error('agregação caiu');
      });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'erro' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.assignedToUserId).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toMatchObject({ resultado: 'sem_tecnico', motivo: 'erro' });
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      const linhas = linhasDeLog('[atribuicao]');
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({ resultado: 'sem_tecnico', motivo: 'erro', erro: 'Error' });
    });

    it('falha depois de gravar a atribuição: o desfazer condicional único devolve o chamado à gestão', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado({ 'sla.responseDueAt': new Date(Date.now() - 3600_000) });
      falharNaRecontagem();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert: validado, sem técnico, sem resquício da atribuição, marcado como erro
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'erro' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.assignedToUserId).toBeUndefined();
      expect(doc?.assignedAt).toBeUndefined();
      expect(doc?.sla.responseStartedAt).toBeUndefined();
      expect(doc?.sla.responseBreachedAt).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toMatchObject({ resultado: 'sem_tecnico', motivo: 'erro' });
      // Nada externo saiu antes de a conferência passar
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(await m.ChamadoHistoryModel.countDocuments({})).toBe(0);
      expect(await m.DecisaoIaModel.countDocuments({})).toBe(0);
      expect(mockEmitToRoom).not.toHaveBeenCalled();
    });

    it('se o desfazer também falha, registra o estado órfão e ainda devolve o resultado sem lançar', async () => {
      // Arrange
      await ligar();
      const bruno = await criarTecnico('Bruno');
      const chamado = await criarChamado();
      const original = m.ChamadoModel.findOneAndUpdate.bind(m.ChamadoModel);
      let chamadas = 0;
      vi.spyOn(m.ChamadoModel, 'findOneAndUpdate').mockImplementation(((...args: unknown[]) => {
        chamadas += 1;
        // A 1ª é a atribuição, e a 2ª é o desfazer do erro.
        if (chamadas === 2) throw new Error('desfazer caiu');
        return (original as (...a: unknown[]) => unknown)(...args);
      }) as never);
      falharNaRecontagem();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'erro' });
      const orfaos = linhasDeLog('[atribuicao]').filter((l) => l.estado === 'orfao');
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ chamadoId: String(chamado._id), tecnicoId: String(bruno) });
      // O caso conhecido: fica atribuído, e a consulta do Follow-up o acha (sem histórico)
      const doc = await ler(chamado._id);
      expect(String(doc?.assignedToUserId)).toBe(String(bruno));
      expect(doc?.atribuicaoAutomatica.resultado).toBe('atribuido');
      expect(
        await m.ChamadoHistoryModel.countDocuments({
          chamadoId: chamado._id,
          action: 'atribuicao_tecnico',
          actorType: 'sistema',
        }),
      ).toBe(0);
    });

    it('a confirmação da gravação se perde mas a gravação valeu: o desfazer devolve o chamado à gestão, sem órfão silencioso', async () => {
      // Arrange: o servidor grava e o driver falha na volta (timeout), então o passo não sabe se gravou
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado();
      const original = m.ChamadoModel.findOneAndUpdate.bind(m.ChamadoModel) as (
        ...a: unknown[]
      ) => Promise<unknown>;
      let chamadas = 0;
      vi.spyOn(m.ChamadoModel, 'findOneAndUpdate').mockImplementation(((...args: unknown[]) => {
        chamadas += 1;
        if (chamadas !== 1) return original(...args);
        // A 1ª é a atribuição: aplica de verdade e depois falha
        return (async () => {
          await original(...args);
          throw new Error('confirmação perdida');
        })();
      }) as never);

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert: não sobra chamado atribuído sem histórico, decisão nem aviso
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'erro' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.assignedToUserId).toBeUndefined();
      expect(doc?.assignedAt).toBeUndefined();
      expect(doc?.sla.responseStartedAt).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toMatchObject({ resultado: 'sem_tecnico', motivo: 'erro' });
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(await m.ChamadoHistoryModel.countDocuments({})).toBe(0);
    });

    it('a gravação falha de verdade, sem nada gravado: sem_tecnico por erro, chamado segue validado', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado();
      let chamadas = 0;
      const original = m.ChamadoModel.findOneAndUpdate.bind(m.ChamadoModel) as (
        ...a: unknown[]
      ) => Promise<unknown>;
      vi.spyOn(m.ChamadoModel, 'findOneAndUpdate').mockImplementation(((...args: unknown[]) => {
        chamadas += 1;
        if (chamadas === 1) throw new Error('mongo fora do ar na gravação');
        return original(...args);
      }) as never);

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'erro' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.assignedToUserId).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toMatchObject({ resultado: 'sem_tecnico', motivo: 'erro' });
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
    });

    it('a falha de um efeito (histórico) não desfaz a atribuição nem impede a decisão e os avisos', async () => {
      // Arrange
      await ligar();
      const bruno = await criarTecnico('Bruno');
      const chamado = await criarChamado();
      vi.spyOn(m.ChamadoHistoryModel, 'create').mockRejectedValueOnce(new Error('histórico caiu'));

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(bruno) });
      expect((await ler(chamado._id))?.status).toBe('em atendimento');
      expect(await m.DecisaoIaModel.countDocuments({ campo: 'tecnico' })).toBe(1);
      expect(await m.NotificationModel.countDocuments({ type: 'ticket:assigned' })).toBe(1);
      expect(linhasDeLog('[atribuicao]').some((l) => l.efeito === 'historico')).toBe(true);
    });

    it('a falha do aviso (Notification) não desfaz a atribuição', async () => {
      // Arrange
      await ligar();
      const bruno = await criarTecnico('Bruno');
      const chamado = await criarChamado();
      vi.spyOn(m.NotificationModel, 'create').mockRejectedValueOnce(new Error('aviso caiu'));

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(bruno) });
      expect((await ler(chamado._id))?.status).toBe('em atendimento');
      expect(await m.ChamadoHistoryModel.countDocuments({ action: 'atribuicao_tecnico' })).toBe(1);
    });

    it('a decisão que já existe vira falha de efeito no log, sem desfazer a atribuição nem os avisos', async () => {
      // Arrange: a chave única (chamado + campo) faz a segunda gravação voltar `ja_existe`
      await ligar();
      const bruno = await criarTecnico('Bruno');
      const chamado = await criarChamado();
      await m.decisoes.registrarDecisao({
        chamadoId: String(chamado._id),
        campo: 'tecnico',
        decididoPor: 'regra',
        efeito: 'aplicado',
        valor: { tecnicoId: String(bruno) },
        confianca: null,
        motivo: 'Decisão gravada antes do passo.',
      });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(bruno) });
      expect((await ler(chamado._id))?.status).toBe('em atendimento');
      expect(linhasDeLog('[atribuicao]').filter((l) => l.efeito === 'decisao')).toEqual([
        { chamadoId: String(chamado._id), efeito: 'decisao', erro: 'ja_existe' },
      ]);
      expect(
        await m.DecisaoIaModel.countDocuments({ chamadoId: chamado._id, campo: 'tecnico' }),
      ).toBe(1);
      expect(await m.ChamadoHistoryModel.countDocuments({ action: 'atribuicao_tecnico' })).toBe(1);
      expect(await m.NotificationModel.countDocuments({ type: 'ticket:assigned' })).toBe(1);
    });

    it('um erro que não é Error vira "desconhecido" no log, e o chamado segue validado', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado();
      vi.spyOn(m.ChamadoModel, 'aggregate').mockRejectedValueOnce('caiu sem ser um Error' as never);

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'erro' });
      expect((await ler(chamado._id))?.status).toBe('validado');
      expect(linhasDeLog('[atribuicao]')[0]).toMatchObject({
        motivo: 'erro',
        erro: 'desconhecido',
      });
    });
  });

  // ── corrida com a gestão · AC-7 ──────────────────────────────────

  describe('corrida com a atribuição manual', () => {
    it('um gestor atribuiu primeiro: nao_tentada, nada sobrescrito, nada avisado', async () => {
      // Arrange
      await ligar();
      const automatico = await criarTecnico('Bruno');
      const dogestor = await criarTecnico('Carla');
      const chamado = await criarChamado({
        status: 'em atendimento',
        assignedToUserId: dogestor,
        assignedAt: new Date('2026-01-01T12:00:00Z'),
        assignedByUserId: adminId,
      });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      const doc = await ler(chamado._id);
      expect(String(doc?.assignedToUserId)).toBe(String(dogestor));
      expect(String(doc?.assignedByUserId)).toBe(String(adminId));
      expect(doc?.atribuicaoAutomatica).toBeUndefined();
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(await m.DecisaoIaModel.countDocuments({})).toBe(0);
      expect(String(automatico)).not.toBe(String(dogestor));
      // O passo sabia que a chave estava ligada: uma linha, com nao_tentada
      const linhas = linhasDeLog('[atribuicao]');
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({ resultado: 'nao_tentada' });
    });

    it('sem técnico com a especialidade, mas um gestor já tomou o chamado: nao_tentada, sem marcar nada', async () => {
      // Arrange: nenhum técnico elegível, e o chamado já está com o técnico de um gestor
      await ligar();
      const chamado = await criarChamado({
        status: 'em atendimento',
        assignedToUserId: new Types.ObjectId(),
        assignedAt: new Date('2026-01-01T12:00:00Z'),
        assignedByUserId: adminId,
      });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      expect((await ler(chamado._id))?.atribuicaoAutomatica).toBeUndefined();
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
    });

    it('falha inesperada e o chamado já é de um gestor: nao_tentada, sem marcar erro por cima', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado({
        status: 'em atendimento',
        assignedToUserId: new Types.ObjectId(),
        assignedAt: new Date('2026-01-01T12:00:00Z'),
        assignedByUserId: adminId,
      });
      vi.spyOn(m.ChamadoModel, 'aggregate').mockImplementationOnce(() => {
        throw new Error('agregação caiu');
      });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      expect((await ler(chamado._id))?.atribuicaoAutomatica).toBeUndefined();
      expect(linhasDeLog('[atribuicao]')[0]).toMatchObject({
        resultado: 'nao_tentada',
        erro: 'Error',
      });
    });

    it('chamado que já não está validado (classificado à mão, aberto) nunca é tocado', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const chamado = await criarChamado({ status: 'aberto' });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('aberto');
      expect(doc?.assignedToUserId).toBeUndefined();
    });

    it('um gestor toma o chamado entre gravar e recontar: nao_tentada, sem avisar o técnico errado', async () => {
      // Arrange: Bruno teria vaga (limite 1, carga 0), mas o chamado deixa de ser dele
      await ligar();
      await criarTecnico('Bruno', { maxAssignedTickets: 1 });
      const carla = await criarTecnico('Carla');
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(
        paramsDe(chamado, {
          aposGravar: async () => {
            await m.ChamadoModel.updateOne(
              { _id: chamado._id },
              { $set: { assignedToUserId: carla } },
            );
          },
        }),
      );

      // Assert: a recontagem não achou o chamado com o Bruno, então não há o que avisar
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      const doc = await ler(chamado._id);
      expect(String(doc?.assignedToUserId)).toBe(String(carla));
      // E o marcador "atribuído pela regra a Bruno" sai: ninguém o avisou, e a gestão leria uma mentira
      expect(doc?.atribuicaoAutomatica).toBeUndefined();
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(await m.DecisaoIaModel.countDocuments({})).toBe(0);
      expect(await m.ChamadoHistoryModel.countDocuments({ action: 'atribuicao_tecnico' })).toBe(0);
    });

    it('a carga estoura e o chamado mudou sob nós: o desfazer não acha o documento, nao_tentada', async () => {
      // Arrange
      await ligar();
      const bruno = await criarTecnico('Bruno', { maxAssignedTickets: 1 });
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(
        paramsDe(chamado, {
          aposGravar: async () => {
            // Ramo defensivo: o módulo não produz este estado sozinho. Outro chamado
            // chega ao Bruno, que passa do limite, e o marcador do nosso chamado muda
            // por outra mão: o filtro do desfazer deixa de casar, e nada é sobrescrito.
            await m.ChamadoModel.updateOne(
              { _id: chamado._id },
              { $set: { 'atribuicaoAutomatica.resultado': 'sem_tecnico' } },
            );
            await darCarga(bruno, 1);
          },
        }),
      );

      // Assert: nada é sobrescrito
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      const doc = await ler(chamado._id);
      expect(String(doc?.assignedToUserId)).toBe(String(bruno));
      expect(doc?.status).toBe('em atendimento');
      expect(doc?.atribuicaoAutomatica.resultado).toBe('sem_tecnico');
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
    });
  });

  // ── conferência de carga · AC-8 ──────────────────────────────────

  describe('conferência de carga depois de gravar', () => {
    it('duas gravações para o técnico com carga limite menos 1: a segunda reprova, desfaz tudo e termina em sem_vaga', async () => {
      // Arrange
      await ligar();
      const bruno = await criarTecnico('Bruno', { maxAssignedTickets: 2 });
      await darCarga(bruno, 1);
      const chamado = await criarChamado({ 'sla.responseDueAt': new Date(Date.now() - 3600_000) });

      // Act: outro chamado chega ao Bruno entre a nossa gravação e a recontagem
      const resultado = await m.tentarAtribuicaoAutomatica(
        paramsDe(chamado, { aposGravar: async () => void (await darCarga(bruno, 1)) }),
      );

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('validado');
      expect(doc?.assignedToUserId).toBeUndefined();
      expect(doc?.assignedAt).toBeUndefined();
      expect(doc?.sla.responseStartedAt).toBeUndefined();
      expect(doc?.sla.responseBreachedAt).toBeUndefined();
      expect(doc?.atribuicaoAutomatica).toMatchObject({
        resultado: 'sem_tecnico',
        motivo: 'sem_vaga',
        tecnicoId: null,
      });
      // Nenhum aviso saiu de uma atribuição desfeita
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(await m.ChamadoHistoryModel.countDocuments({ chamadoId: chamado._id })).toBe(0);
      expect(await m.DecisaoIaModel.countDocuments({})).toBe(0);
      expect(mockEmitToRoom).not.toHaveBeenCalled();
      expect(linhasDeLog('[atribuicao]')[0]).toMatchObject({
        resultado: 'sem_tecnico',
        candidatos: 1,
      });
    });

    it('depois de desfazer, tenta o próximo candidato e só avisa o que valeu', async () => {
      // Arrange: Bruno é o primeiro (carga 1) e estoura; Carla (carga 2, limite 5) é o próximo
      await ligar();
      const bruno = await criarTecnico('Bruno', { maxAssignedTickets: 2 });
      const carla = await criarTecnico('Carla');
      await darCarga(bruno, 1);
      await darCarga(carla, 2);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(
        paramsDe(chamado, {
          aposGravar: async ({ tentativa }: { tentativa: number }) => {
            if (tentativa === 1) await darCarga(bruno, 1);
          },
        }),
      );

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(carla) });
      const doc = await ler(chamado._id);
      expect(String(doc?.assignedToUserId)).toBe(String(carla));
      expect(String(doc?.atribuicaoAutomatica.tecnicoId)).toBe(String(carla));
      const notificacoes = await m.NotificationModel.find({}).lean();
      expect(notificacoes.map((n) => String(n.userId))).toEqual([String(carla)]);
      expect(await m.ChamadoHistoryModel.countDocuments({ action: 'atribuicao_tecnico' })).toBe(1);
      const decisao = await m.DecisaoIaModel.find({ chamadoId: chamado._id }).lean();
      expect(decisao).toHaveLength(1);
      expect(String(decisao[0].valorIa.tecnicoId)).toBe(String(carla));
      expect(linhasDeLog('[atribuicao]')[0]).toMatchObject({ candidatos: 2 });
    });

    it('nunca tenta mais de 3 candidatos por chamado', async () => {
      // Arrange: quatro técnicos de limite 2 já com 1 chamado, e cada gravação é seguida de
      // outra que estoura o limite
      await ligar();
      const tecnicos = [
        await criarTecnico('A', { maxAssignedTickets: 2 }),
        await criarTecnico('B', { maxAssignedTickets: 2 }),
        await criarTecnico('C', { maxAssignedTickets: 2 }),
        await criarTecnico('D', { maxAssignedTickets: 2 }),
      ];
      for (const t of tecnicos) await darCarga(t, 1);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(
        paramsDe(chamado, {
          aposGravar: async ({ candidatoId }: { candidatoId: string }) => {
            await darCarga(new Types.ObjectId(candidatoId), 1);
          },
        }),
      );

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });
      expect(linhasDeLog('[atribuicao]')[0]).toMatchObject({ candidatos: 3 });
      expect((await ler(chamado._id))?.status).toBe('validado');
    });

    it('a seleção continua exigindo carga menor que o limite: quem já está no limite não é tentado', async () => {
      // Arrange
      await ligar();
      const cheio = await criarTecnico('Bruno', { maxAssignedTickets: 1 });
      await darCarga(cheio, 1);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });
      expect(linhasDeLog('[atribuicao]')[0]).toMatchObject({ candidatos: 0 });
    });
  });

  // ── vários passos ao mesmo tempo · AC-8 ─────────────────────────

  describe('vários passos automáticos ao mesmo tempo contra o mesmo técnico', () => {
    it('a carga final nunca passa do limite, e cada atribuição confirmada tem histórico, decisão e aviso', async () => {
      // O Mongo de produção é standalone, sem transação: o protocolo é gravar, reconferir a
      // carga e desfazer. O gancho `aposGravar` prova a recontagem de forma determinística; aqui
      // o protocolo roda de verdade, com passos concorrentes, e vale para qualquer intercalação.
      await ligar();
      const LIMITE = 3;
      const bruno = await criarTecnico('Bruno', { maxAssignedTickets: LIMITE });

      for (let rodada = 0; rodada < 10; rodada += 1) {
        // Arrange: cada rodada parte do mesmo estado, 1 chamado ativo e 6 esperando o passo
        await Promise.all([
          m.ChamadoModel.deleteMany({}),
          m.ChamadoHistoryModel.deleteMany({}),
          m.DecisaoIaModel.deleteMany({}),
          m.NotificationModel.deleteMany({}),
        ]);
        await darCarga(bruno, 1);
        const chamados = [];
        for (let i = 0; i < 6; i += 1) chamados.push(await criarChamado());

        // Act
        const resultados = await Promise.all(
          chamados.map((c) => m.tentarAtribuicaoAutomatica(paramsDe(c))),
        );

        // Assert: nunca passa do limite, e não sobra chamado com o técnico sem ter sido confirmado
        const confirmados = new Set(
          chamados
            .filter((_, i) => resultados[i].resultado === 'atribuido')
            .map((c) => String(c._id)),
        );
        const cargaFinal = await m.ChamadoModel.countDocuments({
          assignedToUserId: bruno,
          status: { $in: ['validado', 'em atendimento'] },
        });
        expect(cargaFinal).toBeLessThanOrEqual(LIMITE);
        expect(cargaFinal).toBe(1 + confirmados.size);

        for (const c of chamados) {
          const id = String(c._id);
          const efeitos = {
            historico: await m.ChamadoHistoryModel.countDocuments({
              chamadoId: c._id,
              action: 'atribuicao_tecnico',
            }),
            decisao: await m.DecisaoIaModel.countDocuments({ chamadoId: c._id, campo: 'tecnico' }),
            aviso: await m.NotificationModel.countDocuments({
              type: 'ticket:assigned',
              'data.ticketId': id,
            }),
          };
          const doc = await ler(c._id);
          if (confirmados.has(id)) {
            // Confirmado: com o Bruno, e com tudo o que a confirmação promete
            expect(String(doc?.assignedToUserId)).toBe(String(bruno));
            expect(efeitos).toEqual({ historico: 1, decisao: 1, aviso: 1 });
          } else {
            // Perdeu a vaga: de volta à gestão, sem nada gravado nem avisado
            expect(doc?.status).toBe('validado');
            expect(doc?.assignedToUserId).toBeUndefined();
            expect(efeitos).toEqual({ historico: 0, decisao: 0, aviso: 0 });
          }
        }
      }
    });
  });

  // ── documentos antigos ou incompletos · AC-2, AC-10, AC-14 ──────

  describe('documentos antigos ou incompletos no banco', () => {
    /** Escrita direta: o padrão do schema (`maxAssignedTickets: 5`) não preenche o que falta. */
    async function inserirTecnicoCru(campos: Record<string, unknown> = {}) {
      const _id = new Types.ObjectId();
      await m.UserModel.collection.insertOne({
        _id,
        username: `cru${(sequencia += 1)}`,
        role: 'Técnico',
        isActive: true,
        specialties: [subtypeId],
        ...campos,
      } as never);
      return _id;
    }

    it('técnico sem maxAssignedTickets usa o limite padrão 5: com 5 chamados ativos não recebe', async () => {
      // Arrange
      await ligar();
      const antigo = await inserirTecnicoCru({ name: 'Bruno' });
      await darCarga(antigo, 5);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toEqual({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });
    });

    it('técnico sem maxAssignedTickets usa o limite padrão 5: com 4 chamados ativos ainda recebe', async () => {
      // Arrange
      await ligar();
      const antigo = await inserirTecnicoCru({ name: 'Bruno' });
      await darCarga(antigo, 4);
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(antigo) });
    });

    it('técnico sem nome: o histórico diz "um técnico", nunca fica em branco', async () => {
      // Arrange
      await ligar();
      const semNome = await inserirTecnicoCru();
      const chamado = await criarChamado();

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(semNome) });
      const historico = await m.ChamadoHistoryModel.findOne({
        chamadoId: chamado._id,
        action: 'atribuicao_tecnico',
      }).lean();
      expect(historico?.observacoes).toBe('Atribuído automaticamente a um técnico');
    });

    it('chamado sem SLA gravado: atribui e não marca vencimento da resposta', async () => {
      // Arrange
      await ligar();
      const bruno = await criarTecnico('Bruno');
      const chamado = await criarChamado({ sla: undefined });

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(chamado));

      // Assert
      expect(resultado).toMatchObject({ resultado: 'atribuido', tecnicoId: String(bruno) });
      const doc = await ler(chamado._id);
      expect(doc?.status).toBe('em atendimento');
      expect(doc?.sla?.responseStartedAt).toBeInstanceOf(Date);
      expect(doc?.sla?.responseBreachedAt).toBeUndefined();
    });

    it('chamado que não existe mais na hora de gravar: nao_tentada, sem nada gravado nem avisado', async () => {
      // Arrange
      await ligar();
      await criarTecnico('Bruno');
      const fantasma = {
        _id: new Types.ObjectId(),
        ticket_number: 'CHM-2026-99999',
        titulo: 'Chamado apagado',
      };

      // Act
      const resultado = await m.tentarAtribuicaoAutomatica(paramsDe(fantasma));

      // Assert
      expect(resultado).toEqual({ resultado: 'nao_tentada' });
      expect(await m.ChamadoHistoryModel.countDocuments({})).toBe(0);
      expect(await m.DecisaoIaModel.countDocuments({})).toBe(0);
      expect(await m.NotificationModel.countDocuments({})).toBe(0);
      expect(mockEmitToRoom).not.toHaveBeenCalled();
    });
  });

  // ── consulta de órfãos do cabeçalho do módulo · AC-4 ────────────

  describe('consulta de chamados órfãos (cabeçalho do módulo)', () => {
    /**
     * A consulta vive num comentário e ninguém a rodava: `'$id'` no lugar de
     * `'$$id'` fazia todo chamado atribuído parecer órfão. Aqui ela é lida do
     * próprio arquivo e executada contra o Mongo, para o comentário não voltar a
     * divergir do que funciona.
     */
    function consultaDeOrfaos(): unknown[] {
      const fonte = readFileSync(path.resolve(__dirname, '../atribuicao-automatica.ts'), 'utf8');
      const linhas = fonte.split('\n');
      const inicio = linhas.findIndex((l) => l.includes('db.chamados.aggregate(['));
      const fim = linhas.findIndex((l, i) => i > inicio && /^ \*\s+\]\)\s*$/.test(l));
      expect(inicio, 'a consulta sumiu do cabeçalho do módulo').toBeGreaterThan(-1);
      expect(fim, 'o fim da consulta sumiu do cabeçalho do módulo').toBeGreaterThan(inicio);
      const corpo = linhas
        .slice(inicio, fim + 1)
        .map((l) => l.replace(/^ \* ?/, ''))
        .join('\n');
      // "db.chamados.aggregate([ ... ])": o pipeline é o array entre os parênteses
      const pipeline = corpo.slice(corpo.indexOf('(') + 1, corpo.lastIndexOf(')'));
      return new Function(`return ${pipeline};`)() as unknown[];
    }

    it('acha só o atribuído sem a entrada de histórico do sistema, e não o que a tem', async () => {
      // Arrange: um chamado atribuído de verdade pelo passo (com histórico) e um órfão
      await ligar();
      const bruno = await criarTecnico('Bruno');
      const comHistorico = await criarChamado();
      const atribuicao = await m.tentarAtribuicaoAutomatica(paramsDe(comHistorico));
      expect(atribuicao).toMatchObject({ resultado: 'atribuido', tecnicoId: String(bruno) });
      const orfao = await criarChamado({
        status: 'em atendimento',
        assignedToUserId: bruno,
        assignedAt: new Date(),
        atribuicaoAutomatica: {
          resultado: 'atribuido',
          motivo: null,
          tecnicoId: bruno,
          em: new Date(),
        },
      });

      // Act
      const achados = await m.ChamadoModel.aggregate(consultaDeOrfaos() as never);

      // Assert
      expect(achados.map((c) => String(c._id))).toEqual([String(orfao._id)]);
    });
  });
});
