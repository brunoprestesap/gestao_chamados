import { describe, expect, it } from 'vitest';

import {
  CreateRecurringTicketSchema,
  DAY_OF_WEEK_LABELS,
  RECURRENCE_TYPE_LABELS,
  RECURRENCE_TYPES,
  UpdateRecurringTicketSchema,
} from '@/shared/chamados/recurring-ticket.schemas';

// Helpers
const VALID_OBJECT_ID = 'a'.repeat(24);
const VALID_OBJECT_ID_2 = 'b'.repeat(24);

function validBase() {
  return {
    name: 'Manutenção Semanal',
    titulo: 'Verificação de ar-condicionado',
    descricao: 'Inspeção periódica dos equipamentos',
    unitId: VALID_OBJECT_ID,
    tipoServico: 'Ar-Condicionado' as const,
    naturezaAtendimento: 'Padrão' as const,
    grauUrgencia: 'Normal' as const,
    solicitanteId: VALID_OBJECT_ID_2,
    recurrenceType: 'weekly' as const,
    dayOfWeek: 1,
  };
}

// ── Constantes exportadas ────────────────────────────────────────

describe('RECURRENCE_TYPES', () => {
  it('contém os três tipos esperados', () => {
    expect(RECURRENCE_TYPES).toEqual(['weekly', 'monthly', 'custom']);
  });
});

describe('RECURRENCE_TYPE_LABELS', () => {
  it('mapeia todos os tipos para labels legíveis', () => {
    expect(RECURRENCE_TYPE_LABELS.weekly).toBe('Semanal');
    expect(RECURRENCE_TYPE_LABELS.monthly).toBe('Mensal');
    expect(RECURRENCE_TYPE_LABELS.custom).toBe('Personalizado');
  });
});

describe('DAY_OF_WEEK_LABELS', () => {
  it('mapeia 0 a 6 para nomes dos dias', () => {
    expect(DAY_OF_WEEK_LABELS[0]).toBe('Domingo');
    expect(DAY_OF_WEEK_LABELS[1]).toBe('Segunda-feira');
    expect(DAY_OF_WEEK_LABELS[2]).toBe('Terça-feira');
    expect(DAY_OF_WEEK_LABELS[3]).toBe('Quarta-feira');
    expect(DAY_OF_WEEK_LABELS[4]).toBe('Quinta-feira');
    expect(DAY_OF_WEEK_LABELS[5]).toBe('Sexta-feira');
    expect(DAY_OF_WEEK_LABELS[6]).toBe('Sábado');
  });
});

// ── CreateRecurringTicketSchema ───────────────────────────────────

describe('CreateRecurringTicketSchema — campos básicos', () => {
  it('should accept valid weekly input with dayOfWeek', () => {
    const result = CreateRecurringTicketSchema.safeParse(validBase());
    expect(result.success).toBe(true);
  });

  it('should accept valid monthly input with dayOfMonth', () => {
    const input = {
      ...validBase(),
      recurrenceType: 'monthly' as const,
      dayOfWeek: undefined,
      dayOfMonth: 15,
    };
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept valid custom input with intervalDays', () => {
    const input = {
      ...validBase(),
      recurrenceType: 'custom' as const,
      dayOfWeek: undefined,
      intervalDays: 7,
    };
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should trim name field', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      name: '  Manutenção  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Manutenção');
  });

  it('should trim titulo field', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      titulo: '  Verificação  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.titulo).toBe('Verificação');
  });

  it('should trim descricao field', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      descricao: '  Inspeção  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.descricao).toBe('Inspeção');
  });

  it('should default grauUrgencia to Normal when not provided', () => {
    const input = { ...validBase() };
    delete input.grauUrgencia;
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.grauUrgencia).toBe('Normal');
  });

  it('should accept optional subtypeId as valid ObjectId', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      subtypeId: VALID_OBJECT_ID,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subtypeId).toBe(VALID_OBJECT_ID);
  });

  it('should reject subtypeId with invalid ObjectId and set it to undefined', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      subtypeId: 'invalid-id',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subtypeId).toBeUndefined();
  });

  it('should accept optional catalogServiceId as valid ObjectId', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      catalogServiceId: VALID_OBJECT_ID,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.catalogServiceId).toBe(VALID_OBJECT_ID);
  });
});

describe('CreateRecurringTicketSchema — validação de nome', () => {
  it('should reject empty name after trim', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      name: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name exceeding 150 characters', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      name: 'a'.repeat(151),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.name).toBeDefined();
    }
  });

  it('should accept name with exactly 150 characters', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      name: 'a'.repeat(150),
    });
    expect(result.success).toBe(true);
  });
});

describe('CreateRecurringTicketSchema — validação de unitId e solicitanteId', () => {
  it('should reject invalid unitId (not a valid ObjectId)', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      unitId: 'invalid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.unitId).toBeDefined();
    }
  });

  it('should reject invalid solicitanteId', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      solicitanteId: 'not-an-id',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.solicitanteId).toBeDefined();
    }
  });
});

