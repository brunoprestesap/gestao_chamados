import { describe, expect, it } from 'vitest';

import {
  PAUSE_REASON_LABELS,
  PAUSE_REASONS,
  type PauseReason,
} from '@/shared/chamados/pause-reason.constants';

// ── PAUSE_REASONS ────────────────────────────────────────────────

describe('PAUSE_REASONS', () => {
  it('deve conter exatamente 6 motivos de pausa', () => {
    // Assert
    expect(PAUSE_REASONS).toHaveLength(6);
  });

  it('deve conter aguardando_solicitante', () => {
    expect(PAUSE_REASONS).toContain('aguardando_solicitante');
  });

  it('deve conter aguardando_fornecedor', () => {
    expect(PAUSE_REASONS).toContain('aguardando_fornecedor');
  });

  it('deve conter aguardando_peca', () => {
    expect(PAUSE_REASONS).toContain('aguardando_peca');
  });

  it('deve conter aguardando_aprovacao', () => {
    expect(PAUSE_REASONS).toContain('aguardando_aprovacao');
  });

  it('deve conter aguardando_acesso', () => {
    expect(PAUSE_REASONS).toContain('aguardando_acesso');
  });

  it('deve conter outro', () => {
    expect(PAUSE_REASONS).toContain('outro');
  });

  it('deve ser readonly (tuple constante)', () => {
    // Arrange
    const reasons: readonly string[] = PAUSE_REASONS;

    // Assert
    expect(Array.isArray(reasons)).toBe(true);
  });
});

// ── PAUSE_REASON_LABELS ──────────────────────────────────────────

describe('PAUSE_REASON_LABELS', () => {
  it('deve ter label para cada motivo em PAUSE_REASONS', () => {
    // Arrange
    const reasons = [...PAUSE_REASONS];

    // Assert
    for (const reason of reasons) {
      expect(PAUSE_REASON_LABELS[reason as PauseReason]).toBeDefined();
      expect(typeof PAUSE_REASON_LABELS[reason as PauseReason]).toBe('string');
      expect(PAUSE_REASON_LABELS[reason as PauseReason].length).toBeGreaterThan(0);
    }
  });

  it('deve ter label correto para aguardando_solicitante', () => {
    expect(PAUSE_REASON_LABELS['aguardando_solicitante']).toBe('Aguardando Solicitante');
  });

  it('deve ter label correto para aguardando_fornecedor', () => {
    expect(PAUSE_REASON_LABELS['aguardando_fornecedor']).toBe('Aguardando Fornecedor');
  });

  it('deve ter label correto para aguardando_peca', () => {
    expect(PAUSE_REASON_LABELS['aguardando_peca']).toBe('Aguardando Peça/Material');
  });

  it('deve ter label correto para aguardando_aprovacao', () => {
    expect(PAUSE_REASON_LABELS['aguardando_aprovacao']).toBe('Aguardando Aprovação');
  });

  it('deve ter label correto para aguardando_acesso', () => {
    expect(PAUSE_REASON_LABELS['aguardando_acesso']).toBe('Aguardando Acesso ao Local');
  });

  it('deve ter label correto para outro', () => {
    expect(PAUSE_REASON_LABELS['outro']).toBe('Outro Motivo');
  });

  it('não deve ter mais chaves do que motivos em PAUSE_REASONS', () => {
    // Arrange
    const labelKeys = Object.keys(PAUSE_REASON_LABELS);

    // Assert
    expect(labelKeys).toHaveLength(PAUSE_REASONS.length);
  });
});
