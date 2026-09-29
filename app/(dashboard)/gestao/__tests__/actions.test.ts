import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequireManager = vi.fn();
const mockRequireSession = vi.fn();
const mockCanManage = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireManager: () => mockRequireManager(),
  requireSession: () => mockRequireSession(),
  canManage: (role: string) => mockCanManage(role),
  isAdmin: (role?: string) => role === 'Admin',
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a) }));
// O gancho das decisões da IA tem os testes dele em `lib/conversas/__tests__`,
// contra o Mongo de verdade. Aqui ele só não pode atrapalhar a ação de negócio.
const mockResolverDecisao = vi.fn();
const mockAplicarVeredito = vi.fn().mockResolvedValue(undefined);
const mockCamposPendentesDeConfirmacao = vi.fn();
const mockConfirmarDecisao = vi.fn();
vi.mock('@/lib/conversas/decisoes', () => ({
  aplicarVeredito: (...args: unknown[]) => mockAplicarVeredito(...args),
  resolverDecisao: (...args: unknown[]) => mockResolverDecisao(...args),
  camposPendentesDeConfirmacao: (...args: unknown[]) => mockCamposPendentesDeConfirmacao(...args),
  confirmarDecisao: (...args: unknown[]) => mockConfirmarDecisao(...args),
}));

vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: vi.fn().mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  }),
}));

vi.mock('@/lib/holidays', () => ({
  getActiveHolidaysForRange: vi.fn().mockResolvedValue(new Set()),
}));

// `montarSnapshotSla` fica real (as próprias regras já são testadas em
// lib/__tests__/sla-snapshot.test.ts, via SlaConfigModel mockado acima).
// `montarSnapshotCorrecao` é mockado aqui: a regra assimétrica em si tem a
// suíte dela; este arquivo testa só o que `updateTicketPriorityAction` faz
// com o resultado (janela, papel, filtro atômico, ordem e falha dos passos).
const mockMontarSnapshotCorrecao = vi.fn();
vi.mock('@/lib/sla-snapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sla-snapshot')>();
  return {
    ...actual,
    montarSnapshotCorrecao: (...args: unknown[]) => mockMontarSnapshotCorrecao(...args),
  };
});

const mockChamadoFindById = vi.fn();
const mockChamadoUpdateOne = vi.fn();
const mockChamadoFindOneAndUpdate = vi.fn();
const mockChamadoCountDocuments = vi.fn();
const mockChamadoAggregate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    updateOne: (...args: unknown[]) => mockChamadoUpdateOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockChamadoFindOneAndUpdate(...args),
    countDocuments: (...args: unknown[]) => mockChamadoCountDocuments(...args),
    aggregate: (...args: unknown[]) => mockChamadoAggregate(...args),
  },
}));

const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));

const mockNotificationCreate = vi.fn();
vi.mock('@/models/Notification', () => ({
  NotificationModel: { create: (...args: unknown[]) => mockNotificationCreate(...args) },
}));

const mockSlaFindOne = vi.fn();
vi.mock('@/models/SlaConfig', () => ({
  SlaConfigModel: { findOne: (...args: unknown[]) => mockSlaFindOne(...args) },
}));

const mockSlaEscalationDeleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
vi.mock('@/models/SlaEscalation', () => ({
  SlaEscalationModel: {
    deleteMany: (...args: unknown[]) => mockSlaEscalationDeleteMany(...args),
  },
}));

const mockUserFind = vi.fn();
const mockUserFindById = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

const mockServiceCatalogFindById = vi.fn();
vi.mock('@/models/ServiceCatalog', () => ({
  ServiceCatalogModel: {
    findById: (...args: unknown[]) => mockServiceCatalogFindById(...args),
  },
}));

const mockServiceTypeFindById = vi.fn();
vi.mock('@/models/ServiceType', () => ({
  ServiceTypeModel: {
    findById: (...args: unknown[]) => mockServiceTypeFindById(...args),
  },
}));

import {
  assignTicketAction,
  classificarChamadoAction,
  closeTicketAction,
  confirmarDecisoesIaAction,
  corrigirServicoAction,
  reassignTicketAction,
  updateTicketPriorityAction,
} from '@/app/(dashboard)/gestao/actions';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_ID = new Types.ObjectId().toHexString();
const VALID_TECH_ID = new Types.ObjectId().toHexString();
const SESSION = { userId: new Types.ObjectId().toHexString(), role: 'Admin', username: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireManager.mockResolvedValue(SESSION);
  mockRequireSession.mockResolvedValue(SESSION);
  mockCanManage.mockReturnValue(true);
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockResolverDecisao.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });
  mockMontarSnapshotCorrecao.mockResolvedValue({
    ok: true,
    sla: { priority: 'ALTA', resolutionDueAt: new Date(), responseDueAt: new Date() },
    escalacoesApagar: [],
  });
});

// ── classificarChamadoAction ─────────────────────────────────────

describe('classificarChamadoAction', () => {
  const validInput = {
    chamadoId: VALID_ID,
    naturezaAtendimento: 'Padrão' as const,
    finalPriority: 'NORMAL' as const,
    classificationNotes: '',
    subtypeId: new Types.ObjectId().toHexString(),
    catalogServiceId: new Types.ObjectId().toHexString(),
  };

  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await classificarChamadoAction({
      chamadoId: 'invalid',
      naturezaAtendimento: 'Padrão' as const,
      finalPriority: 'NORMAL' as const,
      classificationNotes: '',
      subtypeId: validInput.subtypeId,
      catalogServiceId: validInput.catalogServiceId,
    });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('retorna erro se chamado não encontrado', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await classificarChamadoAction(validInput);
    expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it('retorna erro se chamado não está aberto', async () => {
    mockChamadoFindById.mockResolvedValue({ _id: VALID_ID, status: 'validado' });
    const result = await classificarChamadoAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('aberto');
  });

  it('retorna erro se não há SLA config ativa', async () => {
    mockChamadoFindById.mockResolvedValue({ _id: VALID_ID, status: 'aberto' });
    mockSlaFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const result = await classificarChamadoAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('SLA');
  });

  it('classifica com sucesso e cria histórico', async () => {
    mockChamadoFindById.mockResolvedValue({
      _id: VALID_ID,
      status: 'aberto',
      solicitanteId: new Types.ObjectId(),
    });
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          responseTargetMinutes: 120,
          resolutionTargetMinutes: 480,
          businessHoursOnly: true,
          version: 'v1',
        }),
    });
    mockChamadoUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
    });

    const result = await classificarChamadoAction(validInput);
    expect(result).toEqual({ ok: true });
    expect(mockChamadoUpdateOne).toHaveBeenCalledOnce();
    expect(mockHistoryCreate).toHaveBeenCalledOnce();

    // Verifica que o update inclui dados de SLA
    const updateCall = mockChamadoUpdateOne.mock.calls[0];
    const setFields = updateCall[1].$set;
    expect(setFields.status).toBe('validado');
    expect(setFields.finalPriority).toBe('NORMAL');
    expect(setFields['sla.responseDueAt']).toBeInstanceOf(Date);
    expect(setFields['sla.resolutionDueAt']).toBeInstanceOf(Date);
    expect(setFields['sla.configVersion']).toBe('v1');
  });

  it('emite ticket:classified para a sala do solicitante (spec 0005, AC-1)', async () => {
    const solicitanteId = new Types.ObjectId();
    mockChamadoFindById.mockResolvedValue({
      _id: VALID_ID,
      status: 'aberto',
      solicitanteId,
      ticket_number: 'CHM-2026-00001',
      titulo: 'Lâmpada queimada',
    });
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          responseTargetMinutes: 120,
          resolutionTargetMinutes: 480,
          businessHoursOnly: true,
          version: 'v1',
        }),
    });
    mockChamadoUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Preposto E2E' }) }),
    });

    const result = await classificarChamadoAction(validInput);
    expect(result).toEqual({ ok: true });

    const chamado = mockEmitToRoom.mock.calls.find((c) => c[1] === 'ticket:classified');
    expect(chamado).toBeDefined();
    expect(chamado?.[0]).toBe(`user:${String(solicitanteId)}`);
    expect(chamado?.[2]).toMatchObject({
      ticketId: VALID_ID,
      ticketNumber: 'CHM-2026-00001',
      finalPriority: 'NORMAL',
    });
  });

  it('define subtypeId e catalogServiceId na classificação', async () => {
    mockChamadoFindById.mockResolvedValue({
      _id: VALID_ID,
      status: 'aberto',
      solicitanteId: new Types.ObjectId(),
    });
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          responseTargetMinutes: 120,
          resolutionTargetMinutes: 480,
          businessHoursOnly: true,
          version: 'v1',
        }),
    });
    mockChamadoUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
    });

    const result = await classificarChamadoAction(validInput);
    expect(result).toEqual({ ok: true });

    const setFields = mockChamadoUpdateOne.mock.calls[0][1].$set;
    expect(setFields.catalogServiceId.toHexString()).toBe(validInput.catalogServiceId);
    expect(setFields.subtypeId.toHexString()).toBe(validInput.subtypeId);
  });
});

