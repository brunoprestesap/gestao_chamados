import { describe, expect, it } from 'vitest';

import { CONVERSA_FALHAS } from '@/shared/conversas/conversa.constants';

import { EXEMPLOS, FALHA_FRASES, FALHA_REDE, fraseDaFalha } from '../_constants';

/**
 * O texto fixo da tela (spec 0003). O que importa aqui é uma promessa só:
 * nenhum motivo de falha de `lib/conversas` chega cru aos olhos de ninguém.
 *
 * covers: AC-9 (frase própria por motivo), AC-3 (os três exemplos)
 */

// ── nenhum motivo cru na tela · AC-9 ─────────────────────────────

describe('fraseDaFalha', () => {
  it('tem frase própria para todo motivo de `lib/conversas`, sem exceção', () => {
    // Act & Assert: se a fundação ganhar um motivo novo, este teste cai
    for (const motivo of CONVERSA_FALHAS) {
      expect(FALHA_FRASES[motivo], `falta frase para ${motivo}`).toBeTruthy();
    }
    expect(Object.keys(FALHA_FRASES).sort()).toEqual([...CONVERSA_FALHAS].sort());
  });

  it('nunca devolve o motivo cru, em nenhum dos casos', () => {
    // Act & Assert
    for (const motivo of CONVERSA_FALHAS) {
      const frase = fraseDaFalha(motivo);
      expect(frase).not.toBe(motivo);
      expect(frase).not.toContain('_');
    }
  });

  it('escreve em português, com letra maiúscula e ponto final', () => {
    // Act & Assert
    for (const motivo of CONVERSA_FALHAS) {
      const frase = fraseDaFalha(motivo);
      expect(frase[0]).toBe(frase[0].toUpperCase());
      expect(frase.trim().endsWith('.')).toBe(true);
    }
  });

  it('cai na frase de rede quando não veio motivo nenhum', () => {
    // Act & Assert: é o caso de a requisição nem chegar ao servidor
    expect(fraseDaFalha(null)).toBe(FALHA_REDE);
    expect(fraseDaFalha(undefined)).toBe(FALHA_REDE);
    expect(fraseDaFalha('')).toBe(FALHA_REDE);
  });

  it('cai na frase de rede num motivo que o servidor nunca manda', () => {
    // Act & Assert: melhor uma frase genérica do que texto técnico vazando
    expect(fraseDaFalha('motivo_que_nao_existe')).toBe(FALHA_REDE);
  });

  it('explica o teto de 5 dizendo o que fazer, não só que falhou', () => {
    // Act
    const frase = fraseDaFalha('limite_rascunhos');

    // Assert
    expect(frase).toContain('5');
    expect(frase.toLowerCase()).toMatch(/descarte|termine/);
  });
});

// ── os exemplos da tela de boas vindas · AC-3 ────────────────────

describe('EXEMPLOS', () => {
  it('traz três relatos, um por tipo de serviço do catálogo', () => {
    // Assert
    expect(EXEMPLOS).toHaveLength(3);
    expect(EXEMPLOS.join(' ').toLowerCase()).toContain('ar condicionado');
    expect(EXEMPLOS.join(' ').toLowerCase()).toContain('lâmpada');
    expect(EXEMPLOS.join(' ').toLowerCase()).toContain('elevador');
  });

  it('são frases que uma pessoa escreveria, não rótulos de catálogo', () => {
    // Assert: relato em texto corrido, sem código nem nome de campo
    for (const exemplo of EXEMPLOS) {
      expect(exemplo.split(' ').length).toBeGreaterThan(4);
      expect(exemplo).not.toMatch(/[_{}[\]]/);
    }
  });
});
