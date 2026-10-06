import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

import type { ValorDecisao } from '@/shared/conversas/conversa.schemas';

import { derivarIaSituacao, mesmoValor, ROTULO_SEM_ATIVO, valorParaInput } from '../decisoes';

/**
 * As regras puras da decisão `ativo` (spec 0014): ela não conta para o
 * `iaSituacao`, entra na comparação de valores e lê o valor atual do chamado.
 *
 * covers: AC-11, AC-12
 */

const ATIVO_A = '6aad5286df6f201a25eda001';
const ATIVO_B = '6aad5286df6f201a25eda002';

const valor = (extra: Partial<ValorDecisao> = {}): ValorDecisao => ({
  catalogServiceId: null,
  subtypeId: null,
  tipoServico: null,
  prioridade: null,
  tecnicoId: null,
  ativoId: null,
  rotulo: 'x',
  ...extra,
});

describe('derivarIaSituacao (AC-11)', () => {
  it('chamado só com a decisão ativo fica sem_ia', () => {
    expect(derivarIaSituacao([{ campo: 'ativo', efeito: 'aplicado' }])).toBe('sem_ia');
  });

  it('a decisão ativo aplicada não transforma sugestões em decidida', () => {
    expect(
      derivarIaSituacao([
        { campo: 'servico', efeito: 'sugestao' },
        { campo: 'ativo', efeito: 'aplicado' },
      ]),
    ).toBe('sugerida');
  });

  it('continua decidida quando a IA aplicou algo', () => {
    expect(
      derivarIaSituacao([
        { campo: 'prioridade', efeito: 'aplicado' },
        { campo: 'ativo', efeito: 'aplicado' },
      ]),
    ).toBe('decidida');
  });
});

describe('mesmoValor com ativo (AC-12)', () => {
  it('ativos diferentes são valores diferentes, mesmo com o mesmo rótulo', () => {
    expect(mesmoValor(valor({ ativoId: ATIVO_A }), valor({ ativoId: ATIVO_B }))).toBe(false);
  });

  it('o mesmo ativo com rótulo diferente é o mesmo valor', () => {
    expect(
      mesmoValor(
        valor({ ativoId: ATIVO_A, rotulo: '11997' }),
        valor({ ativoId: ATIVO_A, rotulo: 'novo' }),
      ),
    ).toBe(true);
  });

  it('tirar o equipamento é diferente de ter um', () => {
    expect(mesmoValor(valor({ ativoId: ATIVO_A }), valor({ rotulo: ROTULO_SEM_ATIVO }))).toBe(
      false,
    );
    expect(ROTULO_SEM_ATIVO).toBe('Nenhum equipamento');
  });
});

describe('valorParaInput do campo ativo', () => {
  it('lê o ativo do chamado', () => {
    expect(valorParaInput('ativo', { ativoId: ATIVO_A })).toEqual({ ativoId: ATIVO_A });
  });

  it('chamado sem ativo vira ativoId null, não ausência de valor', () => {
    expect(valorParaInput('ativo', { ativoId: null })).toEqual({ ativoId: null });
    expect(valorParaInput('ativo', {})).toEqual({ ativoId: null });
  });
});