// ── updateTicketPriorityAction · spec 0007, AC-11, AC-12 ─────────

describe('updateTicketPriorityAction', () => {
  const CLASSIFIED_AT = new Date('2026-01-01T12:00:00Z');
  const MOTIVO = 'Motivo com mais de dez caracteres.';
  const validInput = { chamadoId: VALID_ID, finalPriority: 'ALTA' as const, motivo: MOTIVO };

  function chamadoBase(overrides: Record<string, unknown> = {}) {
    return {
      _id: VALID_ID,
      status: 'validado',
      classifiedAt: CLASSIFIED_AT,
      finalPriority: 'NORMAL',
      assignedToUserId: null,
      sla: { resolutionDueAt: new Date('2026-01-01T20:00:00Z') },
      ...overrides,
    };
  }

  function docAtualizado(overrides: Record<string, unknown> = {}) {
    return {
      _id: VALID_ID,
      ticket_number: 'CHM-2026-00001',
      titulo: 'Ar-condicionado',
      solicitanteId: new Types.ObjectId(),
      ...overrides,
    };
  }

  function ultimoLogRevisaoIa(spy: ReturnType<typeof vi.spyOn>) {
    const chamada = spy.mock.calls.find((c: unknown[]) => c[0] === '[revisao-ia]');
    return chamada ? JSON.parse(chamada[1] as string) : undefined;
  }

  it('retorna erro com dados inválidos (Zod): motivo ausente', async () => {
    const result = await updateTicketPriorityAction({
      chamadoId: VALID_ID,
      finalPriority: 'ALTA' as const,
      // motivo ausente
    } as never);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(mockChamadoFindById).not.toHaveBeenCalled();
  });

  it('retorna erro se o chamado não existe', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await updateTicketPriorityAction(validInput);
    expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it.each(['aberto', 'aguardando_solicitante', 'aguardando_terceiros', 'encerrado'])(
    'recusa fora da janela: status %s (pausados inclusive)',
    async (status) => {
      mockChamadoFindById.mockResolvedValue(chamadoBase({ status }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const result = await updateTicketPriorityAction(validInput);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(status === 'aberto' ? 'Validado' : status);
      expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
      expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('recusada');
      warn.mockRestore();
    },
  );

  it('aceita a janela em atendimento (spec 0009, alarga a janela da 0007)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase({ status: 'em atendimento' }));
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    const result = await updateTicketPriorityAction(validInput);
    expect(result).toEqual({ ok: true });
  });

  it('retorna erro se o chamado nunca foi classificado (sem classifiedAt)', async () => {
    mockChamadoFindById.mockResolvedValue({ _id: VALID_ID, status: 'validado' });
    const result = await updateTicketPriorityAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('classificado');
  });

  it('recusa trocar para a mesma prioridade já vigente', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase({ finalPriority: 'ALTA' }));

    const result = await updateTicketPriorityAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('já é a atual');
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('Preposto não pode baixar a prioridade de um chamado com técnico atribuído (AC-10)', async () => {
    mockRequireManager.mockResolvedValue({ ...SESSION, role: 'Preposto' });
    mockChamadoFindById.mockResolvedValue(
      chamadoBase({ finalPriority: 'EMERGENCIAL', assignedToUserId: new Types.ObjectId() }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // EMERGENCIAL → ALTA é uma descida.
    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({
      ok: false,
      error: 'Só o Admin pode baixar a prioridade de um chamado que já tem técnico atribuído.',
    });
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
    expect(ultimoLogRevisaoIa(warn)).toMatchObject({ resultado: 'recusada', direcao: 'desce' });
    warn.mockRestore();
  });

  it('Admin pode baixar a prioridade de um chamado com técnico atribuído', async () => {
    mockRequireManager.mockResolvedValue({ ...SESSION, role: 'Admin' });
    mockChamadoFindById.mockResolvedValue(
      chamadoBase({ finalPriority: 'EMERGENCIAL', assignedToUserId: new Types.ObjectId() }),
    );
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: true });
    expect(mockMontarSnapshotCorrecao).toHaveBeenCalledWith(
      expect.objectContaining({ direcao: 'desce', comTecnico: true }),
    );
  });

  it('Preposto pode baixar a prioridade sem técnico atribuído', async () => {
    mockRequireManager.mockResolvedValue({ ...SESSION, role: 'Preposto' });
    mockChamadoFindById.mockResolvedValue(
      chamadoBase({ finalPriority: 'EMERGENCIAL', assignedToUserId: null }),
    );
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    const result = await updateTicketPriorityAction(validInput);
    expect(result).toEqual({ ok: true });
  });

  it('sem SlaConfig ativa (montarSnapshotCorrecao falha): retorna erro sem gravar nada', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockMontarSnapshotCorrecao.mockResolvedValue({ ok: false, motivo: 'Sem SLA ativa.' });

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: false, error: 'Sem SLA ativa.' });
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('gravação atômica: o filtro repete status, prioridade, técnico e o prazo lidos', async () => {
    const resolutionDueAtAtual = new Date('2026-01-01T20:00:00Z');
    mockChamadoFindById.mockResolvedValue(
      chamadoBase({ sla: { resolutionDueAt: resolutionDueAtAtual } }),
    );
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    const [filtro, update, options] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(filtro).toEqual({
      _id: VALID_ID,
      status: { $in: ['validado', 'em atendimento'] },
      finalPriority: 'NORMAL',
      assignedToUserId: null,
      'sla.resolutionDueAt': resolutionDueAtAtual,
    });
    expect(options).toEqual({ returnDocument: 'after' });
    expect(update.$set.finalPriority).toBe('ALTA');
  });

  it('aplica só os campos que montarSnapshotCorrecao devolveu (alvos ausentes não são tocados)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    const resolutionDueAt = new Date('2026-01-01T22:00:00Z');
    const responseDueAt = new Date('2026-01-01T13:00:00Z');
    mockMontarSnapshotCorrecao.mockResolvedValue({
      ok: true,
      sla: { priority: 'ALTA', resolutionDueAt, responseDueAt },
      escalacoesApagar: [],
    });
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    const [, update] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(update.$set).toEqual({
      finalPriority: 'ALTA',
      'sla.priority': 'ALTA',
      'sla.resolutionDueAt': resolutionDueAt,
      'sla.responseDueAt': responseDueAt,
    });
  });

  it('aplica os campos de breach e alvos quando montarSnapshotCorrecao os devolve', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockMontarSnapshotCorrecao.mockResolvedValue({
      ok: true,
      sla: {
        priority: 'ALTA',
        resolutionDueAt: new Date('2026-01-02T00:00:00Z'),
        responseDueAt: new Date('2026-01-01T14:00:00Z'),
        resolutionBreachedAt: null,
        responseBreachedAt: null,
        resolutionTargetMinutes: 1440,
        responseTargetMinutes: 120,
        businessHoursOnly: false,
        configVersion: 'v1',
      },
      escalacoesApagar: ['warning_80', 'breach_resolution', 'breach_response'],
    });
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    const [, update] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({
      'sla.resolutionBreachedAt': null,
      'sla.responseBreachedAt': null,
      'sla.resolutionTargetMinutes': 1440,
      'sla.responseTargetMinutes': 120,
      'sla.businessHoursOnly': false,
      'sla.configVersion': 'v1',
    });
    expect(mockSlaEscalationDeleteMany).toHaveBeenCalledWith({
      chamadoId: VALID_ID,
      type: { $in: ['warning_80', 'breach_resolution', 'breach_response'] },
    });
  });

  it('não limpa SlaEscalation quando escalacoesApagar vem vazio', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    expect(mockSlaEscalationDeleteMany).not.toHaveBeenCalled();
  });

  it('grava a entrada correcao_gestao com o motivo e a entrada neutra sem motivo (AC-13)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: VALID_ID,
        action: 'correcao_gestao',
        observacoes: expect.stringContaining(MOTIVO),
      }),
    );
    const entradaNeutra = mockHistoryCreate.mock.calls.find(
      ([arg]) => arg.action === 'classificacao',
    );
    expect(entradaNeutra?.[0].observacoes).not.toContain(MOTIVO);
    expect(entradaNeutra?.[0].observacoes).toContain('Alta');
  });

  it('chama resolverDecisao com o motivo, origem gestao (AC-12)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    expect(mockResolverDecisao).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: VALID_ID,
        campo: 'prioridade',
        valor: { prioridade: 'ALTA' },
        origem: 'gestao',
        motivo: MOTIVO,
      }),
    );
  });

  it('emite ticket:classified ao solicitante e grava o log de sucesso', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    const solicitanteId = new Types.ObjectId();
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado({ solicitanteId }));
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Preposto' }) }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await updateTicketPriorityAction(validInput);

    const chamada = mockEmitToRoom.mock.calls.find((c) => c[1] === 'ticket:classified');
    expect(chamada?.[0]).toBe(`user:${String(solicitanteId)}`);
    expect(chamada?.[2]).toMatchObject({ finalPriority: 'ALTA' });
    expect(ultimoLogRevisaoIa(warn)).toMatchObject({
      operacao: 'corrigir_prioridade',
      campo: 'prioridade',
      direcao: 'sobe',
      resultado: 'ok',
    });
    warn.mockRestore();
  });

  // ── AC-14: aviso ao técnico (ticket:corrected) ──────────────────

  it('com técnico atribuído, avisa por ticket:corrected, sem motivo', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    const tecnicoId = new Types.ObjectId().toHexString();
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado({ assignedToUserId: tecnicoId }));
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Preposto' }) }),
    });

    await updateTicketPriorityAction(validInput);

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: tecnicoId, type: 'ticket:corrected' }),
    );
    const chamada = mockEmitToRoom.mock.calls.find((c) => c[1] === 'ticket:corrected');
    expect(chamada?.[0]).toBe(`user:${tecnicoId}`);
    expect(chamada?.[2]).toMatchObject({ campo: 'prioridade', finalPriority: 'ALTA' });
    expect(JSON.stringify(chamada)).not.toContain(MOTIVO);
  });

  it('sem técnico atribuído, não tenta avisar ninguém', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado({ assignedToUserId: null }));
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Preposto' }) }),
    });

    await updateTicketPriorityAction(validInput);

    const chamada = mockEmitToRoom.mock.calls.find((c) => c[1] === 'ticket:corrected');
    expect(chamada).toBeUndefined();
  });

  it('falha no aviso ao técnico não desfaz a correção, loga parcial:aviso (AC-21)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    const tecnicoId = new Types.ObjectId().toHexString();
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado({ assignedToUserId: tecnicoId }));
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Preposto' }) }),
    });
    mockEmitToRoom.mockRejectedValueOnce(new Error('socket caiu'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: true });
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:aviso');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('corrida: findOneAndUpdate não casa, recusa e pede para tentar de novo', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('tente de novo');
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockResolverDecisao).not.toHaveBeenCalled();
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('recusada');
    warn.mockRestore();
  });

  it('erro inesperado do banco: devolve a frase fixa, nunca a mensagem interna', async () => {
    mockChamadoFindById.mockRejectedValue(new Error('MongoServerError: connection pool closed'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: false, error: 'Erro ao corrigir prioridade. Tente novamente.' });
    erro.mockRestore();
  });

  // ── AC-21: ordem e isolamento de falhas — passo 1 decide, os demais nunca desfazem ──

  it('falha ao gravar correcao_gestao: a correção continua valendo, log parcial:correcao_gestao', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockHistoryCreate.mockRejectedValueOnce(new Error('falhou correcao_gestao'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: true });
    // A entrada neutra (passo seguinte) ainda é tentada.
    expect(mockHistoryCreate).toHaveBeenCalledTimes(2);
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:correcao_gestao');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('falha ao gravar a entrada neutra: a correção continua valendo, log parcial:entrada_neutra', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockHistoryCreate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('falhou entrada neutra'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: true });
    expect(mockResolverDecisao).toHaveBeenCalled();
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:entrada_neutra');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('resolverDecisao falha (não nao_encontrada): a correção continua valendo, log parcial:decisao', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockResolverDecisao.mockResolvedValue({ ok: false, reason: 'erro' });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: true });
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:decisao');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('resolverDecisao com nao_encontrada não conta como falha (chamado sem decisão)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockResolverDecisao.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await updateTicketPriorityAction(validInput);

    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('ok');
    warn.mockRestore();
  });

  it('limpeza de SlaEscalation tenta duas vezes antes de registrar a falha', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockMontarSnapshotCorrecao.mockResolvedValue({
      ok: true,
      sla: { priority: 'ALTA', resolutionDueAt: new Date(), responseDueAt: new Date() },
      escalacoesApagar: ['warning_80'],
    });
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    mockSlaEscalationDeleteMany.mockRejectedValue(new Error('falhou limpeza'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: true });
    expect(mockSlaEscalationDeleteMany).toHaveBeenCalledTimes(2);
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:escalacoes');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('checagem e gravação numa única operação atômica: nunca lê o status antes de tentar o findOneAndUpdate', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoBase());
    mockChamadoFindOneAndUpdate.mockResolvedValue(docAtualizado());
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    // Uma única chamada a `findById` (só para os valores lidos); a checagem
    // de status/prioridade/técnico/prazo vive inteira no filtro do `findOneAndUpdate`.
    expect(mockChamadoFindById).toHaveBeenCalledOnce();
  });
});

