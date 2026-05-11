import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

export const COTACAO_STATUSES = ['enviada', 'aprovada', 'recusada'] as const;
export type CotacaoStatus = (typeof COTACAO_STATUSES)[number];

const CotacaoSchema = new Schema(
  {
    chamadoId: {
      type: Schema.Types.ObjectId,
      ref: 'Chamado',
      required: true,
    },
    pauseLogId: {
      type: Schema.Types.ObjectId,
      ref: 'PauseLog',
      required: true,
    },
    status: {
      type: String,
      enum: COTACAO_STATUSES,
      required: true,
      default: 'enviada',
    },
    valorEstimado: { type: Number, required: true, min: 0 },
    descricao: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    prazoEntregaDias: { type: Number, required: false, min: 0 },
    observacoes: { type: String, required: false, trim: true, maxlength: 1000 },
    anexoId: {
      type: Schema.Types.ObjectId,
      ref: 'Attachment',
      required: false,
    },
    submittedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    submittedAt: { type: Date, required: true, default: Date.now },
    reviewedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    reviewedAt: { type: Date, required: false },
    reviewObservacao: { type: String, required: false, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

CotacaoSchema.index({ chamadoId: 1, status: 1, createdAt: -1 });
CotacaoSchema.index({ pauseLogId: 1 }, { unique: true, sparse: true });
CotacaoSchema.index(
  { chamadoId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'enviada' },
    name: 'unique_enviada_por_chamado',
  },
);

export type Cotacao = InferSchemaType<typeof CotacaoSchema> & {
  chamadoId: Types.ObjectId;
  pauseLogId: Types.ObjectId;
  submittedByUserId: Types.ObjectId;
  reviewedByUserId?: Types.ObjectId;
  anexoId?: Types.ObjectId;
};

export type CotacaoDoc = Cotacao & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CotacaoModel: Model<Cotacao> =
  (mongoose.models.Cotacao as Model<Cotacao>) ??
  mongoose.model<Cotacao>('Cotacao', CotacaoSchema);
