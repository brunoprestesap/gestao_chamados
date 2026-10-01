/**
 * Gera `scripts/carga-ativos.generated.js` (mongosh) a partir de
 * `docs/ativos_sicam.csv`, só com as linhas do Tier A (spec 0011, AC-8).
 *
 *   npx tsx scripts/gerar-carga-ativos.ts [caminho do csv] [caminho de saída]
 *   docker exec -i severino-mongodb-1 mongosh manutencao < scripts/carga-ativos.generated.js
 *
 * Categoria desconhecida ou código divergente do tombamento fazem o gerador
 * falhar antes de escrever qualquer coisa. O CSV e o script gerado ficam fora
 * do git (LGPD).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ErroCarga, montarCarga } from '../lib/ativos/carga';
import { gerarScriptCarga } from '../lib/ativos/carga-script';

const entrada = resolve(process.argv[2] ?? 'docs/ativos_sicam.csv');
const saida = resolve(process.argv[3] ?? 'scripts/carga-ativos.generated.js');

try {
  const ativos = montarCarga(readFileSync(entrada, 'utf-8'));
  writeFileSync(saida, gerarScriptCarga(ativos), 'utf-8');
  const porCategoria = new Map<string, number>();
  for (const a of ativos) {
    porCategoria.set(a.categoriaChave, (porCategoria.get(a.categoriaChave) ?? 0) + 1);
  }
  console.warn(`${ativos.length} ativos do Tier A escritos em ${saida}`);
  for (const [chave, n] of [...porCategoria].sort()) console.warn(`  ${chave}: ${n}`);
} catch (e) {
  console.error(e instanceof ErroCarga ? `Carga recusada: ${e.message}` : e);
  process.exit(1);
}
