import { describe, expect, it } from 'vitest';

import {
  AddAttachmentSchema,
  ALLOWED_MIME_TYPES,
  ATTACHMENT_CONTEXTS,
  AttachmentListItemSchema,
  AttachmentSchema,
  MAX_ATTACHMENTS_PER_TICKET,
  MAX_FILE_SIZE,
  NotifyAttachmentSchema,
} from '@/shared/chamados/attachment.schemas';

const VALID_ID = 'a'.repeat(24);
const VALID_ATTACHMENT_ID = 'b'.repeat(24);

// ── Constantes exportadas ────────────────────────────────────────────

describe('constantes exportadas', () => {
  it('MAX_FILE_SIZE deve ser 5MB (5242880 bytes)', () => {
    expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
  });

  it('MAX_ATTACHMENTS_PER_TICKET deve ser 20', () => {
    expect(MAX_ATTACHMENTS_PER_TICKET).toBe(20);
  });

  it('ALLOWED_MIME_TYPES deve conter exatamente os 4 tipos permitidos', () => {
    expect(ALLOWED_MIME_TYPES).toHaveLength(4);
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_MIME_TYPES).toContain('image/webp');
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
  });

  it('ATTACHMENT_CONTEXTS deve conter abertura, execucao, comentario e geral', () => {
    expect(ATTACHMENT_CONTEXTS).toHaveLength(4);
    expect(ATTACHMENT_CONTEXTS).toContain('abertura');
    expect(ATTACHMENT_CONTEXTS).toContain('execucao');
    expect(ATTACHMENT_CONTEXTS).toContain('comentario');
    expect(ATTACHMENT_CONTEXTS).toContain('geral');
  });
});

// ── AttachmentSchema ─────────────────────────────────────────────────

describe('AttachmentSchema', () => {
  const validAttachment = {
    _id: VALID_ID,
    chamadoId: VALID_ID,
    userId: VALID_ID,
    filename: '1700000000-foto.jpg',
    originalName: 'foto.jpg',
    mimeType: 'image/jpeg',
    size: 102400,
    url: '/api/uploads/aaaaaaaaaaaaaaaaaaaaaaaa/foto.jpg',
    context: 'geral' as const,
    createdAt: new Date().toISOString(),
  };

  it('deve aceitar dados válidos completos', () => {
    const result = AttachmentSchema.safeParse(validAttachment);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar quando context é valor não permitido', () => {
    const result = AttachmentSchema.safeParse({ ...validAttachment, context: 'invalido' });
    expect(result.success).toBe(false);
  });

  it('deve aceitar context "abertura"', () => {
    const result = AttachmentSchema.safeParse({ ...validAttachment, context: 'abertura' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar context "execucao"', () => {
    const result = AttachmentSchema.safeParse({ ...validAttachment, context: 'execucao' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar context "comentario"', () => {
    const result = AttachmentSchema.safeParse({ ...validAttachment, context: 'comentario' });
    expect(result.success).toBe(true);
  });
});

// ── AttachmentListItemSchema ─────────────────────────────────────────

describe('AttachmentListItemSchema', () => {
  const validItem = {
    _id: VALID_ID,
    filename: '1700000000-foto.jpg',
    originalName: 'foto.jpg',
    mimeType: 'image/jpeg',
    size: 102400,
    url: '/api/uploads/aaaaaaaaaaaaaaaaaaaaaaaa/foto.jpg',
    context: 'geral' as const,
    createdAt: new Date().toISOString(),
    user: {
      _id: VALID_ID,
      name: 'João Silva',
    },
  };

  it('deve aceitar dados válidos com objeto user populado', () => {
    const result = AttachmentListItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar quando user está ausente', () => {
    const withoutUser: Partial<typeof validItem> = { ...validItem };
    delete withoutUser.user;
    const result = AttachmentListItemSchema.safeParse(withoutUser);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando user.name está ausente', () => {
    const result = AttachmentListItemSchema.safeParse({
      ...validItem,
      user: { _id: VALID_ID },
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando context é inválido', () => {
    const result = AttachmentListItemSchema.safeParse({ ...validItem, context: 'outro' });
    expect(result.success).toBe(false);
  });
});

// ── AddAttachmentSchema ──────────────────────────────────────────────

describe('AddAttachmentSchema', () => {
  const validInput = {
    chamadoId: VALID_ID,
    filename: '1700000000-foto.jpg',
    originalName: 'foto.jpg',
    mimeType: 'image/jpeg' as const,
    size: 102400,
    url: '/api/uploads/aaaaaaaaaaaaaaaaaaaaaaaa/foto.jpg',
    context: 'geral' as const,
  };

  it('deve aceitar dados válidos completos', () => {
    const result = AddAttachmentSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('deve usar "geral" como context padrão quando omitido', () => {
    const withoutContext: Partial<typeof validInput> = { ...validInput };
    delete withoutContext.context;
    const result = AddAttachmentSchema.safeParse(withoutContext);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.context).toBe('geral');
  });

  it('deve rejeitar chamadoId com formato inválido (não-ObjectId)', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, chamadoId: 'nao-valido' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar chamadoId com menos de 24 caracteres hex', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, chamadoId: 'abc123' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar chamadoId com mais de 24 caracteres hex', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, chamadoId: 'a'.repeat(25) });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar filename vazio', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, filename: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar originalName vazio', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, originalName: '' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar mimeType não permitido (text/plain)', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, mimeType: 'text/plain' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar mimeType não permitido (image/gif)', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, mimeType: 'image/gif' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar mimeType vazio', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, mimeType: '' });
    expect(result.success).toBe(false);
  });

  it('deve aceitar mimeType "image/png"', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, mimeType: 'image/png' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar mimeType "image/webp"', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, mimeType: 'image/webp' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar mimeType "application/pdf"', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, mimeType: 'application/pdf' });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar size igual a 0', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, size: 0 });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar size negativo', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, size: -1 });
    expect(result.success).toBe(false);
  });

  it('deve aceitar size igual ao limite máximo (5MB)', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, size: MAX_FILE_SIZE });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar size acima do limite máximo (5MB + 1 byte)', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, size: MAX_FILE_SIZE + 1 });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar url que não começa com /api/uploads/', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, url: '/public/uploads/foto.jpg' });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar url com protocolo http externo', () => {
    const result = AddAttachmentSchema.safeParse({
      ...validInput,
      url: 'http://example.com/foto.jpg',
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar url que começa com /api/uploads/', () => {
    const result = AddAttachmentSchema.safeParse({
      ...validInput,
      url: '/api/uploads/aaaaaaaaaaaaaaaaaaaaaaaa/arquivo.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar context "abertura"', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, context: 'abertura' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar context "execucao"', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, context: 'execucao' });
    expect(result.success).toBe(true);
  });

  it('deve aceitar context "comentario"', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, context: 'comentario' });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar context com valor não permitido', () => {
    const result = AddAttachmentSchema.safeParse({ ...validInput, context: 'outro' });
    expect(result.success).toBe(false);
  });
});