// ── corrigirServicoAction ────────────────────────────────────────

describe('corrigirServicoAction', () => {
  const MOTIVO = 'Motivo com mais de dez caracteres.';
  const OLD_SERVICE_ID = new Types.ObjectId().toHexString();
  const NEW_SERVICE_ID = new Types.ObjectId().toHexString();
  const OLD_SUBTYPE_ID = new Types.ObjectId().toHexString();
  const NEW_SUBTYPE_ID = new Types.ObjectId().toHexString();
  const TYPE_ID = new Types.ObjectId().toHexString();
  const CURRENT_TECH_ID = new Types.ObjectId().toHexString();
  const NEW_TECH_ID = new Types.ObjectId().toHexString();
  const validInput = { chamadoId: VALID_ID, catalogServiceId: NEW_SERVICE_ID, motivo: MOTIVO };

  function setupCatalogo(
    overrides: Partial<{ novoNome: string; antigoNome: string; tipoNome: string }> = {},
  ) {
    const {
      novoNome = 'Troca de disjuntor',
      antigoNome = 'Troca de lâmpada',
      tipoNome = 'Manutenção Predial',
    } = overrides;
    mockServiceCatalogFindById.mockImplementation((id: unknown) => {
      const idStr = String(id);
      if (idStr === NEW_SERVICE_ID) {
        return {
          select: () => ({
            lean: () =>
              Promise.resolve({ name: novoNome, subtypeId: NEW_SUBTYPE_ID, typeId: TYPE_ID }),
          }),
        };
      }
      if (idStr === OLD_SERVICE_ID) {
        return { select: () => ({ lean: () => Promise.resolve({ name: antigoNome }) }) };
      }
      return { select: () => ({ lean: () => Promise.resolve(null) }) };
    });
    mockServiceTypeFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: tipoNome }) }),
    });
  }

  function chamadoServico(overrides: Record<string, unknown> = {}) {
    return {
      _id: VALID_ID,
      status: 'validado',
      catalogServiceId: OLD_SERVICE_ID,
      assignedToUserId: null,
      ...overrides,
    };
  }

  function ultimoLogRevisaoIa(spy: ReturnType<typeof vi.spyOn>) {
    const chamada = spy.mock.calls.find((c: unknown[]) => c[0] === '[revisao-ia]');
    return chamada ? JSON.parse(chamada[1] as string) : undefined;
  }

  beforeEach(() => {
    setupCatalogo();
  });

  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await corrigirServicoAction({
      chamadoId: 'invalid',
      catalogServiceId: NEW_SERVICE_ID,
    } as never);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(mockChamadoFindById).not.toHaveBeenCalled();
  });

  it('retorna erro se o chamado não existe', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await corrigirServicoAction(validInput);
    expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it.each(['aberto', 'aguardando_solicitante', 'concluído', 'encerrado'])(
    'recusa fora da janela: status %s',
    async (status) => {
      mockChamadoFindById.mockResolvedValue(chamadoServico({ status }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const result = await corrigirServicoAction(validInput);

      expect(result.ok).toBe(false);
      expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
      expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('recusada');
      warn.mockRestore();
    },
  );

  it('aceita a janela em atendimento', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: 'Atual', specialties: [NEW_SUBTYPE_ID] }),
      }),
    });
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'em atendimento' });

    const result = await corrigirServicoAction(validInput);
    expect(result).toEqual({ ok: true });
  });

  it('retorna erro se o chamado ainda não tem serviço catalogado', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico({ catalogServiceId: null }));
    const result = await corrigirServicoAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Classifique');
  });

  it('recusa trocar para o mesmo serviço', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico({ catalogServiceId: OLD_SERVICE_ID }));
    const result = await corrigirServicoAction({
      ...validInput,
      catalogServiceId: OLD_SERVICE_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('já é o atual');
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('recusa tipo de serviço desconhecido (tipo_servico_desconhecido)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    setupCatalogo({ tipoNome: 'Nome Sem Mapeamento Nenhum' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await corrigirServicoAction(validInput);

    expect(result.ok).toBe(false);
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('recusada');
    warn.mockRestore();
  });

  it('novoTecnicoId só vale em em atendimento: recusa em validado', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'validado', assignedToUserId: null }),
    );

    const result = await corrigirServicoAction({ ...validInput, novoTecnicoId: NEW_TECH_ID });

    expect(result.ok).toBe(false);
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('técnico atual mantém quando tem a especialidade do serviço novo', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: 'Atual', specialties: [NEW_SUBTYPE_ID] }),
      }),
    });
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'em atendimento' });

    const result = await corrigirServicoAction(validInput);

    expect(result).toEqual({ ok: true });
    const [, update] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(update.$set.assignedToUserId).toBeUndefined();
    expect(mockAplicarVeredito).not.toHaveBeenCalled();
  });

  it('exige novoTecnicoId quando o técnico atual não tem a especialidade (tecnico_necessario)', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: 'Atual', specialties: [OLD_SUBTYPE_ID] }),
      }),
    });

    const result = await corrigirServicoAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('especialidade');
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('recusa novoTecnicoId igual ao técnico atual', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: 'Atual', specialties: [OLD_SUBTYPE_ID] }),
      }),
    });

    const result = await corrigirServicoAction({
      ...validInput,
      novoTecnicoId: CURRENT_TECH_ID,
    });

    expect(result.ok).toBe(false);
  });

  it('recusa novoTecnicoId inválido: inativo (tecnico_invalido)', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockImplementation((id: unknown) => {
      if (String(id) === CURRENT_TECH_ID) {
        return {
          select: () => ({
            lean: () => Promise.resolve({ name: 'Atual', specialties: [OLD_SUBTYPE_ID] }),
          }),
        };
      }
      return {
        select: () => ({
          lean: () =>
            Promise.resolve({
              name: 'Inativo',
              role: 'Técnico',
              isActive: false,
              specialties: [NEW_SUBTYPE_ID],
            }),
        }),
      };
    });

    const result = await corrigirServicoAction({ ...validInput, novoTecnicoId: NEW_TECH_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('inválido');
  });

  it('recusa novoTecnicoId sem a especialidade necessária', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockImplementation((id: unknown) => {
      if (String(id) === CURRENT_TECH_ID) {
        return {
          select: () => ({
            lean: () => Promise.resolve({ name: 'Atual', specialties: [OLD_SUBTYPE_ID] }),
          }),
        };
      }
      return {
        select: () => ({
          lean: () =>
            Promise.resolve({
              name: 'Candidato',
              role: 'Técnico',
              isActive: true,
              specialties: [OLD_SUBTYPE_ID],
              maxAssignedTickets: 5,
            }),
        }),
      };
    });

    const result = await corrigirServicoAction({ ...validInput, novoTecnicoId: NEW_TECH_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('especialidade');
  });

  it('recusa novoTecnicoId sobrecarregado', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockImplementation((id: unknown) => {
      if (String(id) === CURRENT_TECH_ID) {
        return {
          select: () => ({
            lean: () => Promise.resolve({ name: 'Atual', specialties: [OLD_SUBTYPE_ID] }),
          }),
        };
      }
      return {
        select: () => ({
          lean: () =>
            Promise.resolve({
              name: 'Candidato',
              role: 'Técnico',
              isActive: true,
              specialties: [NEW_SUBTYPE_ID],
              maxAssignedTickets: 5,
            }),
        }),
      };
    });
    mockChamadoCountDocuments.mockResolvedValue(5);

    const result = await corrigirServicoAction({ ...validInput, novoTecnicoId: NEW_TECH_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('sobrecarregado');
  });

  it('troca o técnico quando o novo é válido: grava reatribuicao_tecnico sem "Observações" e chama aplicarVeredito', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockImplementation((id: unknown) => {
      if (String(id) === CURRENT_TECH_ID) {
        return {
          select: () => ({
            lean: () => Promise.resolve({ name: 'Ana', specialties: [OLD_SUBTYPE_ID] }),
          }),
        };
      }
      return {
        select: () => ({
          lean: () =>
            Promise.resolve({
              _id: new Types.ObjectId(NEW_TECH_ID),
              name: 'Beto',
              role: 'Técnico',
              isActive: true,
              specialties: [NEW_SUBTYPE_ID],
              maxAssignedTickets: 5,
            }),
        }),
      };
    });
    mockChamadoCountDocuments.mockResolvedValue(0);
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'em atendimento' });

    const result = await corrigirServicoAction({ ...validInput, novoTecnicoId: NEW_TECH_ID });

    expect(result).toEqual({ ok: true });
    const [, update] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(String(update.$set.assignedToUserId)).toBe(NEW_TECH_ID);

    const reatribuicao = mockHistoryCreate.mock.calls.find(
      ([arg]) => arg.action === 'reatribuicao_tecnico',
    );
    expect(reatribuicao?.[0].observacoes).not.toContain('Observações');
    expect(reatribuicao?.[0].observacoes).toContain('Ana');
    expect(reatribuicao?.[0].observacoes).toContain('Beto');

    expect(mockAplicarVeredito).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: VALID_ID,
        vereditos: [{ campo: 'tecnico', valor: { tecnicoId: NEW_TECH_ID } }],
      }),
    );
  });

  it('gravação atômica: o filtro repete serviço e técnico lidos', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'validado' });

    await corrigirServicoAction(validInput);

    const [filtro, update, options] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(filtro).toEqual({
      _id: VALID_ID,
      status: { $in: ['validado', 'em atendimento'] },
      catalogServiceId: OLD_SERVICE_ID,
      assignedToUserId: null,
    });
    expect(options).toEqual({ returnDocument: 'after' });
    expect(String(update.$set.catalogServiceId)).toBe(NEW_SERVICE_ID);
    expect(String(update.$set.subtypeId)).toBe(NEW_SUBTYPE_ID);
    expect(update.$set.tipoServico).toBe('Manutenção Predial');
  });

  it('corrida: findOneAndUpdate não casa, recusa e pede para tentar de novo (mudou_tente_de_novo)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await corrigirServicoAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('tente de novo');
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockResolverDecisao).not.toHaveBeenCalled();
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('recusada');
    warn.mockRestore();
  });

  it('grava correcao_gestao com o motivo e a entrada neutra sem motivo (AC-13)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'validado' });

    await corrigirServicoAction(validInput);

    const correcao = mockHistoryCreate.mock.calls.find(([arg]) => arg.action === 'correcao_gestao');
    expect(correcao?.[0].observacoes).toContain(MOTIVO);
    const neutra = mockHistoryCreate.mock.calls.find(([arg]) => arg.action === 'classificacao');
    expect(neutra?.[0].observacoes).not.toContain(MOTIVO);
    expect(neutra?.[0].observacoes).toContain('Troca de disjuntor');
  });

  it('motivo ausente: correcao_gestao registra "não informado"', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'validado' });

    await corrigirServicoAction({
      chamadoId: VALID_ID,
      catalogServiceId: NEW_SERVICE_ID,
      motivo: '',
    });

    const correcao = mockHistoryCreate.mock.calls.find(([arg]) => arg.action === 'correcao_gestao');
    expect(correcao?.[0].observacoes).toContain('não informado');
  });

  it('chama resolverDecisao com o campo servico e os valores novos (AC-12)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'validado' });

    await corrigirServicoAction(validInput);

    expect(mockResolverDecisao).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: VALID_ID,
        campo: 'servico',
        valor: {
          catalogServiceId: NEW_SERVICE_ID,
          subtypeId: NEW_SUBTYPE_ID,
          tipoServico: 'Manutenção Predial',
        },
        origem: 'gestao',
        motivo: MOTIVO,
      }),
    );
  });

  it('falha ao gravar correcao_gestao: a correção continua valendo, log parcial:correcao_gestao (AC-21)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'validado' });
    mockHistoryCreate.mockRejectedValueOnce(new Error('falhou'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await corrigirServicoAction(validInput);

    expect(result).toEqual({ ok: true });
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:correcao_gestao');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('log de sucesso: operacao corrigir_servico, sem direcao (AC-17)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'validado' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await corrigirServicoAction(validInput);

    const log = ultimoLogRevisaoIa(warn);
    expect(log).toMatchObject({ operacao: 'corrigir_servico', campo: 'servico', resultado: 'ok' });
    expect(log?.direcao).toBeUndefined();
    warn.mockRestore();
  });

  // ── AC-14, AC-15: aviso ao técnico ───────────────────────────────

  it('mantém o técnico, com técnico: avisa por ticket:corrected (AC-14)', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: 'Atual', specialties: [NEW_SUBTYPE_ID] }),
      }),
    });
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      status: 'em atendimento',
      assignedToUserId: CURRENT_TECH_ID,
    });

    await corrigirServicoAction(validInput);

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: CURRENT_TECH_ID, type: 'ticket:corrected' }),
    );
    const chamada = mockEmitToRoom.mock.calls.find((c) => c[1] === 'ticket:corrected');
    expect(chamada?.[0]).toBe(`user:${CURRENT_TECH_ID}`);
    expect(chamada?.[2]).toMatchObject({ campo: 'servico' });
  });

  it('troca o técnico: avisa só o novo, sem avisar o solicitante (AC-15)', async () => {
    const solicitanteId = new Types.ObjectId().toHexString();
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockImplementation((id: unknown) => {
      if (String(id) === CURRENT_TECH_ID) {
        return {
          select: () => ({
            lean: () => Promise.resolve({ name: 'Ana', specialties: [OLD_SUBTYPE_ID] }),
          }),
        };
      }
      return {
        select: () => ({
          lean: () =>
            Promise.resolve({
              _id: new Types.ObjectId(NEW_TECH_ID),
              name: 'Beto',
              role: 'Técnico',
              isActive: true,
              specialties: [NEW_SUBTYPE_ID],
              maxAssignedTickets: 5,
            }),
        }),
      };
    });
    mockChamadoCountDocuments.mockResolvedValue(0);
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      status: 'em atendimento',
      solicitanteId,
      ticket_number: 'CHM-2026-00099',
      titulo: 'Serviço trocado',
    });

    await corrigirServicoAction({ ...validInput, novoTecnicoId: NEW_TECH_ID });

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: NEW_TECH_ID, type: 'ticket:assigned' }),
    );
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      `user:${NEW_TECH_ID}`,
      'ticket:assigned',
      expect.anything(),
    );
    const paraSolicitante = mockEmitToRoom.mock.calls.find((c) => c[0] === `user:${solicitanteId}`);
    expect(paraSolicitante).toBeUndefined();
  });

  it('sem técnico atribuído: não tenta avisar ninguém', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoServico());
    mockChamadoFindOneAndUpdate.mockResolvedValue({ _id: VALID_ID, status: 'validado' });

    await corrigirServicoAction(validInput);

    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });

  it('falha no aviso não desfaz a correção, loga parcial:aviso (AC-21)', async () => {
    mockChamadoFindById.mockResolvedValue(
      chamadoServico({ status: 'em atendimento', assignedToUserId: CURRENT_TECH_ID }),
    );
    mockUserFindById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ name: 'Atual', specialties: [NEW_SUBTYPE_ID] }),
      }),
    });
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      status: 'em atendimento',
      assignedToUserId: CURRENT_TECH_ID,
    });
    mockEmitToRoom.mockRejectedValueOnce(new Error('socket caiu'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await corrigirServicoAction(validInput);

    expect(result).toEqual({ ok: true });
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:aviso');
    erro.mockRestore();
    warn.mockRestore();
  });
});

