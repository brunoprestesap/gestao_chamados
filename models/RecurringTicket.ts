import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import { RECURRENCE_TYPES } from '@/shared/chamados/recurring-ticket.schemas';

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
    subtypeId: { type: Schema.Types.ObjectId, ref: 'ServiceSubType', required: false },
    catalogServiceId: { type: Schema.Types.ObjectId, ref: 'ServiceCatalog', required: false },

    // Campos de recorrência
    recurrenceType: { type: String, enum: RECURRENCE_TYPES, required: true },
    dayOfWeek: { type: Number, min: 0, max: 6, required: false },
    dayOfMonth: { type: Number, min: 1, max: 28, required: false },
    intervalDays: { type: Number, min: 1, required: false },
    nextRunAt: { type: Date, required: true },
    lastRunAt: { type: Date, required: false },
    totalGenerated: { type: Number, default: 0 },

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
  subtypeId?: Types.ObjectId;
  catalogServiceId?: Types.ObjectId;
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
