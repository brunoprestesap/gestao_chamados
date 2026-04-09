import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequireSession = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockTemplateCreate = vi.fn();
const mockTemplateFind = vi.fn();
const mockTemplateFindById = vi.fn();
const mockTemplateUpdateOne = vi.fn();

vi.mock('@/models/TicketTemplate', () => ({
  TicketTemplateModel: {
    create: (...args: unknown[]) => mockTemplateCreate(...args),
    find: (...args: unknown[]) => mockTemplateFind(...args),
    findById: (...args: unknown[]) => mockTemplateFindById(...args),
    updateOne: (...args: unknown[]) => mockTemplateUpdateOne(...args),
  },
}));

import {
  createTemplateAction,
  deleteTemplateAction,
  incrementTemplateUsageAction,
  listTemplatesAction,
} from '@/app/(dashboard)/meus-chamados/template-actions';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_ID = new Types.ObjectId().toHexString();
const USER_ID = new Types.ObjectId().toHexString();

const SESSION_SOLICITANTE = { userId: USER_ID, role: 'Solicitante', username: 'solicitante1', isActive: true };
const SESSION_PREPOSTO = { userId: USER_ID, role: 'Preposto', username: 'preposto1', isActive: true };
const SESSION_ADMIN = { userId: USER_ID, role: 'Admin', username: 'admin1', isActive: true };

const VALID_CREATE_INPUT = {
  name: 'Template de Manutenção',
  scope: 'personal' as const,
};

const VALID_CREATE_GLOBAL_INPUT = {
  name: 'Template Global de Serviço',
  scope: 'global' as const,
  tipoServico: 'Manutenção Predial' as const,
  naturezaAtendimento: 'Padrão' as const,
  grauUrgencia: 'Normal' as const,
};

function makeTemplateDoc(overrides = {}) {
  const ownerId = new Types.ObjectId(USER_ID);
  return {
    _id: new Types.ObjectId(VALID_ID),
    name: 'Template Teste',
    scope: 'personal' as const,
    createdByUserId: ownerId,
    isActive: true,
    usageCount: 0,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
});

// ── createTemplateAction ──────────────────────────────────────────

