import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';
import {
  CHAMADO_HISTORY_ACTIONS,
  CHAMADO_HISTORY_ACTOR_TYPES,
} from '@/shared/chamados/history.constants';

const ChamadoHistorySchema = new Schema(
  {
    chamadoId: {
      type: Schema.Types.ObjectId,
      ref: 'Chamado',
      required: true,
      index: true,
    },
    /**
     * Ausente nas entradas da IA e do sistema. O `required` por função mantém a
     * garantia antiga onde ela vale: ação de gente continua exigindo usuário.
     */
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      required: function (this: { actorType?: string }) {
        return (this.actorType ?? 'usuario') === 'usuario';
      },
    },
    /** Quem praticou a ação. Documento antigo lê `usuario` pelo padrão. */
    actorType: {
      type: String,
      enum: CHAMADO_HISTORY_ACTOR_TYPES,
      default: 'usuario',
    },
    /** Liga a entrada à decisão da IA que ela registra ou corrige. */
    decisaoIaId: {
      type: Schema.Types.ObjectId,
      ref: 'DecisaoIa',
      default: null,
    },
    action: {
      type: String,
      enum: CHAMADO_HISTORY_ACTIONS,
      required: true,
    },
    statusAnterior: {
      type: String,
      enum: CHAMADO_STATUSES,
      required: false,
    },
    statusNovo: {
      type: String,
      enum: CHAMADO_STATUSES,
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
  /** `null` nas entradas de autor `ia` ou `sistema`. Todo leitor trata o nulo. */
  userId: Types.ObjectId | null;
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
