import { describe, expect, it } from 'vitest';

import { ReassignTicketSchema } from '@/shared/chamados/assignment.schemas';

// ── ReassignTicketSchema ─────────────────────────────────────────

const VALID_ID = '507f1f77bcf86cd799439011';

describe('ReassignTicketSchema', () => {
  describe('campo notes', () => {
    it('deve falhar quando notes tem 9 caracteres', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: VALID_ID,
        notes: 'a'.repeat(9),
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const notesIssue = result.error.issues.find((i) => i.path.includes('notes'));
        expect(notesIssue?.message).toBe('Justificativa deve ter no mínimo 10 caracteres');
      }
    });

    it('deve passar quando notes tem exatamente 10 caracteres', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: VALID_ID,
        notes: 'a'.repeat(10),
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve passar quando notes tem exatamente 2000 caracteres', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: VALID_ID,
        notes: 'a'.repeat(2000),
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve falhar quando notes tem 2001 caracteres', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: VALID_ID,
        notes: 'a'.repeat(2001),
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });

    it('deve falhar quando notes está ausente (campo obrigatório)', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: VALID_ID,
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const notesIssue = result.error.issues.find((i) => i.path.includes('notes'));
        expect(notesIssue).toBeDefined();
      }
    });

    it('deve falhar quando notes é string vazia', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: VALID_ID,
        notes: '',
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const notesIssue = result.error.issues.find((i) => i.path.includes('notes'));
        expect(notesIssue?.message).toBe('Justificativa deve ter no mínimo 10 caracteres');
      }
    });
  });

  describe('campo ticketId', () => {
    it('deve falhar quando ticketId não é um ObjectId válido', () => {
      // Arrange
      const input = {
        ticketId: 'id-invalido',
        preferredTechnicianId: VALID_ID,
        notes: 'Justificativa válida para reatribuição',
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const ticketIssue = result.error.issues.find((i) => i.path.includes('ticketId'));
        expect(ticketIssue?.message).toBe('ID inválido');
      }
    });
  });

  describe('campo preferredTechnicianId', () => {
    it('deve falhar quando preferredTechnicianId não é um ObjectId válido', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: 'nao-e-um-objectid',
        notes: 'Justificativa válida para reatribuição',
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const techIssue = result.error.issues.find((i) =>
          i.path.includes('preferredTechnicianId'),
        );
        expect(techIssue?.message).toBe('ID inválido');
      }
    });
  });

  describe('dados completos válidos', () => {
    it('deve passar com todos os campos corretos e retornar os dados parseados', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        preferredTechnicianId: VALID_ID,
        notes: 'Técnico original está de férias, reatribuindo ao substituto.',
      };

      // Act
      const result = ReassignTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ticketId).toBe(VALID_ID);
        expect(result.data.preferredTechnicianId).toBe(VALID_ID);
        expect(result.data.notes).toBe(input.notes);
      }
    });
  });
});