// ── NotifyAttachmentSchema ───────────────────────────────────────────

describe('NotifyAttachmentSchema', () => {
  it('deve aceitar par válido de chamadoId e attachmentId', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: VALID_ID,
      attachmentId: VALID_ATTACHMENT_ID,
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar chamadoId e attachmentId com letras maiúsculas hex', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: 'A'.repeat(24),
      attachmentId: 'F'.repeat(24),
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar chamadoId inválido', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: 'id-invalido',
      attachmentId: VALID_ATTACHMENT_ID,
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar attachmentId inválido', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: VALID_ID,
      attachmentId: 'nao-um-objectid',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando chamadoId está ausente', () => {
    const result = NotifyAttachmentSchema.safeParse({ attachmentId: VALID_ATTACHMENT_ID });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando attachmentId está ausente', () => {
    const result = NotifyAttachmentSchema.safeParse({ chamadoId: VALID_ID });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar chamadoId vazio', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: '',
      attachmentId: VALID_ATTACHMENT_ID,
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar attachmentId com exatamente 23 caracteres (um a menos)', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: VALID_ID,
      attachmentId: 'a'.repeat(23),
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar chamadoId com exatamente 25 caracteres (um a mais)', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: 'a'.repeat(25),
      attachmentId: VALID_ATTACHMENT_ID,
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar quando os dois IDs têm caracteres não-hex (g-z)', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: 'g'.repeat(24),
      attachmentId: VALID_ATTACHMENT_ID,
    });
    expect(result.success).toBe(false);
  });

  it('deve extrair os valores corretos quando válido', () => {
    const result = NotifyAttachmentSchema.safeParse({
      chamadoId: VALID_ID,
      attachmentId: VALID_ATTACHMENT_ID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.chamadoId).toBe(VALID_ID);
      expect(result.data.attachmentId).toBe(VALID_ATTACHMENT_ID);
    }
  });
});
