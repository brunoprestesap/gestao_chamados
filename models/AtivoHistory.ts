import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  ATIVO_HISTORY_ACOES,
  ATIVO_HISTORY_ACTOR_TYPES,
  COLECOES_ATIVOS,
} from '@/shared/ativos/ativo.constants';

/**
 * Trilha de auditoria do ativo (spec 0011). `de` e `para` são texto legível
 * (caminho do local, nome da categoria, rótulo do status). Na `edicao`, os
 * nomes dos campos livres que mudaram vão em `observacao`.
 */
const AtivoHistorySchema = new Schema(
  {
    ativoId: { type: Schema.Types.ObjectId, ref: 'Ativo', required: true },
    acao: { type: String, enum: ATIVO_HISTORY_ACOES, required: true },
    actorType: { type: String, enum: ATIVO_HISTORY_ACTOR_TYPES, default: 'usuario' },
    autorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      required: function (this: { actorType?: string }) {
        return (this.actorType ?? 'usuario') === 'usuario';
      },
    },
    de: { type: String, default: null },
    para: { type: String, default: null },
    observacao: { type: String, trim: true, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AtivoHistorySchema.index({ ativoId: 1, createdAt: -1 });

export type AtivoHistory = InferSchemaType<typeof AtivoHistorySchema>;

export type AtivoHistoryDoc = AtivoHistory & {
  _id: Types.ObjectId;
  createdAt: Date;
};

if (mongoose.models.AtivoHistory) {
  delete mongoose.models.AtivoHistory;
}

export const AtivoHistoryModel: Model<AtivoHistory> = mongoose.model<AtivoHistory>(
  'AtivoHistory',
  AtivoHistorySchema,
  COLECOES_ATIVOS.historico,
);
