import { describe, expect, it } from 'vitest';

import {
  CHAMADO_STATUS_ATIVOS_TECNICO,
  CHAMADO_STATUS_NAO_FINALIZADOS,
  CHAMADO_STATUSES,
} from '@/shared/chamados/chamado.constants';

/**
 * Os agrupamentos de status que a lateral de `/conversas` usa por papel
 * (spec 0005, AC-8): o técnico só vê o que ainda pede acompanhamento dele, a
 * gestão vê tudo que não fechou.
 */

describe('CHAMADO_STATUS_NAO_FINALIZADOS', () => {
  it('não contém encerrado nem cancelado', () => {
    // Assert
    expect(CHAMADO_STATUS_NAO_FINALIZADOS).not.toContain('encerrado');
    expect(CHAMADO_STATUS_NAO_FINALIZADOS).not.toContain('cancelado');
  });

  it('contém todo status de CHAMADO_STATUSES que não é encerrado nem cancelado', () => {
    // Assert: a lista deriva de CHAMADO_STATUSES, não é mantida à mão
    const esperado = CHAMADO_STATUSES.filter((s) => s !== 'encerrado' && s !== 'cancelado');
    expect([...CHAMADO_STATUS_NAO_FINALIZADOS].sort()).toEqual([...esperado].sort());
  });

  it('contém aberto, validado e em atendimento, que a gestão precisa ver', () => {
    // Assert
    expect(CHAMADO_STATUS_NAO_FINALIZADOS).toContain('aberto');
    expect(CHAMADO_STATUS_NAO_FINALIZADOS).toContain('validado');
    expect(CHAMADO_STATUS_NAO_FINALIZADOS).toContain('em atendimento');
  });
});

describe('CHAMADO_STATUS_ATIVOS_TECNICO', () => {
  it('contém exatamente os quatro status que mantêm o chamado na lateral do técnico', () => {
    // Assert
    expect([...CHAMADO_STATUS_ATIVOS_TECNICO].sort()).toEqual(
      ['aguardando_solicitante', 'concluído', 'em atendimento', 'validado'].sort(),
    );
  });

  it('não contém aberto, porque o técnico só recebe chamado já validado e atribuído', () => {
    // Assert
    expect(CHAMADO_STATUS_ATIVOS_TECNICO).not.toContain('aberto');
  });

  it('não contém encerrado nem cancelado', () => {
    // Assert
    expect(CHAMADO_STATUS_ATIVOS_TECNICO).not.toContain('encerrado');
    expect(CHAMADO_STATUS_ATIVOS_TECNICO).not.toContain('cancelado');
  });

  it('é um subconjunto de CHAMADO_STATUS_NAO_FINALIZADOS', () => {
    // Assert: todo status ativo do técnico também é um status não finalizado
    for (const status of CHAMADO_STATUS_ATIVOS_TECNICO) {
      expect(CHAMADO_STATUS_NAO_FINALIZADOS).toContain(status);
    }
  });
});
