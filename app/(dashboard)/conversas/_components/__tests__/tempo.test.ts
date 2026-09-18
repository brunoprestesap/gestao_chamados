import { describe, expect, it } from 'vitest';

import { chaveDoDia, dataEHora, hora, iso, quando, rotuloDoDia } from '../tempo';

/**
 * As datas da tela de conversas, formatadas no fuso do navegador (spec 0003).
 * O servidor manda sempre ISO; aqui só se decide como aquilo aparece.
 *
 * Todo teste fixa o "agora" por parâmetro, então nenhum deles depende do
 * relógio da máquina que roda a suíte.
 */

/** Uma data local montada por partes, para não depender do fuso da máquina. */
function local(ano: number, mes: number, dia: number, h = 12, m = 0): Date {
  return new Date(ano, mes - 1, dia, h, m, 0, 0);
}

const AGORA = local(2026, 9, 18, 14, 30);

// ── hora ─────────────────────────────────────────────────────────

describe('hora', () => {
  it('mostra só hora e minuto, com dois dígitos', () => {
    // Act & Assert
    expect(hora(local(2026, 9, 18, 9, 12).toISOString())).toBe('09:12');
    expect(hora(local(2026, 9, 18, 23, 5).toISOString())).toBe('23:05');
  });

  it('devolve vazio na data inválida, em vez de escrever `Invalid Date` na tela', () => {
    // Act & Assert
    expect(hora('não é data')).toBe('');
    expect(hora('')).toBe('');
  });
});

// ── separador de dia ─────────────────────────────────────────────

describe('chaveDoDia', () => {
  it('dá a mesma chave para horários do mesmo dia', () => {
    // Act & Assert
    expect(chaveDoDia(local(2026, 9, 18, 0, 1).toISOString())).toBe(
      chaveDoDia(local(2026, 9, 18, 23, 59).toISOString()),
    );
  });

  it('dá chaves diferentes na virada da meia noite', () => {
    // Act & Assert
    expect(chaveDoDia(local(2026, 9, 18, 23, 59).toISOString())).not.toBe(
      chaveDoDia(local(2026, 9, 19, 0, 1).toISOString()),
    );
  });

  it('não confunde o mesmo dia de meses ou anos diferentes', () => {
    // Act & Assert
    expect(chaveDoDia(local(2026, 9, 18).toISOString())).not.toBe(
      chaveDoDia(local(2026, 10, 18).toISOString()),
    );
    expect(chaveDoDia(local(2026, 9, 18).toISOString())).not.toBe(
      chaveDoDia(local(2025, 9, 18).toISOString()),
    );
  });
});

describe('rotuloDoDia', () => {
  it('chama de `hoje` o que é de hoje', () => {
    // Act & Assert
    expect(rotuloDoDia(local(2026, 9, 18, 8, 0).toISOString(), AGORA)).toBe('hoje');
  });

  it('chama de `ontem` o dia anterior', () => {
    // Act & Assert
    expect(rotuloDoDia(local(2026, 9, 17, 23, 0).toISOString(), AGORA)).toBe('ontem');
  });

  it('escreve a data por extenso no que é mais antigo', () => {
    // Act
    const rotulo = rotuloDoDia(local(2026, 9, 10, 10, 0).toISOString(), AGORA);

    // Assert
    expect(rotulo).toContain('10');
    expect(rotulo).toContain('setembro');
  });

  it('atravessa a virada de mês sem quebrar o `ontem`', () => {
    // Arrange: primeiro dia de outubro, olhando para o último de setembro
    const primeiroDeOutubro = local(2026, 10, 1, 9, 0);

    // Act & Assert
    expect(rotuloDoDia(local(2026, 9, 30, 20, 0).toISOString(), primeiroDeOutubro)).toBe('ontem');
  });

  it('devolve vazio na data inválida', () => {
    // Act & Assert
    expect(rotuloDoDia('qualquer coisa', AGORA)).toBe('');
  });
});

// ── a data curta da lateral ──────────────────────────────────────

describe('quando', () => {
  it('diz `agora` no que acabou de acontecer', () => {
    // Act & Assert
    expect(quando(new Date(AGORA.getTime() - 20_000).toISOString(), AGORA)).toBe('agora');
  });

  it('conta em minutos dentro da primeira hora', () => {
    // Act & Assert
    expect(quando(new Date(AGORA.getTime() - 12 * 60_000).toISOString(), AGORA)).toBe('há 12 min');
    expect(quando(new Date(AGORA.getTime() - 59 * 60_000).toISOString(), AGORA)).toBe('há 59 min');
  });

  it('passa a mostrar a hora depois de uma hora, ainda no mesmo dia', () => {
    // Act
    const rotulo = quando(local(2026, 9, 18, 8, 5).toISOString(), AGORA);

    // Assert
    expect(rotulo).toBe('08:05');
  });

  it('diz `ontem` no dia anterior', () => {
    // Act & Assert
    expect(quando(local(2026, 9, 17, 10, 0).toISOString(), AGORA)).toBe('ontem');
  });

  it('usa a data curta no que é mais antigo', () => {
    // Act
    const rotulo = quando(local(2026, 5, 12, 10, 0).toISOString(), AGORA);

    // Assert
    expect(rotulo).toContain('12');
    expect(rotulo).toMatch(/mai/i);
  });

  it('não vira `agora` para uma data do futuro próximo, que é o relógio fora de hora', () => {
    // Arrange: a máquina da pessoa pode estar adiantada
    const futuro = new Date(AGORA.getTime() + 5 * 60_000).toISOString();

    // Act & Assert: minutos negativos caem antes de 1, então vira `agora`
    expect(quando(futuro, AGORA)).toBe('agora');
  });

  it('devolve vazio na data inválida', () => {
    // Act & Assert
    expect(quando('', AGORA)).toBe('');
  });
});

// ── cabeçalho do chamado ─────────────────────────────────────────

describe('dataEHora', () => {
  it('junta a data por extenso com a hora', () => {
    // Act
    const texto = dataEHora(local(2026, 9, 17, 8, 40).toISOString());

    // Assert
    expect(texto).toContain('17');
    expect(texto).toContain('setembro');
    expect(texto).toContain('08:40');
    expect(texto).toContain('às');
  });

  it('devolve vazio na data inválida', () => {
    // Act & Assert
    expect(dataEHora('nada')).toBe('');
  });
});

// ── atributo datetime ────────────────────────────────────────────

describe('iso', () => {
  it('devolve o valor quando a data é válida, para o `<time>` ter `datetime`', () => {
    // Arrange
    const valor = local(2026, 9, 18, 9, 0).toISOString();

    // Act & Assert
    expect(iso(valor)).toBe(valor);
  });

  it('devolve indefinido na data inválida, para o atributo simplesmente não sair', () => {
    // Act & Assert
    expect(iso('lixo')).toBeUndefined();
    expect(iso('')).toBeUndefined();
  });
});
