import { describe, expect, it } from 'vitest';

import { TypeCreateSchema, TypeUpdateSchema } from '@/shared/catalog/type.schemas';

describe('TypeCreateSchema', () => {
  it('aceita um tipo válido e mantém isActive default true', () => {
    const result = TypeCreateSchema.safeParse({ name: 'Manutenção Predial' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Manutenção Predial');
      expect(result.data.isActive).toBe(true);
    }
  });

  it('faz trim do nome', () => {
    const result = TypeCreateSchema.safeParse({ name: '  Elevador  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Elevador');
  });

  it('rejeita nome vazio', () => {
    const result = TypeCreateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejeita nome ausente', () => {
    const result = TypeCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('respeita isActive explícito', () => {
    const result = TypeCreateSchema.safeParse({ name: 'Ar-Condicionado', isActive: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(false);
  });
});

describe('TypeUpdateSchema', () => {
  it('aceita objeto vazio (tudo opcional)', () => {
    const result = TypeUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('aceita atualização só de isActive', () => {
    const result = TypeUpdateSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
      expect(result.data.name).toBeUndefined();
    }
  });

  it('aplica trim quando name está presente', () => {
    const result = TypeUpdateSchema.safeParse({ name: '  Novo  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Novo');
  });

  it('rejeita name vazio quando presente', () => {
    const result = TypeUpdateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});
