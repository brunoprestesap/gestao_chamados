import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import {
  ESCOPOS_RECORRENTE,
  RECURRENCE_TYPES,
  SITUACOES_LOTE,
} from '@/shared/chamados/recurring-ticket.schemas';

/**
 * Resumo da última rodada de um modelo por categoria (spec 0013, AC-21).
 * `em_andamento` há mais de 1 hora quer dizer que o processo caiu no meio.
 */
const UltimoLoteSchema = new Schema(
  {
    situacao: { type: String, enum: SITUACOES_LOTE, required: true },
    em: { type: Date, required: true },
    gerados: { type: Number, default: 0 },
    pulados: { type: Number, default: 0 },
    semSla: { type: Number, default: 0 },
    erros: { type: Number, default: 0 },
    motivo: { type: String, default: null },
  },
  { _id: false },
);

const RecurringTicketSchema = new Schema(
  {
    // Identificação do agendamento
    name: { type: String, required: true, trim: true, maxlength: 150 },

    // Campos do template (espelho do chamado)
    titulo: { type: String, required: true, trim: true },
    descricao: { type: String, required: true, trim: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    tipoServico: { type: String, enum: TIPO_SERVICO_OPTIONS, required: true },
    naturezaAtendimento: { type: String, required: true, trim: true },
    grauUrgencia: { type: String, default: 'Normal', trim: true },
    subtypeId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceSubType',
      required: [true, 'Selecione o subtipo de serviço'],
    },
    catalogServiceId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceCatalog',
      required: [true, 'Selecione o serviço do catálogo'],
    },

    // Campos de recorrência
    recurrenceType: { type: String, enum: RECURRENCE_TYPES, required: true },
    dayOfWeek: { type: Number, min: 0, max: 6, required: false },
    dayOfMonth: { type: Number, min: 1, max: 28, required: false },
    intervalDays: { type: Number, min: 1, required: false },
    nextRunAt: { type: Date, required: true },
    lastRunAt: { type: Date, required: false },
    totalGenerated: { type: Number, default: 0 },

    // Preventiva por categoria de ativo (spec 0013). O ramo `template` não lê
    // nem escreve nenhum destes campos.
    escopo: { type: String, enum: ESCOPOS_RECORRENTE, default: 'template', immutable: true },
    categoriaAtivoId: { type: Schema.Types.ObjectId, ref: 'CategoriaAtivo', default: null },
    localizacaoId: { type: Schema.Types.ObjectId, ref: 'Localizacao', default: null },
    finalPriority: { type: String, enum: [...FINAL_PRIORITY_VALUES, null], default: null },
    ultimoLote: { type: UltimoLoteSchema, default: null },

    // Campos de controle
    isActive: { type: Boolean, default: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    solicitanteId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

RecurringTicketSchema.index({ nextRunAt: 1, isActive: 1 });
RecurringTicketSchema.index({ createdByUserId: 1 });

export type RecurringTicket = InferSchemaType<typeof RecurringTicketSchema> & {
  unitId: Types.ObjectId;
  subtypeId: Types.ObjectId;
  catalogServiceId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  solicitanteId: Types.ObjectId;
};

export type RecurringTicketDoc = RecurringTicket & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.RecurringTicket) {
  delete mongoose.models.RecurringTicket;
}

export const RecurringTicketModel: Model<RecurringTicket> = mongoose.model<RecurringTicket>(
  'RecurringTicket',
  RecurringTicketSchema,
);
