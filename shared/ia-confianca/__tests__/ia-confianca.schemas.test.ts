import { describe, expect, it } from 'vitest';

import { salvarIaAutonomiaConfigSchema } from '../ia-confianca.schemas';

/** Validação de `salvarIaAutonomiaConfigAction` (spec 0006, AC-10). */

const validoBase = {
  servico: { limiteConfianca: 0.9, amostraMinima: 30 },
  prioridade: { limiteConfianca: null, amostraMinima: 30 },
  autonomiaAtiva: false,
};

describe('salvarIaAutonomiaConfigSchema', () => {
  it('aceita um limite entre 0 e 1 e uma amostra mínima inteira', () => {
    const parsed = salvarIaAutonomiaConfigSchema.safeParse(validoBase);
    expect(parsed.success).toBe(true);
  });

  it('em branco (string vazia) vira null, sem erro', () => {
    const parsed = salvarIaAutonomiaConfigSchema.safeParse({
      ...validoBase,
      servico: { limiteConfianca: '', amostraMinima: 30 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.servico.limiteConfianca).toBeNull();
  });

  it('recusa limite de confiança acima de 1', () => {
    const parsed = salvarIaAutonomiaConfigSchema.safeParse({
      ...validoBase,
      servico: { limiteConfianca: 1.5, amostraMinima: 30 },
    });
    expect(parsed.success).toBe(false);
  });

  it('recusa limite de confiança abaixo de 0', () => {
    const parsed = salvarIaAutonomiaConfigSchema.safeParse({
      ...validoBase,
      prioridade: { limiteConfianca: -0.1, amostraMinima: 30 },
    });
    expect(parsed.success).toBe(false);
  });

  it('recusa amostra mínima menor que 1', () => {
    const parsed = salvarIaAutonomiaConfigSchema.safeParse({
      ...validoBase,
      servico: { limiteConfianca: null, amostraMinima: 0 },
    });
    expect(parsed.success).toBe(false);
  });

  it('recusa amostra mínima não inteira', () => {
    const parsed = salvarIaAutonomiaConfigSchema.safeParse({
      ...validoBase,
      prioridade: { limiteConfianca: null, amostraMinima: 2.5 },
    });
    expect(parsed.success).toBe(false);
  });
});
