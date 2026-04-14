import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { normalizeMaterialObservations } from '@/lib/dto-normalizers';

describe('normalizeMaterialObservations', () => {
  it('deve normalizar array com observações válidas', () => {
    const objectId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const now = new Date();

    const raw = [
      {
        _id: objectId,
        description: 'Lâmpadas T8',
        createdByUserId: userId,
        createdByName: 'Técnico Silva',
        createdAt: now,
      },
    ];

    const result = normalizeMaterialObservations(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      _id: String(objectId),
      description: 'Lâmpadas T8',
      createdByUserId: String(userId),
      createdByName: 'Técnico Silva',
      createdAt: now.toISOString(),
    });
  });

  it('deve retornar array vazio para input undefined', () => {
    expect(normalizeMaterialObservations(undefined)).toEqual([]);
  });

  it('deve retornar array vazio para input null', () => {
    expect(normalizeMaterialObservations(null)).toEqual([]);
  });

  it('deve retornar array vazio para input não-array', () => {
    expect(normalizeMaterialObservations('string')).toEqual([]);
    expect(normalizeMaterialObservations(42)).toEqual([]);
    expect(normalizeMaterialObservations({})).toEqual([]);
  });

  it('deve retornar array vazio para array vazio', () => {
    expect(normalizeMaterialObservations([])).toEqual([]);
  });

  it('deve lidar com campos ausentes usando defaults', () => {
    const raw = [{ description: 'Material X' }];

    const result = normalizeMaterialObservations(raw);

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBeNull();
    expect(result[0].createdByUserId).toBe('');
    expect(result[0].createdByName).toBe('');
    expect(result[0].createdAt).toBe('');
  });

  it('deve converter _id null para null (não string)', () => {
    const raw = [
      {
        _id: null,
        description: 'Material Y',
        createdByUserId: new Types.ObjectId(),
        createdByName: '',
        createdAt: new Date(),
      },
    ];

    const result = normalizeMaterialObservations(raw);
    expect(result[0]._id).toBeNull();
  });

  it('deve normalizar múltiplas observações preservando ordem', () => {
    const raw = [
      { description: 'Primeiro', createdByName: 'A', createdAt: new Date('2026-01-01') },
      { description: 'Segundo', createdByName: 'B', createdAt: new Date('2026-01-02') },
      { description: 'Terceiro', createdByName: 'C', createdAt: new Date('2026-01-03') },
    ];

    const result = normalizeMaterialObservations(raw);

    expect(result).toHaveLength(3);
    expect(result[0].description).toBe('Primeiro');
    expect(result[1].description).toBe('Segundo');
    expect(result[2].description).toBe('Terceiro');
  });
});
