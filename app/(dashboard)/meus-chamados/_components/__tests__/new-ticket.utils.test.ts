import { describe, expect, it, vi } from 'vitest';

import {
  buildTypeIdByTipo,
  normalizeTypeName,
  optionalSelectOnChange,
  optionalSelectValue,
} from '@/app/(dashboard)/meus-chamados/_components/new-ticket.utils';

// ── normalizeTypeName ────────────────────────────────────────────

describe('normalizeTypeName', () => {
  it('converte para minúsculo e remove acentos', () => {
    expect(normalizeTypeName('Manutenção Predial')).toBe('manutencao predial');
  });

  it('faz trim', () => {
    expect(normalizeTypeName('  Elevador  ')).toBe('elevador');
  });

  it('colapsa múltiplos espaços', () => {
    expect(normalizeTypeName('Ar   Condicionado')).toBe('ar condicionado');
  });

  it('string vazia retorna vazia', () => {
    expect(normalizeTypeName('')).toBe('');
  });
});

// ── buildTypeIdByTipo ────────────────────────────────────────────

describe('buildTypeIdByTipo', () => {
  const types = [
    { id: '1', name: 'Manutenção Predial' },
    { id: '2', name: 'Ar-Condicionado' },
    { id: '3', name: 'Elevador' },
  ];

  it('mapeia todos os tipos corretamente', () => {
    const map = buildTypeIdByTipo(types);
    expect(map.get('Manutenção Predial')).toBe('1');
    expect(map.get('Ar-Condicionado')).toBe('2');
    expect(map.get('Elevador')).toBe('3');
  });

  it('mapeia "Ar Condicionado" (sem hífen)', () => {
    const map = buildTypeIdByTipo([{ id: '99', name: 'Ar Condicionado' }]);
    expect(map.get('Ar-Condicionado')).toBe('99');
  });

  it('mapeia nome com acentos e case diferente', () => {
    const map = buildTypeIdByTipo([{ id: '50', name: 'MANUTENÇÃO PREDIAL' }]);
    expect(map.get('Manutenção Predial')).toBe('50');
  });

  it('ignora tipos não reconhecidos', () => {
    const map = buildTypeIdByTipo([{ id: '100', name: 'Pintura' }]);
    expect(map.size).toBe(0);
  });

  it('lista vazia retorna map vazio', () => {
    const map = buildTypeIdByTipo([]);
    expect(map.size).toBe(0);
  });
});

// ── optionalSelectValue ──────────────────────────────────────────

describe('optionalSelectValue', () => {
  it('retorna "none" para string vazia', () => {
    expect(optionalSelectValue('')).toBe('none');
  });

  it('retorna o valor se não vazio', () => {
    expect(optionalSelectValue('abc')).toBe('abc');
  });
});

// ── optionalSelectOnChange ───────────────────────────────────────

describe('optionalSelectOnChange', () => {
  it('converte "none" para string vazia', () => {
    const onChange = vi.fn();
    const wrapped = optionalSelectOnChange(onChange);
    wrapped('none');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('passa valor diretamente se não "none"', () => {
    const onChange = vi.fn();
    const wrapped = optionalSelectOnChange(onChange);
    wrapped('abc');
    expect(onChange).toHaveBeenCalledWith('abc');
  });
});
