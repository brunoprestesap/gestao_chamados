import { describe, expect, it } from 'vitest';

import { LLM_FAILURE_REASONS } from '@/lib/llm/types';

import { FORMULARIO_HREF, mensagemDeReserva } from '../mensagens';

/**
 * Os textos fixos do Sigma para quando a IA não responde (spec 0003).
 * A promessa é dupla: a pessoa sabe que o relato está salvo, e sempre há uma
 * saída pelo formulário. Nunca é texto do modelo, porque o modelo falhou.
 *
 * covers: AC-7 (mensagem de reserva com texto do Sigma e link do formulário)
 */

/** Todo motivo que `lib/llm` pode devolver, inclusive os de fora da lista de falhas. */
const TODOS = [...LLM_FAILURE_REASONS, 'disabled', 'cancelled'] as const;

// ── cobertura dos motivos · AC-7 ─────────────────────────────────

describe('mensagemDeReserva', () => {
  it('responde a todo motivo que `lib/llm` pode devolver', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      const texto = mensagemDeReserva(motivo);
      expect(texto, `sem texto para ${motivo}`).toBeTruthy();
      expect(texto.length).toBeGreaterThan(40);
    }
  });

  it('diz em toda frase que o relato continua salvo', () => {
    // Act & Assert: é o que impede a pessoa de achar que perdeu o que escreveu
    for (const motivo of TODOS) {
      expect(mensagemDeReserva(motivo).toLowerCase(), motivo).toContain('salvo');
    }
  });

  it('oferece o formulário em toda frase, que é a saída sem a IA', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      expect(mensagemDeReserva(motivo).toLowerCase(), motivo).toContain('formulário');
    }
  });

  it('nunca vaza o motivo técnico nem endereço', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      const texto = mensagemDeReserva(motivo);
      expect(texto).not.toContain(motivo);
      expect(texto).not.toMatch(/http|vLLM|LLM_|localhost/i);
    }
  });

  it('escreve em português, com maiúscula no começo e ponto no fim', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      const texto = mensagemDeReserva(motivo);
      expect(texto[0]).toBe(texto[0].toUpperCase());
      expect(texto.trim().endsWith('.')).toBe(true);
    }
  });
});

// ── frases que se distinguem onde importa · AC-7 ─────────────────

describe('mensagemDeReserva, por motivo', () => {
  it('diz que está desligado quando está desligado, em vez de fingir defeito', () => {
    // Act & Assert
    expect(mensagemDeReserva('disabled').toLowerCase()).toContain('desligado');
  });

  it('fala de demora no prazo estourado', () => {
    // Act & Assert
    expect(mensagemDeReserva('timeout').toLowerCase()).toMatch(/demor/);
  });

  it('pede um minuto quando é a pessoa que mandou mensagem demais', () => {
    // Act & Assert
    expect(mensagemDeReserva('rate_limited').toLowerCase()).toMatch(/seguidas|minuto/);
  });

  it('explica o descarte quando a resposta foi reprovada pelo schema', () => {
    // Act & Assert
    expect(mensagemDeReserva('invalid_output').toLowerCase()).toMatch(/descartada|não entendeu/);
  });

  it('cai no texto padrão num motivo desconhecido, sem lançar', () => {
    // Act
    const texto = mensagemDeReserva('motivo_novo' as never);

    // Assert
    expect(texto).toBeTruthy();
    expect(texto.toLowerCase()).toContain('formulário');
  });
});

// ── para onde o link aponta ──────────────────────────────────────

describe('FORMULARIO_HREF', () => {
  it('aponta para a lista onde fica o botão de novo chamado', () => {
    // Assert
    expect(FORMULARIO_HREF).toBe('/meus-chamados');
  });
});
