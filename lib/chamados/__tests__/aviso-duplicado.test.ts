import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFind = vi.hoisted(() => vi.fn());
vi.mock('@/models/Chamado', () => ({ ChamadoModel: { find: mockFind } }));

import { avisoDuplicadoParaGestao, numerosDosAvisosDuplicado } from '../aviso-duplicado';

/**
 * "Possível duplicado de #N" na gestão (spec 0017): os números lidos na hora,
 * uma consulta por página, e o id que não existe mais omitido.
 *
 * covers: AC-13
 */

const a = new Types.ObjectId();
const b = new Types.ObjectId();

function respostaDoBanco(docs: { _id: Types.ObjectId; ticket_number: string }[]) {
  mockFind.mockReturnValue({ select: () => ({ lean: async () => docs }) });
}

beforeEach(() => mockFind.mockReset());

describe('numerosDosAvisosDuplicado', () => {
  it('lê os números de todos os ids da página numa consulta só, sem repetir', async () => {
    // Arrange
    respostaDoBanco([{ _id: a, ticket_number: 'CHM-2026-00001' }]);

    // Act
    const numeros = await numerosDosAvisosDuplicado([
      { avisoDuplicado: { chamadoIds: [a, b] } },
      { avisoDuplicado: { chamadoIds: [a] } },
      { avisoDuplicado: null },
      {},
    ]);

    // Assert
    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFind.mock.calls[0][0]).toEqual({ _id: { $in: [String(a), String(b)] } });
    expect(numeros.get(String(a))).toBe('CHM-2026-00001');
  });

  it('página sem aviso nenhum não consulta o banco', async () => {
    await numerosDosAvisosDuplicado([{ avisoDuplicado: null }, {}]);
    expect(mockFind).not.toHaveBeenCalled();
  });
});

describe('avisoDuplicadoParaGestao', () => {
  const numeros = new Map([[String(a), 'CHM-2026-00001']]);

  it('devolve os parecidos na ordem do cartão, com número', () => {
    expect(avisoDuplicadoParaGestao({ avisoDuplicado: { chamadoIds: [a] } }, numeros)).toEqual([
      { chamadoId: String(a), ticketNumber: 'CHM-2026-00001' },
    ]);
  });

  it('omite o id que não existe mais', () => {
    expect(avisoDuplicadoParaGestao({ avisoDuplicado: { chamadoIds: [b, a] } }, numeros)).toEqual([
      { chamadoId: String(a), ticketNumber: 'CHM-2026-00001' },
    ]);
  });

  it('sem nenhum id válido, a linha não aparece (null)', () => {
    expect(avisoDuplicadoParaGestao({ avisoDuplicado: { chamadoIds: [b] } }, numeros)).toBeNull();
    expect(avisoDuplicadoParaGestao({ avisoDuplicado: null }, numeros)).toBeNull();
    expect(avisoDuplicadoParaGestao({}, numeros)).toBeNull();
  });
});
