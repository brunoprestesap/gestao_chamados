import { describe, expect, it } from 'vitest';

import { ATIVO_HISTORY_ACOES, ATIVO_HISTORY_ACOES_SO_DA_GESTAO } from '../ativo.constants';

/** Guarda da revisão de 2026-10-09: ação nova da substituição não pode vazar para o técnico. */
describe('ATIVO_HISTORY_ACOES_SO_DA_GESTAO (spec 0015)', () => {
  it('contém toda ação do histórico ligada à substituição', () => {
    const daSubstituicao = ATIVO_HISTORY_ACOES.filter((acao) => acao.includes('substituicao'));
    expect(daSubstituicao.length).toBeGreaterThan(0);
    for (const acao of daSubstituicao) {
      expect(ATIVO_HISTORY_ACOES_SO_DA_GESTAO).toContain(acao);
    }
  });
});
