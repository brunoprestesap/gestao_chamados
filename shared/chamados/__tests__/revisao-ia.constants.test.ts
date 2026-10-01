import { describe, expect, it } from 'vitest';

import {
  REVISAO_IA_RECORTE_LABELS,
  REVISAO_IA_RECORTE_VAZIO,
  REVISAO_IA_RECORTES,
} from '@/shared/chamados/revisao-ia.constants';

/**
 * O recorte "Revisão da IA" da lista de Gestão (spec 0009, AC-1 a AC-3): os
 * quatro valores que a query aceita, cada um com rótulo e frase de vazio.
 */

describe('REVISAO_IA_RECORTES', () => {
  it('tem exatamente os quatro recortes da spec', () => {
    expect([...REVISAO_IA_RECORTES].sort()).toEqual(
      ['corrigidos', 'sem_revisao', 'sem_tecnico', 'triagem'].sort(),
    );
  });

  it('não tem recorte repetido', () => {
    const unicos = new Set(REVISAO_IA_RECORTES);
    expect(unicos.size).toBe(REVISAO_IA_RECORTES.length);
  });
});

describe('REVISAO_IA_RECORTE_LABELS', () => {
  it('tem um rótulo para cada recorte, sem sobra', () => {
    const comRotulo = Object.keys(REVISAO_IA_RECORTE_LABELS).sort();
    expect(comRotulo).toEqual([...REVISAO_IA_RECORTES].sort());
  });

  it('nenhum rótulo é vazio', () => {
    const rotulos = Object.values(REVISAO_IA_RECORTE_LABELS);
    expect(rotulos.every((rotulo) => rotulo.trim().length > 0)).toBe(true);
  });
});

describe('REVISAO_IA_RECORTE_VAZIO', () => {
  it('tem uma frase para cada recorte, sem sobra', () => {
    const comFrase = Object.keys(REVISAO_IA_RECORTE_VAZIO).sort();
    expect(comFrase).toEqual([...REVISAO_IA_RECORTES].sort());
  });

  it('nenhuma frase é vazia', () => {
    const frases = Object.values(REVISAO_IA_RECORTE_VAZIO);
    expect(frases.every((frase) => frase.trim().length > 0)).toBe(true);
  });
});
