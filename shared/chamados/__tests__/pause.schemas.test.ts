import { describe, expect, it } from 'vitest';

import {
  PauseForRequesterSchema,
  ResumeFromRequesterSchema,
} from '@/shared/chamados/pause.schemas';

const VALID_ID = 'a'.repeat(24);

// ── PauseForRequesterSchema ──────────────────────────────────────

describe('PauseForRequesterSchema', () => {
  it('deve aceitar input válido com motivo no limite mínimo', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: '10 letras!' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('deve aceitar input válido com motivo extenso', () => {
    // Arrange
    const input = {
      ticketId: VALID_ID,
      reason: 'Solicitante viajou e não pode confirmar o serviço agora.',
    };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('deve aceitar motivo com exatamente 2000 caracteres', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: 'x'.repeat(2000) };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('deve rejeitar ticketId vazio', () => {
    // Arrange
    const input = { ticketId: '', reason: 'Motivo válido aqui.' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('ticketId');
    }
  });

  it('deve rejeitar ticketId ausente', () => {
    // Arrange
    const input = { reason: 'Motivo válido aqui.' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reason com menos de 10 caracteres', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: 'curto' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Motivo deve ter no mínimo 10 caracteres');
    }
  });

  it('deve rejeitar reason com 9 caracteres (limite mínimo - 1)', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: '123456789' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reason com mais de 2000 caracteres', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: 'x'.repeat(2001) };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Motivo deve ter no máximo 2000 caracteres');
    }
  });

  it('deve rejeitar reason vazio', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: '' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reason ausente', () => {
    // Arrange
    const input = { ticketId: VALID_ID };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve rejeitar input completamente vazio', () => {
    // Arrange
    const input = {};

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── ResumeFromRequesterSchema ────────────────────────────────────

describe('ResumeFromRequesterSchema', () => {
  it('deve aceitar input válido', () => {
    // Arrange
    const input = { ticketId: VALID_ID };

    // Act
    const result = ResumeFromRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticketId).toBe(VALID_ID);
    }
  });

  it('deve rejeitar ticketId vazio', () => {
    // Arrange
    const input = { ticketId: '' };

    // Act
    const result = ResumeFromRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('ID do chamado é obrigatório');
    }
  });

  it('deve rejeitar ticketId ausente', () => {
    // Arrange
    const input = {};

    // Act
    const result = ResumeFromRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve rejeitar input nulo', () => {
    // Act
    const result = ResumeFromRequesterSchema.safeParse(null);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve ignorar campos extras (strip)', () => {
    // Arrange
    const input = { ticketId: VALID_ID, campoExtra: 'ignorado' };

    // Act
    const result = ResumeFromRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).campoExtra).toBeUndefined();
    }
  });
});
