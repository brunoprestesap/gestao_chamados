import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  ATTENDANCE_NATURE_VALUES,
  CHAMADO_STATUSES,
} from '@/shared/chamados/chamado.constants';
import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  TIPO_SERVICO_OPTIONS,
} from '@/shared/chamados/new-ticket.schemas';

const ChamadoSchema = new Schema(
  {
    ticket_number: { type: String, required: true, trim: true },
    titulo: { type: String, required: true, trim: true },
    descricao: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: CHAMADO_STATUSES,
      required: true,
      default: 'aberto',
    },
    solicitanteId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Campos do formulário de criação
    unitId: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
    },
    localExato: { type: String, required: true, trim: true },
    tipoServico: {
      type: String,
      enum: TIPO_SERVICO_OPTIONS,
      required: true,
    },
    naturezaAtendimento: {
      type: String,
      enum: NATUREZA_OPTIONS,
      required: false,
    },
    /** Natureza SOLICITADA na abertura (informativa); NUNCA usada para SLA */
    requestedAttendanceNature: {
      type: String,
      enum: ATTENDANCE_NATURE_VALUES,
      required: false,
    },
    /** Natureza APROVADA na classificação (Admin/Preposto); usada para regras e SLA */
    attendanceNature: {
      type: String,
      enum: ATTENDANCE_NATURE_VALUES,
      required: false,
    },
    grauUrgencia: {
      type: String,
      enum: GRAU_URGENCIA_OPTIONS,
      required: true,
      default: 'Normal',
    },
    telefoneContato: { type: String, default: '', trim: true },
    subtypeId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceSubType',
      required: false,
    },
    catalogServiceId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceCatalog',
      required: false,
    },
    // Classificação (Preposto/Admin)
    finalPriority: {
      type: String,
      enum: ['BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIAL'],
      required: false,
    },
    classificationNotes: { type: String, default: '', trim: true },
    classifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    classifiedAt: { type: Date, required: false },
    // Atribuição de técnico
    assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    assignedAt: { type: Date, required: false },
    assignedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    // Reatribuição (Admin/Preposto) — status "em atendimento"
    reassignedAt: { type: Date, required: false },
    reassignedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    reassignmentNotes: { type: String, default: '', trim: true },
    // Conclusão (data/hora em que o chamado foi concluído)
    concludedAt: { type: Date, required: false },
    // Encerramento (Admin) — após status Concluído
    closedAt: { type: Date, required: false },
    closedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    closureNotes: { type: String, default: '', trim: true },
    // Avaliação pelo solicitante (gancho mínimo: "já avaliado")
    evaluation: {
      rating: { type: Number, required: false },
      notes: { type: String, default: '', trim: true },
      createdAt: { type: Date, required: false },
      createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    },
    // Execuções do serviço (registro do técnico)
    executions: [
      {
        createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        serviceDescription: { type: String, required: true, trim: true },
        materialsUsed: { type: String, default: '', trim: true },
        evidencePhotos: [{ type: String, trim: true }],
        notes: { type: String, default: '', trim: true },
        concludedAt: { type: Date, required: true },
      },
    ],
    // SLA — snapshot da config ativa no momento da classificação (imutável)
    sla: {
      priority: { type: String, enum: ['BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIAL'], required: false },
      responseTargetMinutes: { type: Number, required: false },
      resolutionTargetMinutes: { type: Number, required: false },
      businessHoursOnly: { type: Boolean, required: false },
      responseDueAt: { type: Date, required: false },
      resolutionDueAt: { type: Date, required: false },
      responseStartedAt: { type: Date, required: false },
      resolvedAt: { type: Date, required: false },
      responseBreachedAt: { type: Date, required: false },
      resolutionBreachedAt: { type: Date, required: false },
      computedAt: { type: Date, required: false },
      configVersion: { type: String, required: false, trim: true },
    },
  },
  { timestamps: true },
);

ChamadoSchema.index({ ticket_number: 1 }, { unique: true });
ChamadoSchema.index({ solicitanteId: 1, status: 1, createdAt: -1 });
ChamadoSchema.index({ ticket_number: 'text', titulo: 'text', descricao: 'text' });
ChamadoSchema.index({ unitId: 1, status: 1 });
ChamadoSchema.index({ tipoServico: 1, status: 1 });
ChamadoSchema.index({ naturezaAtendimento: 1 });
ChamadoSchema.index({ assignedToUserId: 1, status: 1 });

export type ExecutionDoc = {
  _id?: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  serviceDescription: string;
  materialsUsed?: string;
  evidencePhotos?: string[];
  notes?: string;
  concludedAt: Date;
};

export type Chamado = InferSchemaType<typeof ChamadoSchema> & {
  solicitanteId: Types.ObjectId;
  unitId: Types.ObjectId;
  subtypeId?: Types.ObjectId;
  catalogServiceId?: Types.ObjectId;
  classifiedByUserId?: Types.ObjectId;
  assignedToUserId?: Types.ObjectId;
  assignedByUserId?: Types.ObjectId;
  concludedAt?: Date;
  executions?: ExecutionDoc[];
};

export type ChamadoDoc = Chamado & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

// Força a recriação do modelo para garantir que o schema atualizado seja usado
if (mongoose.models.Chamado) {
  delete mongoose.models.Chamado;
}

export const ChamadoModel: Model<Chamado> = mongoose.model<Chamado>('Chamado', ChamadoSchema);
