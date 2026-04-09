import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const ATTACHMENT_CONTEXTS = ['abertura', 'execucao', 'comentario', 'geral'] as const;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_ATTACHMENTS_PER_TICKET = 20;

export const AttachmentSchema = z.object({
  _id: z.string(),
  chamadoId: z.string(),
  userId: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
  context: z.enum(ATTACHMENT_CONTEXTS),
  createdAt: z.string(),
});

export type AttachmentDTO = z.infer<typeof AttachmentSchema>;

export const AttachmentListItemSchema = z.object({
  _id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
  context: z.enum(ATTACHMENT_CONTEXTS),
  createdAt: z.string(),
  user: z.object({
    _id: z.string(),
    name: z.string(),
  }),
});

export type AttachmentListItem = z.infer<typeof AttachmentListItemSchema>;

export const AddAttachmentSchema = z.object({
  chamadoId: objectId,
  filename: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().min(1).max(MAX_FILE_SIZE),
  url: z.string().startsWith('/api/uploads/'),
  context: z.enum(ATTACHMENT_CONTEXTS).default('geral'),
});

export type AddAttachmentInput = z.infer<typeof AddAttachmentSchema>;

/** Input for the server action that registers history/notifications after upload. */
export const NotifyAttachmentSchema = z.object({
  chamadoId: objectId,
  attachmentId: objectId,
});

export type NotifyAttachmentInput = z.infer<typeof NotifyAttachmentSchema>;
