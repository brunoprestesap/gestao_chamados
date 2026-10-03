import path from 'path';
import { describe, expect, it } from 'vitest';

import { montarNomeEmDisco, resolverCaminhoSeguro } from '../arquivo';

/**
 * As partes do apoio de upload que a extração criou (spec 0013): o nome em
 * disco e a guarda de caminho. `sanitizeFilename` e `detectMimeType` estão em
 * `app/api/upload/__tests__/upload-utils.test.ts`.
 */

describe('montarNomeEmDisco', () => {
  it('prefixa o instante e mantém o nome sanitizado com a extensão', () => {
    expect(montarNomeEmDisco('Laudo PMOC.pdf', 'application/pdf', 1700)).toBe(
      '1700-Laudo_PMOC.pdf',
    );
  });

  it('sem extensão usa a do tipo real detectado', () => {
    expect(montarNomeEmDisco('scan', 'image/png', 1)).toBe('1-scan.png');
  });

  it('caminho no nome some (só o último trecho fica)', () => {
    expect(montarNomeEmDisco('..\\..\\windows\\evil.pdf', 'application/pdf', 1)).toBe('1-evil.pdf');
    expect(montarNomeEmDisco('../../etc/passwd', 'application/pdf', 1)).toBe('1-passwd.pdf');
  });

  it('nome vazio vira "arquivo"', () => {
    expect(montarNomeEmDisco('', 'application/pdf', 1)).toBe('1-arquivo.pdf');
  });
});

describe('resolverCaminhoSeguro', () => {
  const base = path.resolve('/dados/uploads/documentos');

  it('monta pasta e arquivo dentro da base', () => {
    const r = resolverCaminhoSeguro(base, 'abc', '1-x.pdf');
    expect(r).toEqual({ dir: path.join(base, 'abc'), arquivo: path.join(base, 'abc', '1-x.pdf') });
  });

  it('sem filename devolve só a pasta', () => {
    expect(resolverCaminhoSeguro(base, 'abc')).toEqual({
      dir: path.join(base, 'abc'),
      arquivo: null,
    });
  });

  it('subpasta que sobe da base é recusada', () => {
    expect(resolverCaminhoSeguro(base, '../fora')).toBeNull();
    expect(resolverCaminhoSeguro(base, '../documentos-irmao')).toBeNull();
  });

  it('arquivo que sobe da pasta é recusado', () => {
    expect(resolverCaminhoSeguro(base, 'abc', '../outro/x.pdf')).toBeNull();
    expect(resolverCaminhoSeguro(base, 'abc', '')).toBeNull();
  });
});
