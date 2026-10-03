import 'server-only';

import fs from 'fs/promises';
import path from 'path';

import { resolverCaminhoSeguro, UPLOADS_ROOT } from '@/lib/uploads/arquivo';

/** Pasta dos documentos: `data/uploads/documentos/<documentoId>/<filename>`. */
export const DOCUMENTOS_BASE = path.resolve(UPLOADS_ROOT, 'documentos');

/** Caminho do arquivo em disco, montado só do `_id` e do `filename` gravado pelo servidor. */
export function caminhoDoArquivo(documentoId: string, filename: string): string | null {
  return resolverCaminhoSeguro(DOCUMENTOS_BASE, documentoId, filename)?.arquivo ?? null;
}

export async function gravarArquivo(
  documentoId: string,
  filename: string,
  conteudo: Uint8Array,
): Promise<string | null> {
  const destino = resolverCaminhoSeguro(DOCUMENTOS_BASE, documentoId, filename);
  if (!destino?.arquivo) return null;
  await fs.mkdir(destino.dir, { recursive: true });
  await fs.writeFile(destino.arquivo, conteudo);
  return destino.arquivo;
}

/** Apaga o arquivo e a pasta do documento que não chegou a ser gravado. Nunca lança. */
export async function apagarArquivo(documentoId: string): Promise<void> {
  const destino = resolverCaminhoSeguro(DOCUMENTOS_BASE, documentoId);
  if (!destino) return;
  try {
    await fs.rm(destino.dir, { recursive: true, force: true });
  } catch (e) {
    console.error('[documentos] não deu para apagar o arquivo recusado:', e);
  }
}
