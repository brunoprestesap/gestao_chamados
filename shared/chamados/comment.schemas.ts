import { z } from 'zod';

export const COMMENT_VISIBILITY = ['publico', 'interno'] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITY)[number];

export const AddCommentSchema = z.object({
  chamadoId: z.string().regex(/^[a-f\d]{24}$/i, 'ID de chamado inválido'),
  content: z
    .string()
    .min(1, 'O comentário não pode estar vazio')
    .max(5000, 'O comentário deve ter no máximo 5000 caracteres'),
  visibility: z.enum(COMMENT_VISIBILITY).default('publico'),
});

export type AddCommentInput = z.infer<typeof AddCommentSchema>;

export const CommentListItemSchema = z.object({
  _id: z.string(),
  chamadoId: z.string(),
  userId: z.string(),
  userName: z.string(),
  userUsername: z.string(),
  content: z.string(),
  visibility: z.enum(COMMENT_VISIBILITY),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CommentListItem = z.infer<typeof CommentListItemSchema>;