// ── closeTicketAction ────────────────────────────────────────────

describe('closeTicketAction', () => {
  const validInput = { ticketId: VALID_ID, closureNotes: '' };

  it('retorna erro se role não pode encerrar', async () => {
    mockCanManage.mockReturnValue(false);
    mockRequireSession.mockResolvedValue({ ...SESSION, role: 'Solicitante' });
    const result = await closeTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se chamado não encontrado (update retorna null)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
    mockChamadoFindById.mockReturnValue({ lean: () => Promise.resolve(null) });

    const result = await closeTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se chamado não está concluído', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
    mockChamadoFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: VALID_ID, status: 'em atendimento' }),
    });

    const result = await closeTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Concluído');
  });

  it('encerra com sucesso', async () => {
    const updatedDoc = {
      _id: VALID_ID,
      status: 'encerrado',
      ticket_number: 'T-001',
      titulo: 'Teste',
      solicitanteId: new Types.ObjectId(),
    };
    mockChamadoFindOneAndUpdate.mockResolvedValue(updatedDoc);
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
    });

    const result = await closeTicketAction(validInput);
    expect(result).toEqual({ ok: true });
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).toHaveBeenCalledOnce();
  });
});

// ── assignTicketAction ───────────────────────────────────────────

describe('assignTicketAction', () => {
  const validInput = { ticketId: VALID_ID, preferredTechnicianId: VALID_TECH_ID };
  const subtypeId = new Types.ObjectId();
  const chamadoDoc = {
    _id: VALID_ID,
    status: 'validado',
    assignedToUserId: null,
    catalogServiceId: new Types.ObjectId(),
    sla: { responseDueAt: new Date(Date.now() + 3600000) },
  };

  it('retorna erro se chamado não encontrado', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se chamado já atribuído', async () => {
    mockChamadoFindById.mockResolvedValue({
      ...chamadoDoc,
      assignedToUserId: new Types.ObjectId(),
    });
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('já está atribuído');
  });

  it('retorna erro se chamado sem catalogServiceId', async () => {
    mockChamadoFindById.mockResolvedValue({
      ...chamadoDoc,
      catalogServiceId: null,
    });
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('serviço catalogado');
  });

  it('retorna erro se status não é validado', async () => {
    mockChamadoFindById.mockResolvedValue({ ...chamadoDoc, status: 'aberto' });
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se técnico preferido não tem especialidade', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });
    mockUserFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: VALID_TECH_ID,
          name: 'Técnico A',
          role: 'Técnico',
          isActive: true,
          specialties: [new Types.ObjectId()], // diferente de subtypeId
        }),
    });

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('especialidade');
  });

  it('atribui com sucesso ao técnico preferido', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });
    mockUserFindById
      .mockReturnValueOnce({
        lean: () =>
          Promise.resolve({
            _id: VALID_TECH_ID,
            name: 'Técnico A',
            role: 'Técnico',
            isActive: true,
            specialties: [subtypeId],
            maxAssignedTickets: 5,
          }),
      })
      // Para a busca de nome do assignedBy
      .mockReturnValueOnce({
        select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
      });

    mockChamadoCountDocuments.mockResolvedValue(2); // abaixo do limite
    const solicitanteId = new Types.ObjectId();
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      ticket_number: 'T-001',
      titulo: 'Teste',
      status: 'em atendimento',
      solicitanteId,
    });

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.strategy).toBe('MANUAL');
      expect(result.technicianName).toBe('Técnico A');
    }
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).toHaveBeenCalledOnce();

    // spec 0005, AC-2: o solicitante recebe o mesmo aviso, numa sala própria.
    const paraTecnico = mockEmitToRoom.mock.calls.find(
      (c) => c[0] === `user:${VALID_TECH_ID}` && c[1] === 'ticket:assigned',
    );
    const paraSolicitante = mockEmitToRoom.mock.calls.find(
      (c) => c[0] === `user:${String(solicitanteId)}` && c[1] === 'ticket:assigned',
    );
    expect(paraTecnico).toBeDefined();
    expect(paraSolicitante).toBeDefined();
    // O mesmo payload vai para os dois: o cliente decide o texto pelo `userId`.
    expect(paraSolicitante?.[2]).toEqual(paraTecnico?.[2]);
  });

  it('faz fallback quando técnico preferido está sobrecarregado', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });

    // Técnico preferido sobrecarregado
    mockUserFindById
      .mockReturnValueOnce({
        lean: () =>
          Promise.resolve({
            _id: VALID_TECH_ID,
            name: 'Técnico A',
            role: 'Técnico',
            isActive: true,
            specialties: [subtypeId],
            maxAssignedTickets: 3,
          }),
      })
      // Para busca de nome do assignedBy
      .mockReturnValueOnce({
        select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
      });

    mockChamadoCountDocuments.mockResolvedValue(3); // >= max

    // Fallback: findBestTechnician
    const fallbackTechId = new Types.ObjectId();
    mockUserFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            _id: fallbackTechId,
            name: 'Técnico B',
            role: 'Técnico',
            isActive: true,
            specialties: [subtypeId],
            maxAssignedTickets: 5,
          },
        ]),
    });
    mockChamadoAggregate.mockResolvedValue([{ _id: fallbackTechId, count: 1 }]);

    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      ticket_number: 'T-001',
      titulo: 'Teste',
      status: 'em atendimento',
    });

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.strategy).toBe('FALLBACK');
      expect(result.technicianName).toBe('Técnico B');
    }
  });

  it('retorna erro se update atômico falha (race condition)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });
    mockUserFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: VALID_TECH_ID,
          name: 'Técnico A',
          role: 'Técnico',
          isActive: true,
          specialties: [subtypeId],
          maxAssignedTickets: 5,
        }),
    });
    mockChamadoCountDocuments.mockResolvedValue(0);
    mockChamadoFindOneAndUpdate.mockResolvedValue(null); // race condition

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('atribuído por outro');
  });
});

