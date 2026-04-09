import { describe, expect, it } from 'vitest';

import { AddCommentSchema, COMMENT_VISIBILITY } from '@/shared/chamados/comment.schemas';

const VALID_ID = '507f1f77bcf86cd799439011';

// ── COMMENT_VISIBILITY ───────────────────────────────────────────

describe('COMMENT_VISIBILITY', () => {
  it('deve conter exatamente os valores publico e interno', () => {
    // Arrange / Act / Assert
    expect(COMMENT_VISIBILITY).toEqual(['publico', 'interno']);
  });
});

// ── AddCommentSchema ─────────────────────────────────────────────

describe('AddCommentSchema', () => {
  describe('campo chamadoId', () => {
    it('deve aceitar ObjectId válido de 24 hex chars (minúsculas)', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'Comentário válido' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar ObjectId válido com letras maiúsculas', () => {
      // Arrange
      const input = { chamadoId: VALID_ID.toUpperCase(), content: 'Comentário válido' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve rejeitar string com menos de 24 caracteres', () => {
      // Arrange
      const input = { chamadoId: '507f1f77bcf86cd79943901', content: 'Comentário' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('chamadoId'));
        expect(issue?.message).toContain('inválido');
      }
    });

    it('deve rejeitar string com mais de 24 caracteres', () => {
      // Arrange
      const input = { chamadoId: '507f1f77bcf86cd7994390111', content: 'Comentário' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });

    it('deve rejeitar string com caracteres não-hexadecimais', () => {
      // Arrange
      const input = { chamadoId: 'zzzzzzzzzzzzzzzzzzzzzzzz', content: 'Comentário' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('chamadoId'));
        expect(issue?.message).toContain('inválido');
      }
    });

    it('deve rejeitar chamadoId ausente', () => {
      // Arrange
      const input = { content: 'Comentário válido' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('campo content', () => {
    it('deve aceitar content com 1 caractere (mínimo)', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'a' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar content com exatamente 5000 caracteres (máximo)', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'x'.repeat(5000) };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve rejeitar content vazio', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: '' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('content'));
        expect(issue?.message).toContain('vazio');
      }
    });

    it('deve rejeitar content com 5001 caracteres (acima do máximo)', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'x'.repeat(5001) };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('content'));
        expect(issue?.message).toContain('5000');
      }
    });

    it('deve rejeitar content ausente', () => {
      // Arrange
      const input = { chamadoId: VALID_ID };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('campo visibility', () => {
    it('deve aceitar visibility "publico"', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'Comentário', visibility: 'publico' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.visibility).toBe('publico');
    });

    it('deve aceitar visibility "interno"', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'Comentário', visibility: 'interno' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.visibility).toBe('interno');
    });

    it('deve rejeitar visibility com valor inválido', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'Comentário', visibility: 'privado' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });

    it('deve rejeitar visibility com string vazia', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'Comentário', visibility: '' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });

    it('deve aplicar default "publico" quando visibility está ausente', () => {
      // Arrange
      const input = { chamadoId: VALID_ID, content: 'Comentário sem visibility' };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.visibility).toBe('publico');
    });
  });

  describe('input completo válido', () => {
    it('deve retornar os dados parseados corretamente', () => {
      // Arrange
      const input = {
        chamadoId: VALID_ID,
        content: 'Comentário de teste completo',
        visibility: 'interno' as const,
      };

      // Act
      const result = AddCommentSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chamadoId).toBe(VALID_ID);
        expect(result.data.content).toBe('Comentário de teste completo');
        expect(result.data.visibility).toBe('interno');
      }
    });
  });
});
