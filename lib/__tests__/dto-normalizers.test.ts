import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  normalizeMateriaisForaCotacao,
  normalizeMaterialObservations,
} from '@/lib/dto-normalizers';

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

describe('normalizeMateriaisForaCotacao (spec 0018)', () => {
  it('converte ids e data e traz o nome de quem lançou', () => {
    // Arrange
    const _id = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const criadoEm = new Date('2026-10-08T12:00:00.000Z');
    const nomes = new Map([[String(userId), 'Ana']]);

    // Act
    const r = normalizeMateriaisForaCotacao(
      [
        {
          _id,
          descricao: 'Cabo',
          quantidade: 2.5,
          valorUnitario: 10,
          criadoPorUserId: userId,
          criadoEm,
        },
      ],
      nomes,
    );

    // Assert
    expect(r).toEqual([
      {
        _id: String(_id),
        descricao: 'Cabo',
        quantidade: 2.5,
        valorUnitario: 10,
        criadoPorUserId: String(userId),
        criadoPorNome: 'Ana',
        criadoEm: '2026-10-08T12:00:00.000Z',
      },
    ]);
  });

  it('usuário fora do mapa vira nome vazio, sem quebrar', () => {
    const r = normalizeMateriaisForaCotacao(
      [
        {
          _id: new Types.ObjectId(),
          descricao: 'X',
          quantidade: 1,
          valorUnitario: 1,
          criadoPorUserId: new Types.ObjectId(),
        },
      ],
      new Map(),
    );
    expect(r[0]).toMatchObject({ criadoPorNome: '', criadoEm: '' });
  });

  it('campo ausente ou que não é lista vira lista vazia', () => {
    expect(normalizeMateriaisForaCotacao(undefined, new Map())).toEqual([]);
    expect(normalizeMateriaisForaCotacao(null, new Map())).toEqual([]);
    expect(normalizeMateriaisForaCotacao({}, new Map())).toEqual([]);
  });
});
