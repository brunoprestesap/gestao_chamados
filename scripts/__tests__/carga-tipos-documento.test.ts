import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { TIPOS_DOCUMENTO_INICIAIS } from '@/shared/ativos/documento.constants';

/** Pares `{ chave, nome }` escritos à mão num script mongosh. */
function paresDoScript(arquivo: string): { chave: string; nome: string }[] {
  const texto = fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf-8');
  return [...texto.matchAll(/\{ chave: '([a-z0-9_]+)', nome: '([^']+)' \}/g)].map((m) => ({
    chave: m[1],
    nome: m[2],
  }));
}

describe('carga dos tipos de documento (spec 0013, AC-1)', () => {
  it('o script de produção cria os mesmos cinco tipos da constante', () => {
    expect(paresDoScript('carga-tipos-documento.js')).toEqual([...TIPOS_DOCUMENTO_INICIAIS]);
  });

  it('o seed cria os mesmos cinco tipos da constante', () => {
    expect(paresDoScript('seed.js')).toEqual([...TIPOS_DOCUMENTO_INICIAIS]);
  });
});
