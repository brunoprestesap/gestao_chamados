import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';
import { CHAMADO_HISTORY_ACTIONS } from '@/shared/chamados/history.constants';

const ChamadoHistorySchema = new Schema(
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
    action: {
      type: String,
      enum: CHAMADO_HISTORY_ACTIONS,
      required: true,
    },
    statusAnterior: {
      type: String,
      enum: ['aberto', 'em atendimento', 'fechado', 'concluído', 'cancelado'],
      required: false,
    },
    statusNovo: {
      type: String,
      enum: ['aberto', 'em atendimento', 'fechado', 'concluído', 'cancelado'],
      required: false,
    },
    // Campos adicionais para contexto (opcional)
    observacoes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

// Índices para consultas eficientes
ChamadoHistorySchema.index({ chamadoId: 1, createdAt: -1 });
ChamadoHistorySchema.index({ userId: 1, createdAt: -1 });
ChamadoHistorySchema.index({ action: 1, createdAt: -1 });
ChamadoHistorySchema.index({ createdAt: -1 });

export type ChamadoHistory = InferSchemaType<typeof ChamadoHistorySchema> & {
  chamadoId: Types.ObjectId;
  userId: Types.ObjectId;
};

export type ChamadoHistoryDoc = ChamadoHistory & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

// Remove o modelo do cache se existir para forçar atualização do schema
// Isso é necessário quando o schema é atualizado em desenvolvimento
if (mongoose.models.ChamadoHistory) {
  delete mongoose.models.ChamadoHistory;
}

export const ChamadoHistoryModel: Model<ChamadoHistory> = mongoose.model<ChamadoHistory>(
  'ChamadoHistory',
  ChamadoHistorySchema,
);
