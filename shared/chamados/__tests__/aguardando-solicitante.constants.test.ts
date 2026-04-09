import { describe, expect, it } from 'vitest';

import {
  CHAMADO_STATUS_LABELS,
  CHAMADO_STATUSES,
  type ChamadoStatus,
} from '@/shared/chamados/chamado.constants';
import {
  CHAMADO_HISTORY_ACTION_LABELS,
  CHAMADO_HISTORY_ACTIONS,
} from '@/shared/chamados/history.constants';

// ── CHAMADO_STATUSES ─────────────────────────────────────────────

describe('CHAMADO_STATUSES', () => {
  it('deve incluir o status aguardando_solicitante', () => {
    // Act & Assert
    expect(CHAMADO_STATUSES).toContain('aguardando_solicitante');
  });

  it('deve posicionar aguardando_solicitante após em atendimento', () => {
    // Arrange
    const statuses = [...CHAMADO_STATUSES];
    const idxEmAtendimento = statuses.indexOf('em atendimento');
    const idxAguardando = statuses.indexOf('aguardando_solicitante');

    // Assert
    expect(idxEmAtendimento).toBeGreaterThanOrEqual(0);
    expect(idxAguardando).toBeGreaterThan(idxEmAtendimento);
  });

  it('deve posicionar aguardando_solicitante antes de fechado', () => {
    // Arrange
    const statuses = [...CHAMADO_STATUSES];
    const idxAguardando = statuses.indexOf('aguardando_solicitante');
    const idxFechado = statuses.indexOf('fechado');

    // Assert
    expect(idxFechado).toBeGreaterThanOrEqual(0);
    expect(idxAguardando).toBeLessThan(idxFechado);
  });

  it('deve conter todos os status do ciclo de vida padrão', () => {
    // Assert
    expect(CHAMADO_STATUSES).toContain('aberto');
    expect(CHAMADO_STATUSES).toContain('emvalidacao');
    expect(CHAMADO_STATUSES).toContain('validado');
    expect(CHAMADO_STATUSES).toContain('em atendimento');
    expect(CHAMADO_STATUSES).toContain('fechado');
    expect(CHAMADO_STATUSES).toContain('concluído');
    expect(CHAMADO_STATUSES).toContain('encerrado');
    expect(CHAMADO_STATUSES).toContain('cancelado');
  });
});

// ── CHAMADO_STATUS_LABELS ────────────────────────────────────────

describe('CHAMADO_STATUS_LABELS', () => {
  it('deve ter label para aguardando_solicitante', () => {
    // Act & Assert
    expect(CHAMADO_STATUS_LABELS['aguardando_solicitante']).toBeDefined();
    expect(CHAMADO_STATUS_LABELS['aguardando_solicitante']).toBe('Aguardando Solicitante');
  });

  it('deve ter label para todos os status em CHAMADO_STATUSES', () => {
    // Arrange
    const statuses = [...CHAMADO_STATUSES];

    // Assert
    for (const status of statuses) {
      expect(CHAMADO_STATUS_LABELS[status as ChamadoStatus]).toBeDefined();
      expect(typeof CHAMADO_STATUS_LABELS[status as ChamadoStatus]).toBe('string');
      expect(CHAMADO_STATUS_LABELS[status as ChamadoStatus].length).toBeGreaterThan(0);
    }
  });

  it('deve ter label não vazio para aguardando_solicitante', () => {
    // Act & Assert
    expect(CHAMADO_STATUS_LABELS['aguardando_solicitante']).not.toBe('');
  });
});

// ── CHAMADO_HISTORY_ACTIONS ──────────────────────────────────────

describe('CHAMADO_HISTORY_ACTIONS', () => {
  it('deve incluir aguardando_solicitante', () => {
    // Act & Assert
    expect(CHAMADO_HISTORY_ACTIONS).toContain('aguardando_solicitante');
  });

  it('deve incluir retomada_atendimento', () => {
    // Act & Assert
    expect(CHAMADO_HISTORY_ACTIONS).toContain('retomada_atendimento');
  });

  it('deve manter as ações históricas existentes', () => {
    // Assert
    expect(CHAMADO_HISTORY_ACTIONS).toContain('abertura');
    expect(CHAMADO_HISTORY_ACTIONS).toContain('atribuicao_tecnico');
    expect(CHAMADO_HISTORY_ACTIONS).toContain('execucao_registrada');
    expect(CHAMADO_HISTORY_ACTIONS).toContain('encerramento');
    expect(CHAMADO_HISTORY_ACTIONS).toContain('classificacao');
  });
});

// ── CHAMADO_HISTORY_ACTION_LABELS ────────────────────────────────

describe('CHAMADO_HISTORY_ACTION_LABELS', () => {
  it('deve ter label correto para aguardando_solicitante', () => {
    // Act & Assert
    expect(CHAMADO_HISTORY_ACTION_LABELS['aguardando_solicitante']).toBe('Aguardando Solicitante');
  });

  it('deve ter label correto para retomada_atendimento', () => {
    // Act & Assert
    expect(CHAMADO_HISTORY_ACTION_LABELS['retomada_atendimento']).toBe('Atendimento Retomado');
  });

  it('deve ter label para todas as ações em CHAMADO_HISTORY_ACTIONS', () => {
    // Arrange
    const actions = [...CHAMADO_HISTORY_ACTIONS];

    // Assert
    for (const action of actions) {
      expect(CHAMADO_HISTORY_ACTION_LABELS[action]).toBeDefined();
      expect(typeof CHAMADO_HISTORY_ACTION_LABELS[action]).toBe('string');
      expect(CHAMADO_HISTORY_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });

  it('labels de pausa e retomada devem ser strings não vazias', () => {
    // Assert
    expect(CHAMADO_HISTORY_ACTION_LABELS['aguardando_solicitante']).toBeTruthy();
    expect(CHAMADO_HISTORY_ACTION_LABELS['retomada_atendimento']).toBeTruthy();
  });
});
