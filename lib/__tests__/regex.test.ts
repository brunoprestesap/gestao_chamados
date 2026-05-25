import { describe, expect, it } from 'vitest';

import { escapeRegex } from '@/lib/regex';

describe('escapeRegex', () => {
  it('mantém texto sem metacaracteres inalterado', () => {
    expect(escapeRegex('Manutencao Predial')).toBe('Manutencao Predial');
  });

  it('escapa parênteses (caso real de department do AD)', () => {
    expect(escapeRegex('Seção (Manutenção)')).toBe('Seção \\(Manutenção\\)');
  });

  it('escapa colchetes — evita "range out of order in character class"', () => {
    expect(escapeRegex('Setor [TI]')).toBe('Setor \\[TI\\]');
  });

  it('escapa todos os metacaracteres de regex', () => {
    expect(escapeRegex('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('produz um padrão válido e que casa o literal quando ancorado', () => {
    const department = 'Seção (A-Z) [test]';
    // Antes do escape, `new RegExp` deste valor lançaria SyntaxError.
    const re = new RegExp(`^${escapeRegex(department)}$`, 'i');
    expect(re.test(department)).toBe(true);
    expect(re.test('seção (a-z) [test]')).toBe(true); // case-insensitive
    expect(re.test('Seção XYZ')).toBe(false);
  });

  it('não casa como curinga (metacaractere tratado como literal)', () => {
    const re = new RegExp(`^${escapeRegex('a.c')}$`);
    expect(re.test('a.c')).toBe(true);
    expect(re.test('abc')).toBe(false);
  });
});
