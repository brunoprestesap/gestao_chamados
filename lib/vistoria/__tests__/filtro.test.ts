import { describe, expect, it } from 'vitest';

import { ehVistoriavel, FILTRO_VISTORIAVEL } from '../filtro';

/**
 * A regra de "vistoriável" (spec 0012, contrato entre as partes): Tier A ou B
 * e não `baixado`. A cobertura, o pacote e a sincronização dependem dela.
 *
 * covers: AC-2, AC-3, AC-10
 */
describe('ehVistoriavel', () => {
  it.each(['A', 'B'])('Tier %s em operação é vistoriável', (tier) => {
    expect(ehVistoriavel({ tierManutencao: tier, status: 'em_operacao' })).toBe(true);
  });

  it.each(['C', 'D'])('Tier %s nunca é vistoriável', (tier) => {
    expect(ehVistoriavel({ tierManutencao: tier, status: 'em_operacao' })).toBe(false);
  });

  it('ativo baixado não é vistoriável, mesmo Tier A', () => {
    expect(ehVistoriavel({ tierManutencao: 'A', status: 'baixado' })).toBe(false);
  });

  it.each(['em_manutencao', 'inoperante', 'aguardando_baixa'])(
    'status %s continua vistoriável (só baixado sai)',
    (status) => {
      expect(ehVistoriavel({ tierManutencao: 'B', status })).toBe(true);
    },
  );

  it('sem status (documento antigo) conta como vistoriável', () => {
    expect(ehVistoriavel({ tierManutencao: 'A' })).toBe(true);
    expect(ehVistoriavel({ tierManutencao: 'A', status: null })).toBe(true);
  });
});

describe('FILTRO_VISTORIAVEL', () => {
  it('pede Tier A ou B e exclui baixado, igual a ehVistoriavel', () => {
    expect(FILTRO_VISTORIAVEL).toEqual({
      tierManutencao: { $in: ['A', 'B'] },
      status: { $ne: 'baixado' },
    });
  });
});
