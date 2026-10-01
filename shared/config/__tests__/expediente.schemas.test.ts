import { describe, expect, it } from 'vitest';

import { ExpedienteConfigSchema } from '../expediente.schemas';

/**
 * O prazo para avaliar na configuração do expediente (spec 0010, AC-13):
 * inteiro de 1 a 720, opcional para o cliente antigo continuar salvando.
 *
 * covers: AC-13
 */

const BASE = {
  timezone: 'America/Belem',
  workdayStart: '08:00',
  workdayEnd: '18:00',
  weekdays: [1, 2, 3, 4, 5],
};

function erroDoPrazo(valor: unknown): string | undefined {
  const r = ExpedienteConfigSchema.safeParse({ ...BASE, prazoAvaliacaoHoras: valor });
  return r.success ? undefined : r.error.flatten().fieldErrors.prazoAvaliacaoHoras?.[0];
}

describe('ExpedienteConfigSchema · prazoAvaliacaoHoras', () => {
  it.each([1, 48, 720])('aceita %i horas', (horas) => {
    // Act
    const r = ExpedienteConfigSchema.safeParse({ ...BASE, prazoAvaliacaoHoras: horas });

    // Assert
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.prazoAvaliacaoHoras).toBe(horas);
  });

  it('aceita a configuração sem o campo (cliente antigo)', () => {
    // Act
    const r = ExpedienteConfigSchema.safeParse(BASE);

    // Assert
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.prazoAvaliacaoHoras).toBeUndefined();
  });

  it('recusa zero com a mensagem do mínimo', () => {
    expect(erroDoPrazo(0)).toBe('O prazo para avaliar deve ter pelo menos 1 hora');
  });

  it('recusa 721 com a mensagem do máximo', () => {
    expect(erroDoPrazo(721)).toBe('O prazo para avaliar deve ter no máximo 720 horas');
  });

  it('recusa horas quebradas', () => {
    expect(erroDoPrazo(1.5)).toBe('O prazo para avaliar deve ser um número inteiro de horas');
  });

  it('recusa texto no lugar do número', () => {
    expect(erroDoPrazo('48')).toBe('Informe o prazo para avaliar em horas');
  });

  it('recusa valor negativo', () => {
    expect(erroDoPrazo(-3)).toBeDefined();
  });
});