describe('createTemplateAction', () => {
  it('should return error when input is invalid (Zod)', async () => {
    const result = await createTemplateAction({ name: 'ab', scope: 'personal' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('pelo menos 3 caracteres');
  });

  it('should return error when scope is invalid', async () => {
    const result = await createTemplateAction({
      name: 'Template Válido',
      scope: 'shared' as never,
    });
    expect(result.ok).toBe(false);
  });

  it('should return error when Solicitante tries to create global template', async () => {
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);

    const result = await createTemplateAction(VALID_CREATE_GLOBAL_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('gestores');
  });

  it('should return error when Técnico tries to create global template', async () => {
    mockRequireSession.mockResolvedValue({
      userId: USER_ID,
      role: 'Técnico',
      username: 'tecnico1',
      isActive: true,
    });

    const result = await createTemplateAction(VALID_CREATE_GLOBAL_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('gestores');
  });

  it('should create personal template for Solicitante', async () => {
    const createdDoc = { _id: new Types.ObjectId(VALID_ID) };
    mockTemplateCreate.mockResolvedValue(createdDoc);

    const result = await createTemplateAction(VALID_CREATE_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe(String(createdDoc._id));

    expect(mockTemplateCreate).toHaveBeenCalledOnce();
    const callArgs = mockTemplateCreate.mock.calls[0][0];
    expect(callArgs.name).toBe('Template de Manutenção');
    expect(callArgs.scope).toBe('personal');
    expect(callArgs.createdByUserId).toBeInstanceOf(Types.ObjectId);
  });

  it('should allow Preposto to create global template', async () => {
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    const createdDoc = { _id: new Types.ObjectId(VALID_ID) };
    mockTemplateCreate.mockResolvedValue(createdDoc);

    const result = await createTemplateAction(VALID_CREATE_GLOBAL_INPUT);
    expect(result.ok).toBe(true);
  });

  it('should allow Admin to create global template', async () => {
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    const createdDoc = { _id: new Types.ObjectId(VALID_ID) };
    mockTemplateCreate.mockResolvedValue(createdDoc);

    const result = await createTemplateAction(VALID_CREATE_GLOBAL_INPUT);
    expect(result.ok).toBe(true);
  });

  it('should create template with optional fields when provided', async () => {
    const createdDoc = { _id: new Types.ObjectId(VALID_ID) };
    mockTemplateCreate.mockResolvedValue(createdDoc);

    const input = {
      name: 'Template Completo',
      scope: 'personal' as const,
      descricao: 'Descrição do template',
      tipoServico: 'Ar-Condicionado' as const,
      naturezaAtendimento: 'Urgente' as const,
      grauUrgencia: 'Alto' as const,
      unitId: VALID_ID,
      subtypeId: VALID_ID,
      catalogServiceId: VALID_ID,
    };

    const result = await createTemplateAction(input);
    expect(result.ok).toBe(true);

    const callArgs = mockTemplateCreate.mock.calls[0][0];
    expect(callArgs.descricao).toBe('Descrição do template');
    expect(callArgs.tipoServico).toBe('Ar-Condicionado');
    expect(callArgs.naturezaAtendimento).toBe('Urgente');
    expect(callArgs.grauUrgencia).toBe('Alto');
    expect(callArgs.unitId).toBeInstanceOf(Types.ObjectId);
    expect(callArgs.subtypeId).toBeInstanceOf(Types.ObjectId);
    expect(callArgs.catalogServiceId).toBeInstanceOf(Types.ObjectId);
  });

  it('should return error when database throws', async () => {
    mockTemplateCreate.mockRejectedValue(new Error('DB error'));

    const result = await createTemplateAction(VALID_CREATE_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Erro ao criar template');
  });
});

// ── listTemplatesAction ──────────────────────────────────────────

describe('listTemplatesAction', () => {
  function makeListQuery(docs: unknown[]) {
    return {
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(docs),
    };
  }

  it('should return list of templates ordered by usageCount desc', async () => {
    const ownerId = new Types.ObjectId(USER_ID);
    const docs = [
      {
        _id: new Types.ObjectId(),
        name: 'Template Popular',
        scope: 'global',
        createdByUserId: ownerId,
        usageCount: 10,
      },
      {
        _id: new Types.ObjectId(),
        name: 'Template Pessoal',
        scope: 'personal',
        createdByUserId: ownerId,
        usageCount: 2,
      },
    ];
    mockTemplateFind.mockReturnValue(makeListQuery(docs));

    const result = await listTemplatesAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Template Popular');
      expect(result.data[0].scope).toBe('global');
      expect(result.data[0].usageCount).toBe(10);
    }
  });

  it('should return empty array when no templates found', async () => {
    mockTemplateFind.mockReturnValue(makeListQuery([]));

    const result = await listTemplatesAction();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(0);
  });

  it('should query with correct filter (isActive + scope global or personal by user)', async () => {
    mockTemplateFind.mockReturnValue(makeListQuery([]));

    await listTemplatesAction();

    expect(mockTemplateFind).toHaveBeenCalledOnce();
    const filterArg = mockTemplateFind.mock.calls[0][0];
    expect(filterArg.isActive).toBe(true);
    expect(filterArg.$or).toHaveLength(2);
    expect(filterArg.$or[0]).toEqual({ scope: 'global' });
    expect(filterArg.$or[1].scope).toBe('personal');
  });

  it('should map optional fields correctly to undefined when null/undefined', async () => {
    const ownerId = new Types.ObjectId(USER_ID);
    const docs = [
      {
        _id: new Types.ObjectId(),
        name: 'Template Sem Opcionais',
        scope: 'personal',
        createdByUserId: ownerId,
        descricao: null,
        tipoServico: undefined,
        unitId: null,
        usageCount: 0,
      },
    ];
    mockTemplateFind.mockReturnValue(makeListQuery(docs));

    const result = await listTemplatesAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const item = result.data[0];
      expect(item.descricao).toBeUndefined();
      expect(item.tipoServico).toBeUndefined();
      expect(item.unitId).toBeUndefined();
    }
  });

  it('should return error when database throws', async () => {
    mockTemplateFind.mockImplementation(() => {
      throw new Error('DB error');
    });

    const result = await listTemplatesAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Erro ao listar templates');
  });
});

// ── deleteTemplateAction ──────────────────────────────────────────

describe('deleteTemplateAction', () => {
  it('should return error when templateId is not a valid ObjectId', async () => {
    const result = await deleteTemplateAction('not-valid-id');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('não encontrado');
  });

  it('should return error when template is not found', async () => {
    mockTemplateFindById.mockResolvedValue(null);

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('não encontrado');
  });

  it('should return error when template is already inactive', async () => {
    mockTemplateFindById.mockResolvedValue(makeTemplateDoc({ isActive: false }));

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('não encontrado');
  });

  it('should allow owner to delete their own personal template', async () => {
    const doc = makeTemplateDoc({ scope: 'personal' });
    mockTemplateFindById.mockResolvedValue(doc);

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(true);
    expect(doc.save).toHaveBeenCalledOnce();
    expect(doc.isActive).toBe(false);
  });

  it('should return error when non-owner Solicitante tries to delete another user template', async () => {
    const otherOwnerId = new Types.ObjectId();
    const doc = makeTemplateDoc({
      scope: 'personal',
      createdByUserId: otherOwnerId,
    });
    mockTemplateFindById.mockResolvedValue(doc);

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Sem permissão');
  });

  it('should allow Preposto to delete global template owned by another user', async () => {
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    const otherOwnerId = new Types.ObjectId();
    const doc = makeTemplateDoc({
      scope: 'global',
      createdByUserId: otherOwnerId,
    });
    mockTemplateFindById.mockResolvedValue(doc);

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(true);
    expect(doc.isActive).toBe(false);
  });

  it('should allow Admin to delete global template owned by another user', async () => {
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    const otherOwnerId = new Types.ObjectId();
    const doc = makeTemplateDoc({
      scope: 'global',
      createdByUserId: otherOwnerId,
    });
    mockTemplateFindById.mockResolvedValue(doc);

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(true);
  });

  it('should return error when Preposto tries to delete personal template owned by another user', async () => {
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    const otherOwnerId = new Types.ObjectId();
    const doc = makeTemplateDoc({
      scope: 'personal',
      createdByUserId: otherOwnerId,
    });
    mockTemplateFindById.mockResolvedValue(doc);

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Sem permissão');
  });

  it('should return error when database throws', async () => {
    mockTemplateFindById.mockRejectedValue(new Error('DB error'));

    const result = await deleteTemplateAction(VALID_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Erro ao excluir template');
  });
});

// ── incrementTemplateUsageAction ──────────────────────────────────

describe('incrementTemplateUsageAction', () => {
  it('should return error when templateId is not a valid ObjectId', async () => {
    const result = await incrementTemplateUsageAction('not-valid');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ID inválido');
  });

  it('should return error when templateId is too short', async () => {
    const result = await incrementTemplateUsageAction('abc123');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ID inválido');
  });

  it('should increment usageCount atomically', async () => {
    mockTemplateUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await incrementTemplateUsageAction(VALID_ID);
    expect(result.ok).toBe(true);

    expect(mockTemplateUpdateOne).toHaveBeenCalledOnce();
    const [filter, update] = mockTemplateUpdateOne.mock.calls[0];
    expect(filter).toMatchObject({ _id: VALID_ID, isActive: true });
    expect(update).toEqual({ $inc: { usageCount: 1 } });
  });

  it('should return ok even when template is not found (no-op update)', async () => {
    mockTemplateUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const result = await incrementTemplateUsageAction(VALID_ID);
    expect(result.ok).toBe(true);
  });

  it('should return error when database throws', async () => {
    mockTemplateUpdateOne.mockRejectedValue(new Error('DB error'));

    const result = await incrementTemplateUsageAction(VALID_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Erro ao atualizar uso do template');
  });

  it('should call requireSession before any database operation', async () => {
    mockTemplateUpdateOne.mockResolvedValue({ matchedCount: 1 });

    await incrementTemplateUsageAction(VALID_ID);
    expect(mockRequireSession).toHaveBeenCalledOnce();
  });
});
