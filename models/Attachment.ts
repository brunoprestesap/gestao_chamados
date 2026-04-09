import mongoose, { type InferSchemaType, type Model, Schema, type Types } from 'mongoose';

const ATTACHMENT_CONTEXTS = ['abertura', 'execucao', 'comentario', 'geral'] as const;
export type AttachmentContext = (typeof ATTACHMENT_CONTEXTS)[number];

const AttachmentSchema = new Schema(
  {
    chamadoId: {
      type: Schema.Types.ObjectId,
      ref: 'Chamado',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    context: {
      type: String,
      enum: ATTACHMENT_CONTEXTS,
      default: 'geral',
    },
  },
  { timestamps: true },
);

AttachmentSchema.index({ chamadoId: 1, createdAt: 1 });

export type Attachment = InferSchemaType<typeof AttachmentSchema> & {
  chamadoId: Types.ObjectId;
  userId: Types.ObjectId;
};

export type AttachmentDoc = Attachment & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AttachmentModel: Model<Attachment> =
  (mongoose.models.Attachment as Model<Attachment>) ||
  mongoose.model<Attachment>('Attachment', AttachmentSchema);
