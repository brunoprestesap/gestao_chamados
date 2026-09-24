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
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a) }));
// O gancho das decisões da IA tem os testes dele em `lib/conversas/__tests__`,
// contra o Mongo de verdade. Aqui ele só não pode atrapalhar a ação de negócio.
const mockResolverDecisao = vi.fn();
vi.mock('@/lib/conversas/decisoes', () => ({
  aplicarVeredito: vi.fn().mockResolvedValue(undefined),
  resolverDecisao: (...args: unknown[]) => mockResolverDecisao(...args),
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

import {
  assignTicketAction,
  classificarChamadoAction,
  closeTicketAction,
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
  const validInput = {
    chamadoId: VALID_ID,
    finalPriority: 'ALTA' as const,
    classificationNotes: '',
  };

  function slaConfigOk() {
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          responseTargetMinutes: 60,
          resolutionTargetMinutes: 240,
          businessHoursOnly: true,
          version: 'v1',
        }),
    });
  }

  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await updateTicketPriorityAction({
      chamadoId: 'invalid',
      finalPriority: 'ALTA' as const,
      classificationNotes: '',
    });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('retorna erro se o chamado não existe', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await updateTicketPriorityAction(validInput);
    expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it('retorna erro se o chamado nunca foi classificado (sem classifiedAt)', async () => {
    mockChamadoFindById.mockResolvedValue({ _id: VALID_ID, status: 'validado' });
    const result = await updateTicketPriorityAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('classificado');
  });

  it('corrige a prioridade, recalcula o SLA a partir do classifiedAt original e emite ticket:classified', async () => {
    mockChamadoFindById.mockResolvedValue({
      _id: VALID_ID,
      status: 'validado',
      classifiedAt: CLASSIFIED_AT,
      classificationNotes: '',
      finalPriority: 'NORMAL',
    });
    slaConfigOk();
    const solicitanteId = new Types.ObjectId();
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      ticket_number: 'CHM-2026-00001',
      titulo: 'Ar-condicionado',
      solicitanteId,
    });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Preposto' }) }),
    });

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: true });
    // O snapshot foi calculado a partir do `classifiedAt` original, não de "agora".
    const [filtro, update] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(filtro).toMatchObject({
      _id: VALID_ID,
      status: 'validado',
      assignedToUserId: null,
      finalPriority: { $ne: 'ALTA' },
    });
    const [{ $set }] = update;
    expect($set.finalPriority).toEqual({ $literal: 'ALTA' });
    const slaNovo = $set.sla.$mergeObjects[1].$literal;
    expect(slaNovo.responseDueAt).toEqual(new Date(CLASSIFIED_AT.getTime() + 60 * 60 * 1000));
    // Breach e escalações dos prazos antigos saem, para o monitor reavaliar.
    expect(slaNovo.responseBreachedAt).toBeNull();
    expect(slaNovo.resolutionBreachedAt).toBeNull();
    expect(mockSlaEscalationDeleteMany).toHaveBeenCalledWith({ chamadoId: VALID_ID });
    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ chamadoId: VALID_ID, action: 'classificacao' }),
    );
    expect(mockResolverDecisao).toHaveBeenCalledWith(
      expect.objectContaining({ chamadoId: VALID_ID, campo: 'prioridade' }),
    );
    const chamado = mockEmitToRoom.mock.calls.find((c) => c[1] === 'ticket:classified');
    expect(chamado?.[0]).toBe(`user:${String(solicitanteId)}`);
    expect(chamado?.[2]).toMatchObject({ finalPriority: 'ALTA' });
  });

  it('erro inesperado do banco: devolve a frase fixa, nunca a mensagem interna', async () => {
    mockChamadoFindById.mockRejectedValue(new Error('MongoServerError: connection pool closed'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await updateTicketPriorityAction(validInput);

    expect(result).toEqual({ ok: false, error: 'Erro ao corrigir prioridade. Tente novamente.' });
    erro.mockRestore();
  });

  it('acrescenta a nova observação às notas existentes, sem substituir', async () => {
    mockChamadoFindById.mockResolvedValue({
      _id: VALID_ID,
      status: 'validado',
      classifiedAt: CLASSIFIED_AT,
      classificationNotes: 'Nota original da IA.',
      finalPriority: 'NORMAL',
    });
    slaConfigOk();
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      ticket_number: 'CHM-2026-00001',
      titulo: 'Ar-condicionado',
      solicitanteId: new Types.ObjectId(),
    });
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction({
      ...validInput,
      classificationNotes: 'Na verdade é mais grave.',
    });

    // A soma acontece no banco, sobre o valor gravado (não o lido antes), para
    // correções concorrentes não se apagarem; o DB test prova o resultado.
    const [{ $set }] = mockChamadoFindOneAndUpdate.mock.calls[0][1];
    const notas = JSON.stringify($set.classificationNotes);
    expect(notas).toContain('$classificationNotes');
    expect(notas).toContain('Correção: Na verdade é mais grave.');
  });

  it('recusa fora da janela: chamado com técnico atribuído', async () => {
    mockChamadoFindById
      .mockResolvedValueOnce({
        _id: VALID_ID,
        status: 'validado',
        classifiedAt: CLASSIFIED_AT,
        classificationNotes: '',
        finalPriority: 'NORMAL',
      })
      .mockResolvedValueOnce({
        _id: VALID_ID,
        status: 'validado',
        assignedToUserId: new Types.ObjectId(),
        finalPriority: 'NORMAL',
      });
    slaConfigOk();
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);

    const result = await updateTicketPriorityAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('técnico');
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockResolverDecisao).not.toHaveBeenCalled();
  });

  it('recusa fora da janela: status diferente de validado', async () => {
    mockChamadoFindById
      .mockResolvedValueOnce({
        _id: VALID_ID,
        status: 'validado',
        classifiedAt: CLASSIFIED_AT,
        classificationNotes: '',
        finalPriority: 'NORMAL',
      })
      .mockResolvedValueOnce({ _id: VALID_ID, status: 'em atendimento', finalPriority: 'NORMAL' });
    slaConfigOk();
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);

    const result = await updateTicketPriorityAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('em atendimento');
  });

  it('recusa trocar para a mesma prioridade já vigente', async () => {
    mockChamadoFindById
      .mockResolvedValueOnce({
        _id: VALID_ID,
        status: 'validado',
        classifiedAt: CLASSIFIED_AT,
        classificationNotes: '',
        finalPriority: 'ALTA',
      })
      .mockResolvedValueOnce({
        _id: VALID_ID,
        status: 'validado',
        assignedToUserId: null,
        finalPriority: 'ALTA',
      });
    slaConfigOk();
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);

    const result = await updateTicketPriorityAction(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('já é a atual');
  });

  it('sem SlaConfig ativa para a nova prioridade, retorna erro sem gravar nada', async () => {
    mockChamadoFindById.mockResolvedValue({
      _id: VALID_ID,
      status: 'validado',
      classifiedAt: CLASSIFIED_AT,
      classificationNotes: '',
      finalPriority: 'NORMAL',
    });
    mockSlaFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const result = await updateTicketPriorityAction(validInput);

    expect(result.ok).toBe(false);
    expect(mockChamadoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('checagem e gravação numa única operação atômica: nunca lê o status antes de tentar o findOneAndUpdate', async () => {
    mockChamadoFindById.mockResolvedValue({
      _id: VALID_ID,
      status: 'validado',
      classifiedAt: CLASSIFIED_AT,
      classificationNotes: '',
      finalPriority: 'NORMAL',
    });
    slaConfigOk();
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      ticket_number: 'CHM-2026-00001',
      titulo: 'x',
      solicitanteId: new Types.ObjectId(),
    });
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    await updateTicketPriorityAction(validInput);

    // Uma única chamada a `findById` (só para o `classifiedAt`); a checagem
    // de status/atribuição vive inteira no filtro do `findOneAndUpdate`.
    expect(mockChamadoFindById).toHaveBeenCalledOnce();
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
