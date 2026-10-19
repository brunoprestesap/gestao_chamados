import { describe, expect, it } from 'vitest';

import { prazoDoAteste } from '../prazos';

/**
 * O prazo do ateste (spec 0019, AC-21): 5 dias corridos por etapa, no fuso
 * de Belém, contados da execução e depois do provisório. Só avisa.
 *
 * covers: AC-21
 */

describe('prazoDoAteste', () => {
  // 02:00 UTC de 10/10 ainda é 09/10 em Belém (UTC−3).
  const executadoEm = new Date('2026-10-10T02:00:00.000Z');

  it('conta o provisório do dia da execução em Belém', () => {
    const p = prazoDoAteste(
      { situacao: 'executada', executadoEm },
      new Date('2026-10-14T12:00:00Z'),
    );
    expect(p).toEqual({ etapa: 'provisorio', venceEm: '2026-10-14', atrasado: false });
  });

  it('atrasa só no dia seguinte ao último dia, no fuso de Belém', () => {
    // 02:59 UTC de 15/10 é 23:59 de 14/10 em Belém: ainda no prazo.
    expect(
      prazoDoAteste({ situacao: 'executada', executadoEm }, new Date('2026-10-15T02:59:00Z'))
        ?.atrasado,
    ).toBe(false);
    expect(
      prazoDoAteste({ situacao: 'executada', executadoEm }, new Date('2026-10-15T03:00:00Z'))
        ?.atrasado,
    ).toBe(true);
  });

  it('depois do provisório, conta o definitivo a partir dele', () => {
    const p = prazoDoAteste(
      {
        situacao: 'executada',
        executadoEm,
        recebimentoProvisorio: { em: new Date('2026-10-20T15:00:00Z') },
      },
      new Date('2026-10-26T15:00:00Z'),
    );
    expect(p).toEqual({ etapa: 'definitivo', venceEm: '2026-10-25', atrasado: true });
  });

  it('fora de executada não há selo', () => {
    expect(prazoDoAteste({ situacao: 'atestada', executadoEm })).toBeNull();
    expect(prazoDoAteste({ situacao: 'autorizada', executadoEm: null })).toBeNull();
  });
});