describe('CreateRecurringTicketSchema — validação de tipoServico e natureza', () => {
  it('should reject invalid tipoServico', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      tipoServico: 'ServicoInexistente',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid naturezaAtendimento', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      naturezaAtendimento: 'Especial',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid grauUrgencia', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      grauUrgencia: 'Extremo',
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateRecurringTicketSchema — refinements condicionais (weekly)', () => {
  it('should reject weekly without dayOfWeek', () => {
    const input = {
      ...validBase(),
      recurrenceType: 'weekly' as const,
      dayOfWeek: undefined,
    };
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.dayOfWeek).toBeDefined();
    }
  });

  it('should accept weekly with dayOfWeek = 0 (Domingo)', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      dayOfWeek: 0,
    });
    expect(result.success).toBe(true);
  });

  it('should accept weekly with dayOfWeek = 6 (Sábado)', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      dayOfWeek: 6,
    });
    expect(result.success).toBe(true);
  });

  it('should reject dayOfWeek < 0', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      dayOfWeek: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject dayOfWeek > 6', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      dayOfWeek: 7,
    });
    expect(result.success).toBe(false);
  });

  it('should coerce string dayOfWeek to number', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      dayOfWeek: '3',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dayOfWeek).toBe(3);
  });
});

describe('CreateRecurringTicketSchema — refinements condicionais (monthly)', () => {
  function monthlyBase() {
    return {
      ...validBase(),
      recurrenceType: 'monthly' as const,
      dayOfWeek: undefined,
    };
  }

  it('should reject monthly without dayOfMonth', () => {
    const result = CreateRecurringTicketSchema.safeParse(monthlyBase());
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.dayOfMonth).toBeDefined();
    }
  });

  it('should accept monthly with dayOfMonth = 1', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...monthlyBase(),
      dayOfMonth: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should accept monthly with dayOfMonth = 28', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...monthlyBase(),
      dayOfMonth: 28,
    });
    expect(result.success).toBe(true);
  });

  it('should reject dayOfMonth = 0', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...monthlyBase(),
      dayOfMonth: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject dayOfMonth = 29 (limite para evitar datas inválidas)', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...monthlyBase(),
      dayOfMonth: 29,
    });
    expect(result.success).toBe(false);
  });

  it('should coerce string dayOfMonth to number', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...monthlyBase(),
      dayOfMonth: '15',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dayOfMonth).toBe(15);
  });
});

describe('CreateRecurringTicketSchema — refinements condicionais (custom)', () => {
  function customBase() {
    return {
      ...validBase(),
      recurrenceType: 'custom' as const,
      dayOfWeek: undefined,
    };
  }

  it('should reject custom without intervalDays', () => {
    const result = CreateRecurringTicketSchema.safeParse(customBase());
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.intervalDays).toBeDefined();
    }
  });

  it('should accept custom with intervalDays = 1', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...customBase(),
      intervalDays: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should accept custom with intervalDays = 365', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...customBase(),
      intervalDays: 365,
    });
    expect(result.success).toBe(true);
  });

  it('should reject intervalDays = 0', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...customBase(),
      intervalDays: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject intervalDays negative', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...customBase(),
      intervalDays: -5,
    });
    expect(result.success).toBe(false);
  });

  it('should coerce string intervalDays to number', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...customBase(),
      intervalDays: '30',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.intervalDays).toBe(30);
  });
});

describe('CreateRecurringTicketSchema — campos obrigatórios faltando', () => {
  it('should reject when name is missing', () => {
    const input = { ...validBase() };
    delete input.name;
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject when titulo is missing', () => {
    const input = { ...validBase() };
    delete input.titulo;
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject when descricao is missing', () => {
    const input = { ...validBase() };
    delete input.descricao;
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject when recurrenceType is missing', () => {
    const input = { ...validBase() };
    delete input.recurrenceType;
    const result = CreateRecurringTicketSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject when recurrenceType is invalid', () => {
    const result = CreateRecurringTicketSchema.safeParse({
      ...validBase(),
      recurrenceType: 'daily',
    });
    expect(result.success).toBe(false);
  });
});

// ── UpdateRecurringTicketSchema ───────────────────────────────────

describe('UpdateRecurringTicketSchema', () => {
  it('should accept valid update with id', () => {
    const result = UpdateRecurringTicketSchema.safeParse({
      id: VALID_OBJECT_ID,
      ...validBase(),
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(VALID_OBJECT_ID);
  });

  it('should reject update without id', () => {
    const result = UpdateRecurringTicketSchema.safeParse(validBase());
    expect(result.success).toBe(false);
  });

  it('should reject update with invalid id format', () => {
    const result = UpdateRecurringTicketSchema.safeParse({
      id: 'invalid-id',
      ...validBase(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.id).toBeDefined();
    }
  });

  it('should reject update when base fields are invalid (propagates CreateSchema refinements)', () => {
    const result = UpdateRecurringTicketSchema.safeParse({
      id: VALID_OBJECT_ID,
      ...validBase(),
      recurrenceType: 'weekly',
      dayOfWeek: undefined, // falta dayOfWeek para weekly
    });
    expect(result.success).toBe(false);
  });

  it('should reject update with monthly recurrence and missing dayOfMonth', () => {
    const result = UpdateRecurringTicketSchema.safeParse({
      id: VALID_OBJECT_ID,
      ...validBase(),
      recurrenceType: 'monthly',
      dayOfWeek: undefined,
      dayOfMonth: undefined,
    });
    expect(result.success).toBe(false);
  });
});
