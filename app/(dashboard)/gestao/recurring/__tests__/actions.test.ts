import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────
// IMPORTANTE: vi.mock é hoisted, os factories NÃO podem referenciar variáveis
// declaradas fora deles. Use vi.fn() diretamente nos factories e
// acesse os mocks através de import após o hoisting.

vi.mock('@/lib/dal', () => ({
  requireManager: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: vi.fn().mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  }),
}));

vi.mock('@/lib/recurring-utils', () => ({
  calculateNextRunAt: vi.fn().mockReturnValue(new Date('2024-04-25T11:00:00Z')),
}));

vi.mock('@/models/RecurringTicket', () => ({
  RecurringTicketModel: {
    create: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

// Importações após os mocks
import {
  createRecurringTemplateAction,
  deleteRecurringTemplateAction,
  toggleRecurringTemplateAction,
  updateRecurringTemplateAction,
} from '@/app/(dashboard)/gestao/recurring/actions';
import { requireManager } from '@/lib/dal';
import { calculateNextRunAt } from '@/lib/recurring-utils';
import { RecurringTicketModel } from '@/models/RecurringTicket';

// ── Fixtures ─────────────────────────────────────────────────────

const VALID_OID = 'a'.repeat(24);
const VALID_OID_2 = 'b'.repeat(24);
const MANAGER_SESSION = {
  userId: VALID_OID,
  username: 'preposto',
  role: 'Preposto' as const,
  isActive: true,
};

function validCreateInput() {
  return {
    name: 'Manutenção Semanal',
    titulo: 'Verificação de ar-condicionado',
    descricao: 'Inspeção periódica dos equipamentos',
    unitId: VALID_OID,
    tipoServico: 'Ar-Condicionado' as const,
    naturezaAtendimento: 'Padrão' as const,
    grauUrgencia: 'Normal' as const,
    solicitanteId: VALID_OID_2,
    recurrenceType: 'weekly' as const,
    dayOfWeek: 1,
  };
}

// ── beforeEach ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireManager).mockResolvedValue(MANAGER_SESSION);
});

// ── createRecurringTemplateAction ────────────────────────────────

describe('createRecurringTemplateAction — autenticação', () => {
  it('should return error when requireManager throws (unauthorized)', async () => {
    vi.mocked(requireManager).mockRejectedValue(new Error('REDIRECT:/dashboard'));

    const result = await createRecurringTemplateAction(validCreateInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Erro ao criar agendamento. Tente novamente.');
    }
  });
});

describe('createRecurringTemplateAction — validação Zod', () => {
  it('should return error when name is empty', async () => {
    const result = await createRecurringTemplateAction({
      ...validCreateInput(),
      name: '',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('should return error when unitId is invalid ObjectId', async () => {
    const result = await createRecurringTemplateAction({
      ...validCreateInput(),
      unitId: 'invalid',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('should return error when recurrenceType is weekly but dayOfWeek is missing', async () => {
    const { dayOfWeek: _, ...input } = validCreateInput();
    void _;
    const result = await createRecurringTemplateAction(input as Parameters<typeof createRecurringTemplateAction>[0]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('should return error when recurrenceType is monthly but dayOfMonth is missing', async () => {
    const result = await createRecurringTemplateAction({
      ...validCreateInput(),
      recurrenceType: 'monthly',
      dayOfWeek: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('should return error when recurrenceType is custom but intervalDays is missing', async () => {
    const result = await createRecurringTemplateAction({
      ...validCreateInput(),
      recurrenceType: 'custom',
      dayOfWeek: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('should not call RecurringTicketModel.create when validation fails', async () => {
    await createRecurringTemplateAction({ ...validCreateInput(), name: '' });
    expect(RecurringTicketModel.create).not.toHaveBeenCalled();
  });
});

describe('createRecurringTemplateAction — fluxo de sucesso', () => {
  beforeEach(() => {
    vi.mocked(RecurringTicketModel.create).mockResolvedValue({ _id: VALID_OID } as never);
  });

  it('should return ok:true with id when input is valid', async () => {
    const result = await createRecurringTemplateAction(validCreateInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.id).toBe(VALID_OID);
    }
  });

  it('should call RecurringTicketModel.create with correct fields', async () => {
    await createRecurringTemplateAction(validCreateInput());

    expect(RecurringTicketModel.create).toHaveBeenCalledOnce();
    const [arg] = vi.mocked(RecurringTicketModel.create).mock.calls[0];
    expect(arg.name).toBe('Manutenção Semanal');
    expect(arg.titulo).toBe('Verificação de ar-condicionado');
    expect(arg.isActive).toBe(true);
    expect(arg.nextRunAt).toBeInstanceOf(Date);
  });

  it('should set createdByUserId from session', async () => {
    await createRecurringTemplateAction(validCreateInput());

    const [arg] = vi.mocked(RecurringTicketModel.create).mock.calls[0];
    expect(String(arg.createdByUserId)).toBe(VALID_OID);
  });

  it('should accept monthly recurrence', async () => {
    const result = await createRecurringTemplateAction({
      ...validCreateInput(),
      recurrenceType: 'monthly',
      dayOfWeek: undefined,
      dayOfMonth: 15,
    });

    expect(result.ok).toBe(true);
  });

  it('should accept custom recurrence', async () => {
    const result = await createRecurringTemplateAction({
      ...validCreateInput(),
      recurrenceType: 'custom',
      dayOfWeek: undefined,
      intervalDays: 7,
    });

    expect(result.ok).toBe(true);
  });
});

describe('createRecurringTemplateAction — erro de banco', () => {
  it('should return ok:false when RecurringTicketModel.create throws', async () => {
    vi.mocked(RecurringTicketModel.create).mockRejectedValue(new Error('DB error'));

    const result = await createRecurringTemplateAction(validCreateInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Erro ao criar agendamento. Tente novamente.');
    }
  });
});

// ── updateRecurringTemplateAction ────────────────────────────────

describe('updateRecurringTemplateAction — autenticação', () => {
  it('should return error when requireManager throws', async () => {
    vi.mocked(requireManager).mockRejectedValue(new Error('Unauthorized'));

    const result = await updateRecurringTemplateAction({
      id: VALID_OID,
      ...validCreateInput(),
    });

    expect(result.ok).toBe(false);
  });
});

describe('updateRecurringTemplateAction — validação Zod', () => {
  it('should return error when id is invalid ObjectId', async () => {
    const result = await updateRecurringTemplateAction({
      id: 'bad-id',
      ...validCreateInput(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('should return error when base fields are invalid', async () => {
    const result = await updateRecurringTemplateAction({
      id: VALID_OID,
      ...validCreateInput(),
      titulo: '',
    });

    expect(result.ok).toBe(false);
  });
});

describe('updateRecurringTemplateAction — template não encontrado', () => {
  it('should return error when template does not exist', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue(null);

    const result = await updateRecurringTemplateAction({
      id: VALID_OID,
      ...validCreateInput(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Agendamento não encontrado.');
  });
});

describe('updateRecurringTemplateAction — fluxo de sucesso', () => {
  const existingDoc = {
    recurrenceType: 'weekly',
    dayOfWeek: 1,
    // Usando undefined (não null) para que a comparação !== funcione corretamente.
    // O schema Zod retorna undefined para campos opcionais não preenchidos,
    // e o existingDoc.dayOfMonth/intervalDays pode ser null no MongoDB,
    // mas o teste simula o cenário onde não houve mudança de recorrência.
    dayOfMonth: undefined,
    intervalDays: undefined,
    nextRunAt: new Date('2024-03-18T11:00:00Z'),
  };

  beforeEach(() => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue(existingDoc as never);
    vi.mocked(RecurringTicketModel.updateOne).mockResolvedValue({
      modifiedCount: 1,
    } as never);
  });

  it('should return ok:true when update succeeds', async () => {
    const result = await updateRecurringTemplateAction({
      id: VALID_OID,
      ...validCreateInput(),
    });

    expect(result.ok).toBe(true);
  });

  it('should call RecurringTicketModel.updateOne with correct id', async () => {
    await updateRecurringTemplateAction({ id: VALID_OID, ...validCreateInput() });

    expect(RecurringTicketModel.updateOne).toHaveBeenCalledOnce();
    const [filter] = vi.mocked(RecurringTicketModel.updateOne).mock.calls[0] as unknown as [
      { _id: unknown },
    ];
    expect(filter._id).toBe(VALID_OID);
  });

  it('should recalculate nextRunAt when recurrence changes', async () => {
    await updateRecurringTemplateAction({
      id: VALID_OID,
      ...validCreateInput(),
      recurrenceType: 'monthly', // mudança de weekly -> monthly
      dayOfWeek: undefined,
      dayOfMonth: 15,
    });

    expect(calculateNextRunAt).toHaveBeenCalled();
  });

  it('should NOT recalculate nextRunAt when recurrence does not change', async () => {
    // Mesma recorrência que existingDoc (weekly, dayOfWeek: 1)
    await updateRecurringTemplateAction({
      id: VALID_OID,
      ...validCreateInput(),
      recurrenceType: 'weekly',
      dayOfWeek: 1,
    });

    expect(calculateNextRunAt).not.toHaveBeenCalled();
  });
});

// ── toggleRecurringTemplateAction ────────────────────────────────

describe('toggleRecurringTemplateAction — validação de ID', () => {
  it('should return error when templateId is not a valid ObjectId', async () => {
    const result = await toggleRecurringTemplateAction('invalid-id');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('ID inválido.');
  });
});

describe('toggleRecurringTemplateAction — template não encontrado', () => {
  it('should return error when template does not exist', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue(null);

    const result = await toggleRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Agendamento não encontrado.');
  });
});

describe('toggleRecurringTemplateAction — fluxo de sucesso', () => {
  beforeEach(() => {
    vi.mocked(RecurringTicketModel.updateOne).mockResolvedValue({
      modifiedCount: 1,
    } as never);
  });

  it('should deactivate an active template', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue({
      isActive: true,
      recurrenceType: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      intervalDays: null,
    } as never);

    const result = await toggleRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(true);
    const [, update] = vi.mocked(RecurringTicketModel.updateOne).mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set.isActive).toBe(false);
  });

  it('should activate an inactive template', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue({
      isActive: false,
      recurrenceType: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      intervalDays: null,
    } as never);

    const result = await toggleRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(true);
    const [, update] = vi.mocked(RecurringTicketModel.updateOne).mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set.isActive).toBe(true);
  });

  it('should recalculate nextRunAt when activating', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue({
      isActive: false,
      recurrenceType: 'monthly',
      dayOfWeek: null,
      dayOfMonth: 10,
      intervalDays: null,
    } as never);

    await toggleRecurringTemplateAction(VALID_OID);

    expect(calculateNextRunAt).toHaveBeenCalledOnce();
    const [, update] = vi.mocked(RecurringTicketModel.updateOne).mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set.nextRunAt).toBeInstanceOf(Date);
  });

  it('should NOT recalculate nextRunAt when deactivating', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue({
      isActive: true,
      recurrenceType: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      intervalDays: null,
    } as never);

    await toggleRecurringTemplateAction(VALID_OID);

    expect(calculateNextRunAt).not.toHaveBeenCalled();
    const [, update] = vi.mocked(RecurringTicketModel.updateOne).mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set.nextRunAt).toBeUndefined();
  });
});

// ── deleteRecurringTemplateAction ────────────────────────────────

describe('deleteRecurringTemplateAction — validação de ID', () => {
  it('should return error when templateId is not a valid ObjectId', async () => {
    const result = await deleteRecurringTemplateAction('bad-id');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('ID inválido.');
  });
});

describe('deleteRecurringTemplateAction — template não encontrado', () => {
  it('should return error when deletedCount is 0', async () => {
    vi.mocked(RecurringTicketModel.deleteOne).mockResolvedValue({
      deletedCount: 0,
    } as never);

    const result = await deleteRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Agendamento não encontrado.');
  });
});

describe('deleteRecurringTemplateAction — fluxo de sucesso', () => {
  it('should return ok:true when delete succeeds', async () => {
    vi.mocked(RecurringTicketModel.deleteOne).mockResolvedValue({
      deletedCount: 1,
    } as never);

    const result = await deleteRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(true);
  });

  it('should call RecurringTicketModel.deleteOne with correct id', async () => {
    vi.mocked(RecurringTicketModel.deleteOne).mockResolvedValue({
      deletedCount: 1,
    } as never);

    await deleteRecurringTemplateAction(VALID_OID);

    expect(RecurringTicketModel.deleteOne).toHaveBeenCalledOnce();
    const [filter] = vi.mocked(RecurringTicketModel.deleteOne).mock.calls[0] as unknown as [
      { _id: unknown },
    ];
    expect(String(filter._id)).toBe(VALID_OID);
  });
});

describe('deleteRecurringTemplateAction — erro de banco', () => {
  it('should return ok:false when deleteOne throws', async () => {
    vi.mocked(RecurringTicketModel.deleteOne).mockRejectedValue(new Error('DB error'));

    const result = await deleteRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Erro ao deletar agendamento. Tente novamente.');
    }
  });

  it('should return ok:false when requireManager throws in deleteRecurringTemplateAction', async () => {
    vi.mocked(requireManager).mockRejectedValue(new Error('Unauthorized'));

    const result = await deleteRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Erro ao deletar agendamento. Tente novamente.');
    }
  });
});

// ── toggleRecurringTemplateAction — erro de banco ─────────────────

describe('toggleRecurringTemplateAction — erro de banco', () => {
  it('should return ok:false when requireManager throws in toggleRecurringTemplateAction', async () => {
    vi.mocked(requireManager).mockRejectedValue(new Error('Unauthorized'));

    const result = await toggleRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Erro ao alterar status do agendamento. Tente novamente.');
    }
  });

  it('should return ok:false when updateOne throws during toggle', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue({
      isActive: true,
      recurrenceType: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      intervalDays: null,
    } as never);
    vi.mocked(RecurringTicketModel.updateOne).mockRejectedValue(new Error('DB write error'));

    const result = await toggleRecurringTemplateAction(VALID_OID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Erro ao alterar status do agendamento. Tente novamente.');
    }
  });
});

// ── updateRecurringTemplateAction — erro de banco ─────────────────

describe('updateRecurringTemplateAction — erro de banco', () => {
  it('should return ok:false when updateOne throws', async () => {
    vi.mocked(RecurringTicketModel.findById).mockResolvedValue({
      recurrenceType: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: undefined,
      intervalDays: undefined,
      nextRunAt: new Date('2024-03-18T11:00:00Z'),
    } as never);
    vi.mocked(RecurringTicketModel.updateOne).mockRejectedValue(new Error('Update failed'));

    const result = await updateRecurringTemplateAction({
      id: VALID_OID,
      ...validCreateInput(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Erro ao atualizar agendamento. Tente novamente.');
    }
  });
});

// ── createRecurringTemplateAction — com subtypeId e catalogServiceId ──

describe('createRecurringTemplateAction — com campos opcionais', () => {
  beforeEach(() => {
    vi.mocked(RecurringTicketModel.create).mockResolvedValue({ _id: VALID_OID } as never);
  });

  it('should set subtypeId and catalogServiceId as ObjectId when provided', async () => {
    const result = await createRecurringTemplateAction({
      ...validCreateInput(),
      subtypeId: VALID_OID,
      catalogServiceId: VALID_OID_2,
    });

    expect(result.ok).toBe(true);
    const [arg] = vi.mocked(RecurringTicketModel.create).mock.calls[0];
    expect(arg.subtypeId).toBeDefined();
    expect(arg.catalogServiceId).toBeDefined();
    expect(String(arg.subtypeId)).toBe(VALID_OID);
    expect(String(arg.catalogServiceId)).toBe(VALID_OID_2);
  });

  it('should leave subtypeId and catalogServiceId undefined when not provided', async () => {
    const result = await createRecurringTemplateAction(validCreateInput());

    expect(result.ok).toBe(true);
    const [arg] = vi.mocked(RecurringTicketModel.create).mock.calls[0];
    expect(arg.subtypeId).toBeUndefined();
    expect(arg.catalogServiceId).toBeUndefined();
  });
});
