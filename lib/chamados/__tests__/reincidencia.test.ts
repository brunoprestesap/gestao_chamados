import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLean = vi.fn();
const mockFind = vi.fn((..._args: unknown[]) => ({ select: () => ({ lean: mockLean }) })); // eslint-disable-line @typescript-eslint/no-unused-vars
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: { find: (...args: unknown[]) => mockFind(...args) },
}));

import { numerosDosChamadosAnteriores } from '../reincidencia';

/**
 * O `#N` de "Reincidência do chamado #N" (spec 0010, AC-12): uma consulta só
 * por página, e nenhuma quando nenhum chamado tem anterior.
 *
 * covers: AC-12
 */

const A = new Types.ObjectId();
const B = new Types.ObjectId();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('numerosDosChamadosAnteriores', () => {
  it('não consulta o banco quando ninguém tem anterior', async () => {
    // Act
    const numeros = await numerosDosChamadosAnteriores([{}, { chamadoAnteriorId: null }]);

    // Assert
    expect(numeros.size).toBe(0);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('busca os anteriores numa consulta só, sem repetir id', async () => {
    // Arrange
    mockLean.mockResolvedValue([
      { _id: A, ticket_number: 'CHM-1' },
      { _id: B, ticket_number: 'CHM-2' },
    ]);

    // Act
    const numeros = await numerosDosChamadosAnteriores([
      { chamadoAnteriorId: A },
      { chamadoAnteriorId: A },
      { chamadoAnteriorId: B },
    ]);

    // Assert
    expect(mockFind).toHaveBeenCalledOnce();
    expect(mockFind.mock.calls[0][0]).toEqual({ _id: { $in: [String(A), String(B)] } });
    expect(numeros.get(String(A))).toBe('CHM-1');
    expect(numeros.get(String(B))).toBe('CHM-2');
  });

  it('ignora id que não é ObjectId válido', async () => {
    // Act
    const numeros = await numerosDosChamadosAnteriores([{ chamadoAnteriorId: 'lixo' }]);

    // Assert
    expect(numeros.size).toBe(0);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('anterior apagado fica sem número, sem quebrar', async () => {
    // Arrange
    mockLean.mockResolvedValue([]);

    // Act
    const numeros = await numerosDosChamadosAnteriores([{ chamadoAnteriorId: A }]);

    // Assert
    expect(numeros.has(String(A))).toBe(false);
  });
});
