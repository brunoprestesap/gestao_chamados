import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * O motor de leitura da câmera é servido pelo próprio app (spec 0011: nunca
 * do jsDelivr, a rede interna pode não ter saída). A cópia em `public/` tem
 * que ser o mesmo arquivo do `zxing-wasm` instalado; senão, ao atualizar o
 * `barcode-detector`, a câmera para de ler sem nenhum erro aparente.
 * Para atualizar a cópia: `npm run zxing:wasm`.
 */

const raiz = resolve(__dirname, '../../..');
const sha256 = (caminho: string) =>
  createHash('sha256')
    .update(readFileSync(resolve(raiz, caminho)))
    .digest('hex');

describe('public/zxing/zxing_reader.wasm', () => {
  it('é igual ao do zxing-wasm instalado (rode `npm run zxing:wasm` se falhar)', () => {
    expect(sha256('public/zxing/zxing_reader.wasm')).toBe(
      sha256('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'),
    );
  });
});
