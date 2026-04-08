import { describe, expect, it } from 'vitest';

import { SubmitEvaluationSchema } from '@/shared/chamados/evaluation.schemas';
import { hasValidEvaluation } from '@/shared/chamados/evaluation.utils';

// ── hasValidEvaluation ───────────────────────────────────────────

describe('hasValidEvaluation', () => {
  it('retorna true para rating 1..5', () => {
    for (let r = 1; r <= 5; r++) {
      expect(hasValidEvaluation({ rating: r })).toBe(true);
    }
  });

  it('retorna false para rating 0', () => {
    expect(hasValidEvaluation({ rating: 0 })).toBe(false);
  });

  it('retorna false para rating 6', () => {
    expect(hasValidEvaluation({ rating: 6 })).toBe(false);
  });

  it('retorna false para rating negativo', () => {
    expect(hasValidEvaluation({ rating: -1 })).toBe(false);
  });

  it('retorna false para rating null', () => {
    expect(hasValidEvaluation({ rating: null })).toBe(false);
  });

  it('retorna false para rating undefined', () => {
    expect(hasValidEvaluation({ rating: undefined })).toBe(false);
  });

  it('retorna false para input null', () => {
    expect(hasValidEvaluation(null)).toBe(false);
  });

  it('retorna false para input undefined', () => {
    expect(hasValidEvaluation(undefined)).toBe(false);
  });

  it('retorna false para objeto vazio', () => {
    expect(hasValidEvaluation({})).toBe(false);
  });

  it('retorna false para rating não-numérico', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hasValidEvaluation({ rating: '3' as any })).toBe(false);
  });
});

// ── SubmitEvaluationSchema ───────────────────────────────────────

describe('SubmitEvaluationSchema', () => {
  const validId = 'a'.repeat(24);

  it('aceita input válido', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 4,
      comment: 'Bom atendimento',
    });
    expect(result.success).toBe(true);
  });

  it('aceita comment vazio (opcional)', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejeita rating 0', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejeita rating 6', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 6,
    });
    expect(result.success).toBe(false);
  });

  it('rejeita rating decimal', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 3.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejeita comment > 2000 caracteres', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 4,
      comment: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('aceita comment com exatamente 2000 caracteres', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 4,
      comment: 'a'.repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it('rejeita ticketId inválido', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: 'invalid',
      rating: 4,
    });
    expect(result.success).toBe(false);
  });

  it('faz trim no comment', () => {
    const result = SubmitEvaluationSchema.safeParse({
      ticketId: validId,
      rating: 4,
      comment: '  bom  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.comment).toBe('bom');
  });
});
