import { describe, expect, it } from 'vitest';

import {
  PauseForRequesterSchema,
  PauseTicketBaseSchema,
  PauseTicketSchema,
  ResumeFromRequesterSchema,
  ResumeTicketSchema,
} from '@/shared/chamados/pause.schemas';
import { PAUSE_REASONS } from '@/shared/chamados/pause-reason.constants';

const VALID_ID = 'a'.repeat(24);

// ── PauseTicketBaseSchema ────────────────────────────────────────

describe('PauseTicketBaseSchema', () => {
  it('deve aceitar input válido com reason e sem details', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: 'aguardando_fornecedor' };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('deve aceitar input válido com details preenchido', () => {
    // Arrange
    const input = {
      ticketId: VALID_ID,
      reason: 'aguardando_aprovacao',
      details: 'Aguardando aprovação do gestor da unidade',
    };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.details).toBe('Aguardando aprovação do gestor da unidade');
    }
  });

  it('deve usar string vazia como default quando details ausente', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: 'aguardando_peca' };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.details).toBe('');
    }
  });

  it('deve rejeitar ticketId vazio', () => {
    // Arrange
    const input = { ticketId: '', reason: 'aguardando_fornecedor' };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('ticketId');
    }
  });

  it('deve rejeitar ticketId ausente', () => {
    // Arrange
    const input = { reason: 'aguardando_fornecedor' };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reason fora do enum', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: 'motivo_invalido' };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('reason');
    }
  });

  it('deve rejeitar reason ausente', () => {
    // Arrange — Zod z.enum sem .optional() deve falhar quando o campo é undefined/ausente.
    const input = { ticketId: VALID_ID };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert — o parse deve falhar e os issues devem mencionar o campo reason
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('reason');
    }
  });

  it('deve rejeitar details com mais de 1000 caracteres', () => {
    // Arrange
    const input = {
      ticketId: VALID_ID,
      reason: 'aguardando_acesso',
      details: 'x'.repeat(1001),
    };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('1000');
    }
  });

  it('deve aceitar details com exatamente 1000 caracteres', () => {
    // Arrange
    const input = {
      ticketId: VALID_ID,
      reason: 'aguardando_acesso',
      details: 'x'.repeat(1000),
    };

    // Act
    const result = PauseTicketBaseSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('deve aceitar todos os valores válidos de reason', () => {
    // Assert
    for (const reason of PAUSE_REASONS) {
      const result = PauseTicketBaseSchema.safeParse({ ticketId: VALID_ID, reason });
      expect(result.success).toBe(true);
    }
  });
});

// ── PauseTicketSchema (com refine) ───────────────────────────────

describe('PauseTicketSchema', () => {
  describe('quando reason é "outro"', () => {
    it('deve rejeitar quando details está ausente', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'outro' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('details');
      }
    });

    it('deve rejeitar quando details tem menos de 10 caracteres', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'outro', details: 'curto' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Detalhes obrigatórios');
      }
    });

    it('deve rejeitar quando details é só espaços (trim < 10)', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'outro', details: '         ' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(false);
    });

    it('deve aceitar quando details tem exatamente 10 caracteres', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'outro', details: '1234567890' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar quando details tem mais de 10 caracteres', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        reason: 'outro',
        details: 'Descrição detalhada do motivo específico',
      };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('quando reason não é "outro"', () => {
    it('deve aceitar sem details quando reason é aguardando_fornecedor', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'aguardando_fornecedor' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem details quando reason é aguardando_solicitante', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'aguardando_solicitante' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem details quando reason é aguardando_peca', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'aguardando_peca' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem details quando reason é aguardando_aprovacao', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'aguardando_aprovacao' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem details quando reason é aguardando_acesso', () => {
      // Arrange
      const input = { ticketId: VALID_ID, reason: 'aguardando_acesso' };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });

    it('deve aceitar com details quando reason não é outro (details é opcional)', () => {
      // Arrange
      const input = {
        ticketId: VALID_ID,
        reason: 'aguardando_peca',
        details: 'curto',
      };

      // Act
      const result = PauseTicketSchema.safeParse(input);

      // Assert
      expect(result.success).toBe(true);
    });
  });
});

// ── ResumeTicketSchema ───────────────────────────────────────────

describe('ResumeTicketSchema', () => {
  it('deve aceitar ticketId válido', () => {
    // Arrange
    const input = { ticketId: VALID_ID };

    // Act
    const result = ResumeTicketSchema.safeParse(input);

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
    const result = ResumeTicketSchema.safeParse(input);

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
    const result = ResumeTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve rejeitar input nulo', () => {
    // Act
    const result = ResumeTicketSchema.safeParse(null);

    // Assert
    expect(result.success).toBe(false);
  });

  it('deve ignorar campos extras (strip)', () => {
    // Arrange
    const input = { ticketId: VALID_ID, campoExtra: 'ignorado' };

    // Act
    const result = ResumeTicketSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).campoExtra).toBeUndefined();
    }
  });
});

// ── PauseForRequesterSchema (legado) ─────────────────────────────

describe('PauseForRequesterSchema (legado)', () => {
  it('deve aceitar ticketId e reason no limite mínimo (10 chars)', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: '10 letras!' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it('deve aceitar reason com exatamente 2000 caracteres', () => {
    // Arrange
    const input = { ticketId: VALID_ID, reason: 'x'.repeat(2000) };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
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

  it('deve rejeitar ticketId vazio', () => {
    // Arrange
    const input = { ticketId: '', reason: 'Motivo com mais de dez chars' };

    // Act
    const result = PauseForRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('ticketId');
    }
  });
});

// ── ResumeFromRequesterSchema (legado) ───────────────────────────

describe('ResumeFromRequesterSchema (legado)', () => {
  it('deve aceitar ticketId válido', () => {
    // Arrange
    const input = { ticketId: VALID_ID };

    // Act
    const result = ResumeFromRequesterSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
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

  it('deve rejeitar input completamente vazio', () => {
    // Act
    const result = ResumeFromRequesterSchema.safeParse({});

    // Assert
    expect(result.success).toBe(false);
  });
});
