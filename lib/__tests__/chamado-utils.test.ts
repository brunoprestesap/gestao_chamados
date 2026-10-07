import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Caminhos de erro de `generateTicketNumber` (scope, feature 29), com os models
 * trocados por dublês. A sequência e a corrida ficam no teste de banco
 * (`chamado-numero.db.test.ts`); aqui ficam as falhas que o banco de verdade não
 * produz sob demanda.
 */

const contador = vi.hoisted(() => ({ findOneAndUpdate: vi.fn(), create: vi.fn() }));
const chamado = vi.hoisted(() => ({ findOne: vi.fn() }));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/Contador', () => ({ ContadorModel: contador }));
vi.mock('@/models/Chamado', () => ({ ChamadoModel: chamado }));

import { generateTicketNumber } from '@/lib/chamado-utils';

/** `findOneAndUpdate(...).lean()` devolvendo, em ordem, cada valor dado. */
function incrementos(...valores: Array<{ seq: number } | null>) {
  for (const v of valores) {
    contador.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve(v) });
  }
}

/** `findOne(...).sort().select().lean()` devolvendo o último número gravado. */
function ultimoChamado(ticketNumber: string | null) {
  const consulta = {
    sort: () => consulta,
    select: () => consulta,
    lean: () => Promise.resolve(ticketNumber ? { ticket_number: ticketNumber } : null),
  };
  chamado.findOne.mockReturnValue(consulta);
}

describe('generateTicketNumber', () => {
  const ano = new Date().getFullYear();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa o contador do ano sem consultar os chamados quando ele já existe', async () => {
    // Arrange
    incrementos({ seq: 7 });

    // Act
    const numero = await generateTicketNumber();

    // Assert
    expect(numero).toBe(`CHM-${ano}-00007`);
    expect(contador.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: `chamado_${ano}` },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' },
    );
    expect(chamado.findOne).not.toHaveBeenCalled();
  });

  it('não corta o número quando passa de cinco dígitos', async () => {
    // Arrange
    incrementos({ seq: 123456 });

    // Act / Assert
    await expect(generateTicketNumber()).resolves.toBe(`CHM-${ano}-123456`);
  });

  it('semeia o contador com o maior número gravado e então incrementa', async () => {
    // Arrange
    incrementos(null, { seq: 42 });
    ultimoChamado(`CHM-${ano}-00041`);
    contador.create.mockResolvedValueOnce({});

    // Act
    const numero = await generateTicketNumber();

    // Assert
    expect(contador.create).toHaveBeenCalledWith({ _id: `chamado_${ano}`, seq: 41 });
    expect(numero).toBe(`CHM-${ano}-00042`);
  });

  it('semeia com zero quando o número gravado não segue o formato', async () => {
    // Arrange
    incrementos(null, { seq: 1 });
    ultimoChamado(`CHM-${ano}-`);
    contador.create.mockResolvedValueOnce({});

    // Act
    await generateTicketNumber();

    // Assert
    expect(contador.create).toHaveBeenCalledWith({ _id: `chamado_${ano}`, seq: 0 });
  });

  it('segue normalmente quando outra geração semeou primeiro (E11000)', async () => {
    // Arrange
    incrementos(null, { seq: 3 });
    ultimoChamado(null);
    contador.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));

    // Act / Assert
    await expect(generateTicketNumber()).resolves.toBe(`CHM-${ano}-00003`);
  });

  it('propaga outro erro ao semear, sem inventar número', async () => {
    // Arrange
    incrementos(null);
    ultimoChamado(null);
    contador.create.mockRejectedValueOnce(new Error('banco caiu'));

    // Act / Assert
    await expect(generateTicketNumber()).rejects.toThrow('banco caiu');
    expect(contador.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('lança quando o contador continua indisponível depois de semear', async () => {
    // Arrange
    incrementos(null, null);
    ultimoChamado(null);
    contador.create.mockResolvedValueOnce({});

    // Act / Assert
    await expect(generateTicketNumber()).rejects.toThrow(
      'Contador de número de chamado indisponível.',
    );
  });
});
