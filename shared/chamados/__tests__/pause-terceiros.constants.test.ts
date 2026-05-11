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

// ── CHAMADO_STATUSES — aguardando_terceiros ──────────────────────

describe('CHAMADO_STATUSES — aguardando_terceiros', () => {
  it('deve incluir o status aguardando_terceiros', () => {
    expect(CHAMADO_STATUSES).toContain('aguardando_terceiros');
  });

  it('deve incluir aguardando_terceiros além do aguardando_solicitante', () => {
    expect(CHAMADO_STATUSES).toContain('aguardando_solicitante');
    expect(CHAMADO_STATUSES).toContain('aguardando_terceiros');
  });

  it('deve posicionar aguardando_terceiros após em atendimento', () => {
    // Arrange
    const statuses = [...CHAMADO_STATUSES];
    const idxEmAtendimento = statuses.indexOf('em atendimento');
    const idxAguardandoTerceiros = statuses.indexOf('aguardando_terceiros');

    // Assert
    expect(idxEmAtendimento).toBeGreaterThanOrEqual(0);
    expect(idxAguardandoTerceiros).toBeGreaterThan(idxEmAtendimento);
  });

  it('deve posicionar aguardando_terceiros antes de concluído', () => {
    // Arrange
    const statuses = [...CHAMADO_STATUSES];
    const idxAguardandoTerceiros = statuses.indexOf('aguardando_terceiros');
    const idxConcluido = statuses.indexOf('concluído');

    // Assert
    expect(idxConcluido).toBeGreaterThanOrEqual(0);
    expect(idxAguardandoTerceiros).toBeLessThan(idxConcluido);
  });
});

// ── CHAMADO_STATUS_LABELS — aguardando_terceiros ─────────────────

describe('CHAMADO_STATUS_LABELS — aguardando_terceiros', () => {
  it('deve ter label para aguardando_terceiros', () => {
    expect(CHAMADO_STATUS_LABELS['aguardando_terceiros']).toBeDefined();
    expect(CHAMADO_STATUS_LABELS['aguardando_terceiros']).toBe('Aguardando Terceiros');
  });

  it('deve ter labels para todos os status incluindo os dois de pausa', () => {
    // Arrange
    const statuses = [...CHAMADO_STATUSES];

    // Assert
    for (const status of statuses) {
      expect(CHAMADO_STATUS_LABELS[status as ChamadoStatus]).toBeDefined();
      expect(CHAMADO_STATUS_LABELS[status as ChamadoStatus].length).toBeGreaterThan(0);
    }
  });
});

// ── CHAMADO_HISTORY_ACTIONS — pausa_terceiros / retomada_terceiros

describe('CHAMADO_HISTORY_ACTIONS — pausa e retomada de terceiros', () => {
  it('deve incluir a ação pausa_terceiros', () => {
    expect(CHAMADO_HISTORY_ACTIONS).toContain('pausa_terceiros');
  });

  it('deve incluir a ação retomada_terceiros', () => {
    expect(CHAMADO_HISTORY_ACTIONS).toContain('retomada_terceiros');
  });

  it('deve incluir todas as quatro ações de pausa e retomada', () => {
    expect(CHAMADO_HISTORY_ACTIONS).toContain('aguardando_solicitante');
    expect(CHAMADO_HISTORY_ACTIONS).toContain('retomada_atendimento');
    expect(CHAMADO_HISTORY_ACTIONS).toContain('pausa_terceiros');
    expect(CHAMADO_HISTORY_ACTIONS).toContain('retomada_terceiros');
  });
});

// ── CHAMADO_HISTORY_ACTION_LABELS — pausa e retomada de terceiros

describe('CHAMADO_HISTORY_ACTION_LABELS — pausa e retomada de terceiros', () => {
  it('deve ter label correto para pausa_terceiros', () => {
    expect(CHAMADO_HISTORY_ACTION_LABELS['pausa_terceiros']).toBe('Pausa — Aguardando Terceiros');
  });

  it('deve ter label correto para retomada_terceiros', () => {
    expect(CHAMADO_HISTORY_ACTION_LABELS['retomada_terceiros']).toBe(
      'Retomada — Terceiros Resolvido',
    );
  });

  it('deve ter labels não vazios para pausa_terceiros e retomada_terceiros', () => {
    expect(CHAMADO_HISTORY_ACTION_LABELS['pausa_terceiros']).toBeTruthy();
    expect(CHAMADO_HISTORY_ACTION_LABELS['retomada_terceiros']).toBeTruthy();
  });

  it('deve ter labels para todas as ações em CHAMADO_HISTORY_ACTIONS', () => {
    // Arrange
    const actions = [...CHAMADO_HISTORY_ACTIONS];

    // Assert
    for (const action of actions) {
      expect(CHAMADO_HISTORY_ACTION_LABELS[action]).toBeDefined();
      expect(typeof CHAMADO_HISTORY_ACTION_LABELS[action]).toBe('string');
      expect(CHAMADO_HISTORY_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });
});