// ── reassignTicketAction (spec 0009, AC-13, AC-15) ───────────────

describe('reassignTicketAction', () => {
  const CATALOG_SERVICE_ID = new Types.ObjectId().toHexString();
  const SUBTYPE_ID = new Types.ObjectId().toHexString();
  const CURRENT_TECH_ID = new Types.ObjectId().toHexString();
  const NEW_TECH_ID = new Types.ObjectId().toHexString();
  const SOLICITANTE_ID = new Types.ObjectId().toHexString();
  const MOTIVO = 'Ana está de folga, troquei para o Beto.';
  const validInput = {
    ticketId: VALID_ID,
    preferredTechnicianId: NEW_TECH_ID,
    notes: MOTIVO,
  };

  function chamadoAtribuido(overrides: Record<string, unknown> = {}) {
    return {
      _id: VALID_ID,
      status: 'em atendimento',
      catalogServiceId: CATALOG_SERVICE_ID,
      assignedToUserId: CURRENT_TECH_ID,
      solicitanteId: SOLICITANTE_ID,
      ticket_number: 'CHM-2026-00001',
      titulo: 'Troca de lâmpada — Sala 302',
      sla: { responseStartedAt: new Date() },
      ...overrides,
    };
  }

  function setupTecnicos(
    overrides: Partial<{
      novoEspecialidade: string[];
      novoAtivo: boolean;
      novoRole: string;
      novoMax: number;
    }> = {},
  ) {
    const {
      novoEspecialidade = [SUBTYPE_ID],
      novoAtivo = true,
      novoRole = 'Técnico',
      novoMax = 5,
    } = overrides;
    mockUserFindById.mockImplementation((id: unknown) => {
      const idStr = String(id);
      const lean = () => {
        if (idStr === NEW_TECH_ID) {
          return Promise.resolve({
            _id: NEW_TECH_ID,
            name: 'Beto',
            role: novoRole,
            isActive: novoAtivo,
            specialties: novoEspecialidade,
            maxAssignedTickets: novoMax,
          });
        }
        if (idStr === CURRENT_TECH_ID) {
          return Promise.resolve({ name: 'Ana' });
        }
        return Promise.resolve({ name: 'Preposto' }); // gestorUser (session.userId)
      };
      return { lean, select: () => ({ lean }) };
    });
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId: SUBTYPE_ID }) }),
    });
  }

  function ultimoLogRevisaoIa(spy: ReturnType<typeof vi.spyOn>) {
    const chamada = spy.mock.calls.find((c: unknown[]) => c[0] === '[revisao-ia]');
    return chamada ? JSON.parse(chamada[1] as string) : undefined;
  }

  beforeEach(() => {
    mockChamadoFindById.mockReturnValue({ lean: () => Promise.resolve(chamadoAtribuido()) });
    setupTecnicos();
    mockChamadoCountDocuments.mockResolvedValue(0);
  });

  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await reassignTicketAction({
      ticketId: 'invalid',
      preferredTechnicianId: NEW_TECH_ID,
      notes: MOTIVO,
    } as never);
    expect(result.ok).toBe(false);
    expect(mockChamadoFindById).not.toHaveBeenCalled();
  });

  it('retorna erro se o chamado não existe', async () => {
    mockChamadoFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    const result = await reassignTicketAction(validInput);
    expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it('recusa fora de "em atendimento", com o log de recusa (AC-17)', async () => {
    mockChamadoFindById.mockReturnValue({
      lean: () => Promise.resolve(chamadoAtribuido({ status: 'validado' })),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reassignTicketAction(validInput);

    expect(result.ok).toBe(false);
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
    expect(ultimoLogRevisaoIa(warn)).toMatchObject({
      campo: 'tecnico',
      operacao: 'reatribuir',
      resultado: 'recusada',
    });
    warn.mockRestore();
  });

  it('recusa chamado sem técnico atribuído', async () => {
    mockChamadoFindById.mockReturnValue({
      lean: () => Promise.resolve(chamadoAtribuido({ assignedToUserId: null })),
    });
    const result = await reassignTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('recusa o mesmo técnico já atribuído', async () => {
    const result = await reassignTicketAction({
      ...validInput,
      preferredTechnicianId: CURRENT_TECH_ID,
    });
    expect(result.ok).toBe(false);
  });

  it('recusa técnico novo sem a especialidade do chamado', async () => {
    setupTecnicos({ novoEspecialidade: [new Types.ObjectId().toHexString()] });
    const result = await reassignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('especialidade');
  });

  it('recusa técnico novo sobrecarregado', async () => {
    setupTecnicos({ novoMax: 2 });
    mockChamadoCountDocuments.mockResolvedValue(2);
    const result = await reassignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('sobrecarregado');
  });

  it('gravação atômica: o filtro repete status e o catalogServiceId lido (spec 0009, AC-15)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      chamadoAtribuido({ assignedToUserId: NEW_TECH_ID }),
    );

    await reassignTicketAction(validInput);

    const [filtro] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(filtro).toEqual({
      _id: VALID_ID,
      status: 'em atendimento',
      catalogServiceId: CATALOG_SERVICE_ID,
    });
  });

  it('corrida: findOneAndUpdate não casa, recusa e loga a recusa', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reassignTicketAction(validInput);

    expect(result.ok).toBe(false);
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('recusada');
    warn.mockRestore();
  });

  it('reatribui com sucesso: grava correcao_gestao com o motivo e reatribuicao_tecnico sem "Observações" (AC-13)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      chamadoAtribuido({ assignedToUserId: NEW_TECH_ID }),
    );

    const result = await reassignTicketAction(validInput);

    expect(result).toMatchObject({ ok: true, technicianId: NEW_TECH_ID, technicianName: 'Beto' });

    const correcaoGestao = mockHistoryCreate.mock.calls.find(
      ([arg]) => arg.action === 'correcao_gestao',
    );
    expect(correcaoGestao?.[0].observacoes).toBe(`técnico: Ana → Beto. Motivo: ${MOTIVO}`);

    const reatribuicao = mockHistoryCreate.mock.calls.find(
      ([arg]) => arg.action === 'reatribuicao_tecnico',
    );
    expect(reatribuicao?.[0].observacoes).not.toContain('Observações');
    expect(reatribuicao?.[0].observacoes).toContain('Ana');
    expect(reatribuicao?.[0].observacoes).toContain('Beto');
  });

  it('reatribui com sucesso: chama aplicarVeredito com o motivo', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      chamadoAtribuido({ assignedToUserId: NEW_TECH_ID }),
    );

    await reassignTicketAction(validInput);

    expect(mockAplicarVeredito).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: VALID_ID,
        vereditos: [{ campo: 'tecnico', valor: { tecnicoId: NEW_TECH_ID } }],
        motivo: MOTIVO,
      }),
    );
  });

  it('reatribui com sucesso: avisa só o técnico novo, sem avisar o solicitante (AC-15)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      chamadoAtribuido({ assignedToUserId: NEW_TECH_ID }),
    );

    await reassignTicketAction(validInput);

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: NEW_TECH_ID, type: 'ticket:assigned' }),
    );
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      `user:${NEW_TECH_ID}`,
      'ticket:assigned',
      expect.anything(),
    );
  });

  it('falha ao gravar correcao_gestao não desfaz a reatribuição, loga parcial (AC-21)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      chamadoAtribuido({ assignedToUserId: NEW_TECH_ID }),
    );
    mockHistoryCreate.mockImplementation((doc: { action: string }) => {
      if (doc.action === 'correcao_gestao') return Promise.reject(new Error('mongo caiu'));
      return Promise.resolve({});
    });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reassignTicketAction(validInput);

    expect(result.ok).toBe(true);
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:correcao_gestao');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('falha no aviso ao técnico não desfaz a reatribuição, loga parcial (AC-21)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      chamadoAtribuido({ assignedToUserId: NEW_TECH_ID }),
    );
    mockEmitToRoom.mockRejectedValueOnce(new Error('socket caiu'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await reassignTicketAction(validInput);

    expect(result.ok).toBe(true);
    expect(ultimoLogRevisaoIa(warn)?.resultado).toBe('parcial:aviso');
    erro.mockRestore();
    warn.mockRestore();
  });

  it('log de sucesso: operacao reatribuir, sem direcao (AC-17)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      chamadoAtribuido({ assignedToUserId: NEW_TECH_ID }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await reassignTicketAction(validInput);

    const log = ultimoLogRevisaoIa(warn);
    expect(log).toEqual({
      chamadoId: VALID_ID,
      campo: 'tecnico',
      operacao: 'reatribuir',
      resultado: 'ok',
    });
    warn.mockRestore();
  });
});

