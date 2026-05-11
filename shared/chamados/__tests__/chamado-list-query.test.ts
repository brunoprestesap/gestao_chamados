import { describe, expect, it } from 'vitest';

import { ChamadoListQuerySchema } from '../chamado.schemas';

describe('ChamadoListQuerySchema — defaults', () => {
  it('should apply all defaults when no input is provided', () => {
    const result = ChamadoListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('');
      expect(result.data.status).toBe('all');
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should keep provided values', () => {
    const result = ChamadoListQuerySchema.safeParse({
      q: 'elevador',
      status: 'aberto',
      page: 3,
      limit: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('elevador');
      expect(result.data.status).toEqual(['aberto']);
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(10);
    }
  });
});

describe('ChamadoListQuerySchema — page coercion', () => {
  it('should coerce string page to number', () => {
    const result = ChamadoListQuerySchema.safeParse({ page: '5' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.page).toBe(5);
  });

  it('should reject page < 1', () => {
    const result = ChamadoListQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative page', () => {
    const result = ChamadoListQuerySchema.safeParse({ page: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer page', () => {
    const result = ChamadoListQuerySchema.safeParse({ page: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('ChamadoListQuerySchema — limit coercion', () => {
  it('should coerce string limit to number', () => {
    const result = ChamadoListQuerySchema.safeParse({ limit: '15' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(15);
  });

  it('should reject limit < 1', () => {
    const result = ChamadoListQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject limit > 100', () => {
    const result = ChamadoListQuerySchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('should accept limit = 100', () => {
    const result = ChamadoListQuerySchema.safeParse({ limit: 100 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(100);
  });

  it('should accept limit = 1', () => {
    const result = ChamadoListQuerySchema.safeParse({ limit: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(1);
  });

  it('should reject non-integer limit', () => {
    const result = ChamadoListQuerySchema.safeParse({ limit: 5.5 });
    expect(result.success).toBe(false);
  });
});

describe('ChamadoListQuerySchema — status validation', () => {
  it('should accept all valid statuses', () => {
    const validStatuses = [
      'all',
      'aberto',
      'validado',
      'em atendimento',
      'aguardando_solicitante',
      'aguardando_terceiros',
      'concluído',
      'encerrado',
      'cancelado',
      'recusado',
    ];
    for (const status of validStatuses) {
      const result = ChamadoListQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('should coerce unknown status to all', () => {
    const result = ChamadoListQuerySchema.safeParse({ status: 'invalido' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('all');
  });
});
