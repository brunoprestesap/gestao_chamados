import { describe, expect, it } from 'vitest';

import { MaterialObservationSchema } from '@/shared/chamados/material-observation.schemas';

const VALID_ID = 'a'.repeat(24);

describe('MaterialObservationSchema', () => {
  // ── Casos válidos ───────────────────────────────────────────────

  it('deve aceitar input válido com descrição no limite mínimo (10 chars)', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: '10 letras!',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar input válido com descrição longa', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: 'Necessário comprar 5 lâmpadas fluorescentes T8 para o corredor do 3º andar.',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar descrição com exatamente 2000 caracteres', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: 'x'.repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it('deve fazer trim na descrição', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: '   Material necessário para troca   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('Material necessário para troca');
    }
  });

  // ── ticketId inválido ───────────────────────────────────────────

  it('deve rejeitar ticketId vazio', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: '',
      description: 'Material necessário para troca',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('ticketId');
    }
  });

  it('deve rejeitar ticketId com formato inválido (não ObjectId)', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: 'nao-eh-objectid',
      description: 'Material necessário para troca',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar ticketId ausente', () => {
    const result = MaterialObservationSchema.safeParse({
      description: 'Material necessário para troca',
    });
    expect(result.success).toBe(false);
  });

  // ── description inválida ────────────────────────────────────────

  it('deve rejeitar descrição com menos de 10 caracteres', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: 'curto',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('description');
    }
  });

  it('deve rejeitar descrição com 9 caracteres (limite - 1)', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: '123456789',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar descrição com mais de 2000 caracteres', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar descrição vazia', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: '',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar descrição ausente', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
    });
    expect(result.success).toBe(false);
  });

  // ── Input totalmente inválido ──────────────────────────────────

  it('deve rejeitar input vazio', () => {
    const result = MaterialObservationSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('deve rejeitar input nulo', () => {
    const result = MaterialObservationSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('deve ignorar campos extras (strip)', () => {
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: 'Material necessário para troca',
      campoExtra: 'ignorado',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).campoExtra).toBeUndefined();
    }
  });

  // ── Trim com consequência no limite mínimo ─────────────────────

  it('deve aceitar string com espaços que ultrapassa 10 chars antes do trim (Zod valida min antes de transform)', () => {
    // "   curto   " = 11 chars (passa min), mas trim resulta em "curto" (5 chars)
    // Zod .min() roda ANTES de .transform(), então valida contra string original
    const result = MaterialObservationSchema.safeParse({
      ticketId: VALID_ID,
      description: '   curto   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('curto');
    }
  });
});
