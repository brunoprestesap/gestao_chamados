import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Testes para as funções utilitárias de upload.
 *
 * As funções sanitizeFilename e detectMimeType são internas ao route.ts,
 * por isso são reimplementadas aqui com base no código-fonte para garantir
 * cobertura das regras de negócio críticas de segurança.
 *
 * Se futuramente essas funções forem extraídas para um módulo utilitário
 * (ex: lib/upload-utils.ts), os testes podem ser atualizados para importar
 * diretamente desse módulo.
 */

// ── Reimplementação das funções internas (espelham o route.ts) ────

/**
 * Sanitiza o nome de arquivo: remove path traversal, null bytes,
 * caracteres especiais e espaços, limitando a 200 chars.
 */
function sanitizeFilename(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  return base
    .replace(/\0/g, '')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}

/**
 * Magic bytes signatures — mesmo mapeamento do route.ts.
 */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
};

/**
 * Detecta o tipo MIME pelo conteúdo do buffer (magic bytes).
 * Retorna null se não reconhecido.
 */
function detectMimeType(buffer: Uint8Array): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    const allMatch = signatures.every((sig) =>
      sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte),
    );
    if (allMatch) return mime;
  }
  return null;
}

// ── Helpers para criar buffers de teste ───────────────────────────

function makeJpegBuffer(): Uint8Array {
  const buf = new Uint8Array(16);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function makePngBuffer(): Uint8Array {
  const buf = new Uint8Array(16);
  buf[0] = 0x89;
  buf[1] = 0x50; // P
  buf[2] = 0x4e; // N
  buf[3] = 0x47; // G
  return buf;
}

function makeWebpBuffer(): Uint8Array {
  // RIFF....WEBP — offset 0: RIFF, offset 8: WEBP
  const buf = new Uint8Array(16);
  // RIFF
  buf[0] = 0x52;
  buf[1] = 0x49;
  buf[2] = 0x46;
  buf[3] = 0x46;
  // bytes 4-7: tamanho do arquivo (ignorado na detecção)
  buf[4] = 0x00;
  buf[5] = 0x00;
  buf[6] = 0x00;
  buf[7] = 0x00;
  // WEBP
  buf[8] = 0x57;
  buf[9] = 0x45;
  buf[10] = 0x42;
  buf[11] = 0x50;
  return buf;
}

function makePdfBuffer(): Uint8Array {
  const buf = new Uint8Array(16);
  buf[0] = 0x25; // %
  buf[1] = 0x50; // P
  buf[2] = 0x44; // D
  buf[3] = 0x46; // F
  return buf;
}

function makeUnknownBuffer(): Uint8Array {
  // Buffer com zeros — não corresponde a nenhuma assinatura
  return new Uint8Array(16);
}

function makeTextBuffer(): Uint8Array {
  // Simula arquivo de texto (HTML, script, etc.)
  const buf = new Uint8Array(16);
  const text = '<html>';
  for (let i = 0; i < text.length; i++) {
    buf[i] = text.charCodeAt(i);
  }
  return buf;
}

// ── sanitizeFilename ──────────────────────────────────────────────

describe('sanitizeFilename', () => {
  it('deve preservar nome de arquivo simples sem alterações', () => {
    // Arrange
    const input = 'foto.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('foto.jpg');
  });

  it('deve remover componentes de diretório em path traversal com ../', () => {
    // Arrange
    const input = '../../etc/passwd';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('passwd');
  });

  it('deve remover componentes de diretório em path traversal com /', () => {
    // Arrange
    const input = '/var/www/html/index.html';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('index.html');
  });

  it('deve remover componentes de diretório em path traversal com \\', () => {
    // Arrange — barra invertida (Windows)
    const input = '..\\..\\windows\\system32\\config';

    // Act
    const result = sanitizeFilename(input);

    // Assert — path.basename lida com separadores nativos
    expect(result).not.toContain('..');
    expect(result).not.toContain('\\');
  });

  it('deve remover null bytes do nome de arquivo', () => {
    // Arrange
    const input = 'foto\0.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).not.toContain('\0');
    expect(result).toBe('foto.jpg');
  });

  it('deve remover caractere dois-pontos', () => {
    // Arrange
    const input = 'arquivo:nome.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).not.toContain(':');
  });

  it('deve remover asterisco', () => {
    // Arrange
    const input = 'foto*.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).not.toContain('*');
  });

  it('deve remover ponto de interrogação', () => {
    // Arrange
    const input = 'foto?.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).not.toContain('?');
  });

  it('deve remover aspas duplas', () => {
    // Arrange
    const input = 'foto"nome".jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).not.toContain('"');
  });

  it('deve remover sinal de menor e maior', () => {
    // Arrange
    const input = 'foto<nome>.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('deve remover pipe', () => {
    // Arrange
    const input = 'foto|nome.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).not.toContain('|');
  });

  it('deve substituir espaços por underscore', () => {
    // Arrange
    const input = 'minha foto final.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('minha_foto_final.jpg');
  });

  it('deve substituir múltiplos espaços consecutivos por um único underscore', () => {
    // Arrange
    const input = 'foto   muito   grande.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('foto_muito_grande.jpg');
  });

  it('deve preservar a extensão do arquivo', () => {
    // Arrange
    const input = 'documento.pdf';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('documento.pdf');
  });

  it('deve preservar extensão .png', () => {
    // Arrange
    const input = 'imagem.png';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('imagem.png');
  });

  it('deve truncar nome de arquivo com mais de 200 caracteres', () => {
    // Arrange
    const input = 'a'.repeat(210) + '.jpg';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('deve retornar string vazia para nome de arquivo vazio', () => {
    // Arrange
    const input = '';

    // Act
    const result = sanitizeFilename(input);

    // Assert
    expect(result).toBe('');
  });

  it('deve remover o caminho completo em URI suspeito tipo path traversal com %2F', () => {
    // Arrange — %2F não é decodificado por path.basename, então é tratado como nome
    const input = 'arquivo%2F..%2F..%2Fetc%2Fpasswd';

    // Act
    const result = sanitizeFilename(input);

    // Assert — sem barras reais, basename devolve o nome inteiro (sem chars especiais)
    expect(result).not.toContain('/');
  });
});

// ── detectMimeType ────────────────────────────────────────────────

describe('detectMimeType', () => {
  it('deve detectar JPEG pela assinatura FF D8 FF', () => {
    // Arrange
    const buffer = makeJpegBuffer();

    // Act
    const result = detectMimeType(buffer);

    // Assert
    expect(result).toBe('image/jpeg');
  });

  it('deve detectar PNG pela assinatura 89 50 4E 47', () => {
    // Arrange
    const buffer = makePngBuffer();

    // Act
    const result = detectMimeType(buffer);

    // Assert
    expect(result).toBe('image/png');
  });

  it('deve detectar WebP pelas assinaturas RIFF (offset 0) e WEBP (offset 8)', () => {
    // Arrange
    const buffer = makeWebpBuffer();

    // Act
    const result = detectMimeType(buffer);

    // Assert
    expect(result).toBe('image/webp');
  });

  it('deve detectar PDF pela assinatura %PDF (25 50 44 46)', () => {
    // Arrange
    const buffer = makePdfBuffer();

    // Act
    const result = detectMimeType(buffer);

    // Assert
    expect(result).toBe('application/pdf');
  });

  it('deve retornar null para buffer com zeros (tipo desconhecido)', () => {
    // Arrange
    const buffer = makeUnknownBuffer();

    // Act
    const result = detectMimeType(buffer);

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar null para buffer que parece texto HTML', () => {
    // Arrange
    const buffer = makeTextBuffer();

    // Act
    const result = detectMimeType(buffer);

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar null para buffer vazio', () => {
    // Arrange
    const buffer = new Uint8Array(0);

    // Act
    const result = detectMimeType(buffer);

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar null para buffer RIFF sem assinatura WEBP no offset 8', () => {
    // Arrange — tem RIFF mas não tem WEBP na posição correta
    const buf = new Uint8Array(16);
    buf[0] = 0x52; // R
    buf[1] = 0x49; // I
    buf[2] = 0x46; // F
    buf[3] = 0x46; // F
    // offset 8 intencionalmente vazio (zeros)

    // Act
    const result = detectMimeType(buf);

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar null para buffer que começa com FF D8 mas não tem FF no terceiro byte', () => {
    // Arrange — assinatura JPEG incompleta
    const buf = new Uint8Array(16);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0x00; // deveria ser 0xFF para JPEG

    // Act
    const result = detectMimeType(buf);

    // Assert
    expect(result).toBeNull();
  });

  it('deve detectar JPEG mesmo com conteúdo adicional após os magic bytes', () => {
    // Arrange — arquivo JPEG real tem muito mais dados após os magic bytes
    const buf = new Uint8Array(1024);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    // restante preenchido com dados aleatórios (não afeta detecção)
    for (let i = 3; i < 1024; i++) {
      buf[i] = i % 256;
    }

    // Act
    const result = detectMimeType(buf);

    // Assert
    expect(result).toBe('image/jpeg');
  });
});
