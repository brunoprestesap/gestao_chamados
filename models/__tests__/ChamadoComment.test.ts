import { describe, expect, it } from 'vitest';

import { ChamadoCommentModel } from '@/models/ChamadoComment';

// ── ChamadoCommentModel ──────────────────────────────────────────

describe('ChamadoCommentModel', () => {
  it('deve exportar o model ChamadoCommentModel', () => {
    // Arrange / Act / Assert
    expect(ChamadoCommentModel).toBeDefined();
  });

  it('deve ser um model Mongoose válido (possui método create e findById)', () => {
    // Arrange / Act / Assert
    expect(typeof ChamadoCommentModel.create).toBe('function');
    expect(typeof ChamadoCommentModel.findById).toBe('function');
    expect(typeof ChamadoCommentModel.find).toBe('function');
  });

  it('deve ter o nome de model "ChamadoComment"', () => {
    // Arrange / Act / Assert
    expect(ChamadoCommentModel.modelName).toBe('ChamadoComment');
  });

  describe('campos do schema', () => {
    it('deve ter o campo chamadoId no schema', () => {
      // Arrange
      const schemaPaths = ChamadoCommentModel.schema.paths;

      // Act / Assert
      expect(schemaPaths).toHaveProperty('chamadoId');
    });

    it('deve ter o campo userId no schema', () => {
      // Arrange
      const schemaPaths = ChamadoCommentModel.schema.paths;

      // Act / Assert
      expect(schemaPaths).toHaveProperty('userId');
    });

    it('deve ter o campo content no schema', () => {
      // Arrange
      const schemaPaths = ChamadoCommentModel.schema.paths;

      // Act / Assert
      expect(schemaPaths).toHaveProperty('content');
    });

    it('deve ter o campo visibility no schema', () => {
      // Arrange
      const schemaPaths = ChamadoCommentModel.schema.paths;

      // Act / Assert
      expect(schemaPaths).toHaveProperty('visibility');
    });

    it('deve ter o campo editedAt no schema (reservado para edições futuras)', () => {
      // Arrange
      const schemaPaths = ChamadoCommentModel.schema.paths;

      // Act / Assert
      expect(schemaPaths).toHaveProperty('editedAt');
    });

    it('deve ter os campos de timestamp createdAt e updatedAt', () => {
      // Arrange
      const schemaPaths = ChamadoCommentModel.schema.paths;

      // Act / Assert
      expect(schemaPaths).toHaveProperty('createdAt');
      expect(schemaPaths).toHaveProperty('updatedAt');
    });

    it('visibility deve ter "publico" como valor default', () => {
      // Arrange
      const visibilityPath = ChamadoCommentModel.schema.paths['visibility'];

      // Act / Assert
      expect((visibilityPath as { defaultValue?: unknown }).defaultValue).toBe('publico');
    });

    it('visibility deve aceitar apenas os valores publico e interno (enum)', () => {
      // Arrange
      const visibilityPath = ChamadoCommentModel.schema.paths['visibility'] as {
        enumValues?: string[];
      };

      // Act / Assert
      expect(visibilityPath.enumValues).toEqual(['publico', 'interno']);
    });

    it('chamadoId deve referenciar o model Chamado', () => {
      // Arrange
      const chamadoIdPath = ChamadoCommentModel.schema.paths['chamadoId'] as {
        options?: { ref?: string };
      };

      // Act / Assert
      expect(chamadoIdPath.options?.ref).toBe('Chamado');
    });

    it('userId deve referenciar o model User', () => {
      // Arrange
      const userIdPath = ChamadoCommentModel.schema.paths['userId'] as {
        options?: { ref?: string };
      };

      // Act / Assert
      expect(userIdPath.options?.ref).toBe('User');
    });

    it('content deve ser do tipo String', () => {
      // Arrange
      const contentPath = ChamadoCommentModel.schema.paths['content'];

      // Act / Assert
      expect(contentPath.instance).toBe('String');
    });
  });

  describe('índices', () => {
    it('deve ter índice composto em chamadoId + createdAt', () => {
      // Arrange
      const indexes = ChamadoCommentModel.schema.indexes();

      // Act
      const hasChamadoCreatedAtIndex = indexes.some(([fields]: [Record<string, unknown>]) => {
        const keys = Object.keys(fields);
        return keys.includes('chamadoId') && keys.includes('createdAt');
      });

      // Assert
      expect(hasChamadoCreatedAtIndex).toBe(true);
    });

    it('deve ter índice composto em chamadoId + visibility', () => {
      // Arrange
      const indexes = ChamadoCommentModel.schema.indexes();

      // Act
      const hasChamadoVisibilityIndex = indexes.some(([fields]: [Record<string, unknown>]) => {
        const keys = Object.keys(fields);
        return keys.includes('chamadoId') && keys.includes('visibility');
      });

      // Assert
      expect(hasChamadoVisibilityIndex).toBe(true);
    });
  });
});
