import 'server-only';

import path from 'path';

/**
 * Apoio comum de upload: anexos de chamado (`app/api/upload`) e documentos de
 * ativo (`app/api/ativos/documentos`). Fica fora de `public/` para exigir sessão
 * na hora de servir.
 */
export const UPLOADS_ROOT = path.resolve(process.cwd(), 'data', 'uploads');

/** Assinaturas (bytes iniciais) dos tipos aceitos. */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/webp': [
    // RIFF....WEBP
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
};

/** Tipo real do arquivo pelos bytes iniciais, nunca pela extensão. */
export function detectMimeType(buffer: Uint8Array): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    const allMatch = signatures.every((sig) =>
      sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte),
    );
    if (allMatch) return mime;
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  // Normaliza separadores Windows para POSIX antes do basename — `path.basename`
  // nativo não reconhece `\` no Linux, deixando passar path traversal cross-platform.
  const normalized = name.replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  return base
    .replace(/\0/g, '')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}

export function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mime] ?? '';
}

/** Nome em disco: `<timestamp>-<nome sanitizado><ext>`. */
export function montarNomeEmDisco(originalName: string, mime: string, agora = Date.now()): string {
  const sanitized = sanitizeFilename(originalName) || 'arquivo';
  const ext = path.extname(sanitized) || mimeToExt(mime);
  const baseName = path.basename(sanitized, ext) || 'arquivo';
  return `${agora}-${baseName}${ext}`;
}

/**
 * Resolve `base/subdir/filename` e confere que nada escapa de `base`.
 * Devolve `null` quando o caminho sairia da pasta (path traversal).
 */
export function resolverCaminhoSeguro(
  base: string,
  subdir: string,
  filename?: string,
): { dir: string; arquivo: string | null } | null {
  const dir = path.resolve(base, subdir);
  if (!dir.startsWith(base + path.sep) && dir !== base) return null;
  if (filename === undefined) return { dir, arquivo: null };
  const arquivo = path.resolve(dir, filename);
  if (!arquivo.startsWith(dir + path.sep)) return null;
  return { dir, arquivo };
}
