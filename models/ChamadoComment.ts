import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { COMMENT_VISIBILITY } from '@/shared/chamados/comment.schemas';

const ChamadoCommentSchema = new Schema(
  {
    chamadoId: {
      type: Schema.Types.ObjectId,
      ref: 'Chamado',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    visibility: {
      type: String,
      enum: COMMENT_VISIBILITY,
      default: 'publico',
    },
    // editedAt reservado para futura edição de comentários
    editedAt: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true },
);

ChamadoCommentSchema.index({ chamadoId: 1, createdAt: 1 });
ChamadoCommentSchema.index({ chamadoId: 1, visibility: 1 });

export type ChamadoComment = InferSchemaType<typeof ChamadoCommentSchema> & {
  chamadoId: Types.ObjectId;
  userId: Types.ObjectId;
};

export type ChamadoCommentDoc = ChamadoComment & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ChamadoCommentModel: Model<ChamadoComment> =
  (mongoose.models.ChamadoComment as Model<ChamadoComment>) ??
  mongoose.model<ChamadoComment>('ChamadoComment', ChamadoCommentSchema);
