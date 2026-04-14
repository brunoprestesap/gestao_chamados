import { describe, expect, it } from 'vitest';

import {
  CHAMADO_HISTORY_ACTION_LABELS,
  CHAMADO_HISTORY_ACTIONS,
} from '@/shared/chamados/history.constants';

describe('history.constants — observacao_material', () => {
  it('deve conter observacao_material no array de actions', () => {
    expect(CHAMADO_HISTORY_ACTIONS).toContain('observacao_material');
  });

  it('deve ter label definido para observacao_material', () => {
    expect(CHAMADO_HISTORY_ACTION_LABELS.observacao_material).toBeDefined();
    expect(CHAMADO_HISTORY_ACTION_LABELS.observacao_material).toBe('Observação de Material');
  });

  it('todas as actions devem ter um label correspondente', () => {
    for (const action of CHAMADO_HISTORY_ACTIONS) {
      expect(CHAMADO_HISTORY_ACTION_LABELS[action]).toBeDefined();
      expect(typeof CHAMADO_HISTORY_ACTION_LABELS[action]).toBe('string');
      expect(CHAMADO_HISTORY_ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });
});
