import { describe, expect, it } from 'vitest';

import { RefuseServiceSchema } from '@/shared/chamados/service-refusal.schemas';

const VALID_ID = 'a'.repeat(24);

describe('RefuseServiceSchema', () => {
  const validInput = {
    ticketId: VALID_ID,
    reason: 'O problema do ar-condicionado voltou após o atendimento',
  };

  it('aceita input válido', () => {
    const result = RefuseServiceSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejeita ticketId inválido', () => {
    const result = RefuseServiceSchema.safeParse({ ...validInput, ticketId: 'xyz' });
    expect(result.success).toBe(false);
  });

  it('rejeita ticketId vazio', () => {
    const result = RefuseServiceSchema.safeParse({ ...validInput, ticketId: '' });
    expect(result.success).toBe(false);
  });

  it('rejeita reason ausente', () => {
    const result = RefuseServiceSchema.safeParse({ ticketId: VALID_ID });
    expect(result.success).toBe(false);
  });

  it('rejeita reason com menos de 10 caracteres', () => {
    const result = RefuseServiceSchema.safeParse({ ...validInput, reason: '123456789' });
    expect(result.success).toBe(false);
  });

  it('aceita reason com exatamente 10 caracteres', () => {
    const result = RefuseServiceSchema.safeParse({ ...validInput, reason: '1234567890' });
    expect(result.success).toBe(true);
  });

  it('rejeita reason com mais de 2000 caracteres', () => {
    const result = RefuseServiceSchema.safeParse({ ...validInput, reason: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('aceita reason com exatamente 2000 caracteres', () => {
    const result = RefuseServiceSchema.safeParse({ ...validInput, reason: 'x'.repeat(2000) });
    expect(result.success).toBe(true);
  });

  it('faz trim no reason', () => {
    const result = RefuseServiceSchema.safeParse({
      ...validInput,
      reason: '  O problema voltou após o serviço  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reason).toBe('O problema voltou após o serviço');
  });

  it('rejeita reason só com espaços (após trim fica < 10)', () => {
    const result = RefuseServiceSchema.safeParse({ ...validInput, reason: '         ' });
    expect(result.success).toBe(false);
  });
});
