import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockLean = vi.fn();
vi.mock('@/models/BusinessCalendar', () => ({
  BusinessCalendarModel: {
    findOne: () => ({ sort: () => ({ lean: mockLean }) }),
  },
}));

import { getBusinessCalendarConfig } from '../expediente-config';

/**
 * A configuração vigente devolve o prazo para avaliar (spec 0010). Documento
 * ausente, campo ausente ou valor fora da faixa caem no padrão de 48 horas.
 *
 * covers: AC-1, AC-13
 */

const DOC = {
  timezone: 'America/Manaus',
  workdayStart: '07:00',
  workdayEnd: '17:00',
  weekdays: [1, 2, 3, 4, 5],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getBusinessCalendarConfig · prazoAvaliacaoHoras', () => {
  it('sem documento, devolve os padrões com 48 horas', async () => {
    // Arrange
    mockLean.mockResolvedValue(null);

    // Act
    const config = await getBusinessCalendarConfig();

    // Assert
    expect(config).toEqual({
      timezone: 'America/Belem',
      workdayStart: '08:00',
      workdayEnd: '18:00',
      weekdays: [1, 2, 3, 4, 5],
      prazoAvaliacaoHoras: 48,
    });
  });

  it('devolve o prazo gravado pelo Admin', async () => {
    // Arrange
    mockLean.mockResolvedValue({ ...DOC, prazoAvaliacaoHoras: 24 });

    // Act
    const config = await getBusinessCalendarConfig();

    // Assert
    expect(config.prazoAvaliacaoHoras).toBe(24);
    expect(config.timezone).toBe('America/Manaus');
  });

  it('documento anterior à spec 0010, sem o campo, usa 48 horas', async () => {
    // Arrange
    mockLean.mockResolvedValue(DOC);

    // Act / Assert
    expect((await getBusinessCalendarConfig()).prazoAvaliacaoHoras).toBe(48);
  });

  it.each([0, 721, 2.5, null])('valor fora da faixa (%s) volta a 48 horas', async (valor) => {
    // Arrange
    mockLean.mockResolvedValue({ ...DOC, prazoAvaliacaoHoras: valor });

    // Act / Assert
    expect((await getBusinessCalendarConfig()).prazoAvaliacaoHoras).toBe(48);
  });
});
