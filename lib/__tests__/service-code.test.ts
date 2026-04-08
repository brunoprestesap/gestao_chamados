import { describe, expect, it } from 'vitest';

import {
  buildServiceCode,
  formatSequential,
  getCodePrefixFromSubtypeName,
} from '@/lib/service-code';
import { getCodePrefixFromSubtypeName as frontendPrefix } from '@/shared/catalog/service.utils';

// ── getCodePrefixFromSubtypeName ─────────────────────────────────

describe('getCodePrefixFromSubtypeName', () => {
  it('gera prefixo de 4 caracteres maiúsculos', () => {
    expect(getCodePrefixFromSubtypeName('Elétrica')).toBe('ELET');
  });

  it('remove acentos', () => {
    expect(getCodePrefixFromSubtypeName('Manutenção')).toBe('MANU');
  });

  it('remove espaços e caracteres especiais', () => {
    expect(getCodePrefixFromSubtypeName('Ar Condicionado')).toBe('ARCO');
  });

  it('preenche com X quando nome curto', () => {
    expect(getCodePrefixFromSubtypeName('Ar')).toBe('ARXX');
  });

  it('nome vazio retorna XXXX', () => {
    expect(getCodePrefixFromSubtypeName('')).toBe('XXXX');
  });

  it('nome com 1 caractere', () => {
    expect(getCodePrefixFromSubtypeName('A')).toBe('AXXX');
  });

  it('nome com números', () => {
    expect(getCodePrefixFromSubtypeName('Tipo 2A')).toBe('TIPO');
  });

  it('nome com apenas caracteres especiais', () => {
    expect(getCodePrefixFromSubtypeName('---')).toBe('XXXX');
  });

  it('nome longo é truncado em 4', () => {
    expect(getCodePrefixFromSubtypeName('Hidráulica Predial')).toBe('HIDR');
  });
});

// ── Paridade frontend/backend ────────────────────────────────────

describe('frontend vs backend getCodePrefixFromSubtypeName', () => {
  const testCases = [
    'Manutenção',
    'Ar Condicionado',
    'Elétrica',
    'Hidráulica Predial',
    'Elevador',
    'Ar',
    '',
    '---',
    'Tipo 2A',
  ];

  it.each(testCases)('paridade para "%s"', (name) => {
    expect(frontendPrefix(name)).toBe(getCodePrefixFromSubtypeName(name));
  });
});

// ── formatSequential ─────────────────────────────────────────────

describe('formatSequential', () => {
  it('formata com 4 dígitos (zero-padded)', () => {
    expect(formatSequential(1)).toBe('0001');
    expect(formatSequential(42)).toBe('0042');
    expect(formatSequential(999)).toBe('0999');
    expect(formatSequential(9999)).toBe('9999');
  });

  it('0 retorna 0000', () => {
    expect(formatSequential(0)).toBe('0000');
  });

  it('número > 9999 não trunca', () => {
    expect(formatSequential(10000)).toBe('10000');
  });
});

// ── buildServiceCode ─────────────────────────────────────────────

describe('buildServiceCode', () => {
  it('monta código XXXX-NNNN', () => {
    expect(buildServiceCode('MANU', 42)).toBe('MANU-0042');
  });

  it('prefixo + sequencial 0', () => {
    expect(buildServiceCode('ELET', 0)).toBe('ELET-0000');
  });

  it('prefixo + sequencial grande', () => {
    expect(buildServiceCode('HIDR', 12345)).toBe('HIDR-12345');
  });
});
