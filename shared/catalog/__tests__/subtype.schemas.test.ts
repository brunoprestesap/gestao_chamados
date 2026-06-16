import { describe, expect, it } from 'vitest';

import { SubtypeCreateSchema, SubtypeUpdateSchema } from '@/shared/catalog/subtype.schemas';

const VALID_ID = 'a'.repeat(24);

describe('SubtypeCreateSchema', () => {
  it('aceita um subtipo válido com isActive default true', () => {
    const result = SubtypeCreateSchema.safeParse({ typeId: VALID_ID, name: 'Troca de lâmpadas' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.typeId).toBe(VALID_ID);
      expect(result.data.name).toBe('Troca de lâmpadas');
      expect(result.data.isActive).toBe(true);
    }
  });

  it('faz trim do nome', () => {
    const result = SubtypeCreateSchema.safeParse({ typeId: VALID_ID, name: '  Pintura  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Pintura');
  });

  it('rejeita typeId vazio', () => {
    const result = SubtypeCreateSchema.safeParse({ typeId: '', name: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejeita nome vazio', () => {
    const result = SubtypeCreateSchema.safeParse({ typeId: VALID_ID, name: '' });
    expect(result.success).toBe(false);
  });
});

describe('SubtypeUpdateSchema', () => {
  it('aceita objeto vazio (tudo opcional)', () => {
    const result = SubtypeUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('aceita atualização só de name', () => {
    const result = SubtypeUpdateSchema.safeParse({ name: 'Reparo' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Reparo');
      expect(result.data.typeId).toBeUndefined();
    }
  });

  it('aceita atualização só de isActive', () => {
    const result = SubtypeUpdateSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(false);
  });

  it('rejeita name vazio quando presente', () => {
    const result = SubtypeUpdateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});