// ── confirmarDecisoesIaAction (spec 0009, AC-5, AC-17) ────────────

describe('confirmarDecisoesIaAction', () => {
  function ultimoLogRevisaoIa(spy: ReturnType<typeof vi.spyOn>) {
    const chamada = spy.mock.calls.find((c: unknown[]) => c[0] === '[revisao-ia]');
    return chamada ? JSON.parse(chamada[1] as string) : undefined;
  }

  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await confirmarDecisoesIaAction({ chamadoId: 'invalido' } as never);
    expect(result.ok).toBe(false);
    expect(mockCamposPendentesDeConfirmacao).not.toHaveBeenCalled();
  });

  it('sem nada pendente: recusa e loga (campo null, AC-17)', async () => {
    mockCamposPendentesDeConfirmacao.mockResolvedValue([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await confirmarDecisoesIaAction({ chamadoId: VALID_ID });

    expect(result).toEqual({
      ok: false,
      error: 'Não há decisão pendente de confirmação para este chamado.',
    });
    expect(mockConfirmarDecisao).not.toHaveBeenCalled();
    expect(ultimoLogRevisaoIa(warn)).toEqual({
      chamadoId: VALID_ID,
      campo: null,
      operacao: 'confirmar',
      resultado: 'recusada',
    });
    warn.mockRestore();
  });

  it('confirma uma decisão pendente: chama confirmarDecisao com o viewer e o campo', async () => {
    mockCamposPendentesDeConfirmacao.mockResolvedValue(['prioridade']);
    mockConfirmarDecisao.mockResolvedValue({ ok: true, situacao: 'confirmada' });

    const result = await confirmarDecisoesIaAction({ chamadoId: VALID_ID, campos: ['prioridade'] });

    expect(result).toEqual({ ok: true, resultados: [{ campo: 'prioridade', ok: true }] });
    expect(mockConfirmarDecisao).toHaveBeenCalledWith({
      viewer: { userId: SESSION.userId, role: SESSION.role },
      chamadoId: VALID_ID,
      campo: 'prioridade',
    });
  });

  it('sem campos informados, confirma todas as pendentes numa chamada só, resultado por campo', async () => {
    mockCamposPendentesDeConfirmacao.mockResolvedValue(['prioridade', 'servico', 'tecnico']);
    mockConfirmarDecisao
      .mockResolvedValueOnce({ ok: true, situacao: 'confirmada' })
      .mockResolvedValueOnce({ ok: false, reason: 'divergente' })
      .mockResolvedValueOnce({ ok: true, situacao: 'confirmada' });

    const result = await confirmarDecisoesIaAction({ chamadoId: VALID_ID });

    expect(result).toEqual({
      ok: true,
      resultados: [
        { campo: 'prioridade', ok: true },
        { campo: 'servico', ok: false, error: 'divergente' },
        { campo: 'tecnico', ok: true },
      ],
    });
    expect(mockCamposPendentesDeConfirmacao).toHaveBeenCalledWith(VALID_ID, undefined);
  });

  it('loga uma linha por campo confirmado, com o resultado de cada um (AC-17)', async () => {
    mockCamposPendentesDeConfirmacao.mockResolvedValue(['prioridade', 'servico']);
    mockConfirmarDecisao
      .mockResolvedValueOnce({ ok: true, situacao: 'confirmada' })
      .mockResolvedValueOnce({ ok: false, reason: 'divergente' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await confirmarDecisoesIaAction({ chamadoId: VALID_ID });

    const linhas = warn.mock.calls
      .filter((c) => c[0] === '[revisao-ia]')
      .map((c) => JSON.parse(c[1] as string));
    expect(linhas).toEqual([
      { chamadoId: VALID_ID, campo: 'prioridade', operacao: 'confirmar', resultado: 'ok' },
      { chamadoId: VALID_ID, campo: 'servico', operacao: 'confirmar', resultado: 'recusada' },
    ]);
    warn.mockRestore();
  });

  it('erro inesperado: recusa e loga no console, sem quebrar a ação', async () => {
    mockCamposPendentesDeConfirmacao.mockRejectedValue(new Error('MongoServerError: pool closed'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await confirmarDecisoesIaAction({ chamadoId: VALID_ID });

    expect(result.ok).toBe(false);
    expect(erro).toHaveBeenCalledWith('confirmarDecisoesIaAction:', expect.any(Error));
    erro.mockRestore();
  });
});
