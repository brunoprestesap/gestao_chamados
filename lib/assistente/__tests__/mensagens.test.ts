import { describe, expect, it } from 'vitest';

import { LLM_FAILURE_REASONS } from '@/lib/llm/types';

import {
  afirmaChamadoJaAberto,
  FORMULARIO_HREF,
  mensagemDeReserva,
  respostaSemAfirmarAbertura,
} from '../mensagens';

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

// ── AC-14: o modelo não manda dizer que o chamado já existe ──────

describe('afirmaChamadoJaAberto', () => {
  it('pega o modelo dizendo que o chamado já foi ou está aberto', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('O chamado foi aberto para reparo de vazamento.')).toBe(true);
    expect(afirmaChamadoJaAberto('O chamado já está aberto, obrigado por reportar.')).toBe(true);
  });

  it('pega o modelo dizendo que o chamado foi criado, registrado ou tem número', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('O chamado foi criado com sucesso.')).toBe(true);
    expect(afirmaChamadoJaAberto('Seu chamado foi registrado.')).toBe(true);
    expect(afirmaChamadoJaAberto('Já abrimos o seu chamado.')).toBe(true);
    expect(afirmaChamadoJaAberto('O número do chamado é 12345.')).toBe(true);
    expect(afirmaChamadoJaAberto('Guarde o protocolo do chamado.')).toBe(true);
  });

  it('pega um número de chamado inventado, mesmo sem a frase de abertura', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('Fica registrado como CHM-2026-00671.')).toBe(true);
  });

  it('deixa passar uma resposta comum, que só confirma o relato ou pergunta algo', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('Entendi que a lâmpada da sala 302 queimou.')).toBe(false);
    expect(afirmaChamadoJaAberto('Você pode dizer em que sala é o problema?')).toBe(false);
    expect(afirmaChamadoJaAberto('Esse é o segundo chamado que você abre este mês.')).toBe(false);
  });
});

describe('respostaSemAfirmarAbertura', () => {
  it('troca a resposta pela frase fixa quando ela afirma que o chamado já existe', () => {
    // Act
    const texto = respostaSemAfirmarAbertura('O chamado foi aberto. Obrigado por reportar.');

    // Assert
    expect(texto).not.toContain('O chamado foi aberto');
    expect(texto.toLowerCase()).toContain('nenhum chamado foi aberto ainda');
  });

  it('não mexe numa resposta que não afirma nada sobre o chamado existir', () => {
    // Arrange
    const original = 'Entendi que a lâmpada da sala 302 queimou. Pode confirmar o andar?';

    // Act & Assert
    expect(respostaSemAfirmarAbertura(original)).toBe(original);
  });
});

// ── para onde o link aponta ──────────────────────────────────────

describe('FORMULARIO_HREF', () => {
  it('aponta para a lista onde fica o botão de novo chamado', () => {
    // Assert
    expect(FORMULARIO_HREF).toBe('/meus-chamados');
  });
});
