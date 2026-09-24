import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O portão de confiança da abertura (spec 0007, AC-1, AC-2, AC-4, AC-7):
 * confiante exige as três coisas juntas (autonomia ligada, limite definido,
 * confiança acima do limite), sempre com o cartão em modo `ia`.
 */

const mockLerConfig = vi.fn();
vi.mock('@/lib/ia-confianca/config', () => ({
  lerConfig: () => mockLerConfig(),
}));

import { confiancaSuficienteParaPrioridade } from '../portao';

function configComAutonomia(limiteConfianca: number | null) {
  return {
    servico: { limiteConfianca: null, amostraMinima: 30 },
    prioridade: { limiteConfianca, amostraMinima: 30 },
    autonomiaAtiva: true,
  };
}

describe('confiancaSuficienteParaPrioridade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('modo manual: nunca confiante, mesmo com confiança alta e autonomia ligada', async () => {
    const resultado = await confiancaSuficienteParaPrioridade({ modo: 'manual', confianca: 0.99 });

    expect(resultado).toBe(false);
    expect(mockLerConfig).not.toHaveBeenCalled();
  });

  it('confiança nula: nunca confiante, mesmo em modo ia', async () => {
    const resultado = await confiancaSuficienteParaPrioridade({ modo: 'ia', confianca: null });

    expect(resultado).toBe(false);
    expect(mockLerConfig).not.toHaveBeenCalled();
  });

  it('autonomia desligada: não confiante mesmo com confiança alta e limite definido', async () => {
    mockLerConfig.mockResolvedValue({
      servico: { limiteConfianca: null, amostraMinima: 30 },
      prioridade: { limiteConfianca: 0.5, amostraMinima: 30 },
      autonomiaAtiva: false,
    });

    const resultado = await confiancaSuficienteParaPrioridade({ modo: 'ia', confianca: 0.9 });

    expect(resultado).toBe(false);
  });

  it('limiteConfianca nulo: autonomia impossível para prioridade, mesmo com o interruptor ligado (AC-7)', async () => {
    mockLerConfig.mockResolvedValue(configComAutonomia(null));

    const resultado = await confiancaSuficienteParaPrioridade({ modo: 'ia', confianca: 0.99 });

    expect(resultado).toBe(false);
  });

  it('confiança abaixo do limite: não confiante (AC-2)', async () => {
    mockLerConfig.mockResolvedValue(configComAutonomia(0.7));

    const resultado = await confiancaSuficienteParaPrioridade({ modo: 'ia', confianca: 0.69 });

    expect(resultado).toBe(false);
  });

  it('confiança igual ao limite: confiante (inclusive, AC-1)', async () => {
    mockLerConfig.mockResolvedValue(configComAutonomia(0.7));

    const resultado = await confiancaSuficienteParaPrioridade({ modo: 'ia', confianca: 0.7 });

    expect(resultado).toBe(true);
  });

  it('confiança acima do limite, autonomia ligada, modo ia: confiante (AC-1)', async () => {
    mockLerConfig.mockResolvedValue(configComAutonomia(0.5));

    const resultado = await confiancaSuficienteParaPrioridade({ modo: 'ia', confianca: 0.9 });

    expect(resultado).toBe(true);
  });
});
