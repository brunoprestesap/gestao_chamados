import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { ATTENDANCE_NATURE_VALUES, CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';
import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  TIPO_SERVICO_OPTIONS,
} from '@/shared/chamados/new-ticket.schemas';
import { PAUSE_REASONS } from '@/shared/chamados/pause-reason.constants';
import { CANAIS_ABERTURA, IA_SITUACOES } from '@/shared/conversas/conversa.constants';

/** Só o chamado da conversa pode nascer sem serviço do catálogo. */
function exigeServicoDoCatalogo(this: { canalAbertura?: string }): boolean {
  return this.canalAbertura !== 'chat';
}

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
    // Obrigatórios, salvo no chamado aberto pela conversa (spec 0004, AC-9): sem
    // IA, ou sem serviço que a IA acertou, ele nasce só com o tipo, e o
    // Preposto escolhe o serviço na classificação, que continua exigindo os dois.
    subtypeId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceSubType',
      required: [exigeServicoDoCatalogo, 'Selecione o subtipo de serviço'],
    },
    catalogServiceId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceCatalog',
      required: [exigeServicoDoCatalogo, 'Selecione o serviço do catálogo'],
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
    // Recusa na triagem (Admin/Preposto)
    rejectedAt: { type: Date, required: false },
    rejectedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    rejectionReason: { type: String, default: '', trim: true },
    rejectionGuidance: { type: String, default: '', trim: true },
    // Pausa SLA
    slaPausedAt: { type: Date, required: false },
    totalPausedMinutes: { type: Number, default: 0 },
    pauseReason: { type: String, enum: PAUSE_REASONS, required: false },
    pauseDetails: { type: String, default: '', trim: true },
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
    // Recusas de serviço pelo solicitante (retrabalho)
    serviceRefusals: [
      {
        reason: { type: String, required: true, trim: true },
        createdAt: { type: Date, required: true, default: Date.now },
        createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      },
    ],
    // Rastreabilidade — chamado gerado por agendamento recorrente
    originTemplateId: { type: Schema.Types.ObjectId, ref: 'RecurringTicket', required: false },
    // Observações de material (técnico registra sem fechar o chamado)
    materialObservations: [
      {
        description: { type: String, required: true, trim: true },
        createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        createdByName: { type: String, default: '', trim: true },
        createdAt: { type: Date, required: true, default: Date.now },
      },
    ],
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
      pausedMinutes: { type: Number, default: 0 },
      computedAt: { type: Date, required: false },
      configVersion: { type: String, required: false, trim: true },
    },
    // Abertura por conversa e decisões da IA (spec 0002)
    /** A conversa que virou este chamado. Um chamado pertence a uma única conversa. */
    conversaId: { type: Schema.Types.ObjectId, ref: 'Conversa', default: null },
    /** Documento antigo lê `formulario` pelo padrão; `lean()` e `aggregate` tratam o ausente. */
    canalAbertura: { type: String, enum: CANAIS_ABERTURA, default: 'formulario' },
    /** Quanto a IA pesou aqui. `null` em chamado aberto antes da IA existir. */
    iaSituacao: { type: String, enum: [...IA_SITUACOES, null], default: null },
  },
  { timestamps: true },
);

ChamadoSchema.index({ ticket_number: 1 }, { unique: true });
ChamadoSchema.index({ solicitanteId: 1, status: 1, createdAt: -1 });
// Lateral de `/conversas`: os chamados do solicitante por data de mudança. A
// situação no meio do índice acima impede que ele sirva a esta ordenação.
//
// O `_id` entra porque a lateral pagina por cursor composto (`updatedAt` mais
// `_id`) e ordena pelos dois. Sem ele o Mongo lê todos os chamados do
// solicitante e ordena em memória, mesmo usando o índice para filtrar.
ChamadoSchema.index({ solicitanteId: 1, updatedAt: -1, _id: -1 });
ChamadoSchema.index({ ticket_number: 'text', titulo: 'text', descricao: 'text' });
ChamadoSchema.index({ unitId: 1, status: 1 });
ChamadoSchema.index({ tipoServico: 1, status: 1 });
ChamadoSchema.index({ naturezaAtendimento: 1 });
ChamadoSchema.index({ assignedToUserId: 1, status: 1 });
// Lateral de `/conversas` do técnico: os chamados atribuídos a ele por data de
// mudança. O índice acima ({ assignedToUserId: 1, status: 1 }) não serve para
// paginar por data, pelo mesmo motivo do índice do solicitante logo acima.
ChamadoSchema.index({ assignedToUserId: 1, updatedAt: -1, _id: -1 });
ChamadoSchema.index({ status: 1, 'sla.resolutionDueAt': 1 }, { sparse: true });
ChamadoSchema.index({ 'sla.computedAt': 1 }, { sparse: true });
ChamadoSchema.index({ status: 1, updatedAt: -1 });
// Detecção de recorrência: mesmo defeito (unidade + tipo + subtipo) já concluído na janela
ChamadoSchema.index({ unitId: 1, tipoServico: 1, subtypeId: 1, status: 1, concludedAt: -1 });
// Relatório IMR: filtra { status: 'encerrado', closedAt: { $gte, $lte } } por janela de tempo
ChamadoSchema.index({ status: 1, closedAt: 1 }, { sparse: true });
// Um chamado pertence a uma única conversa. O parcial deixa vários `null` conviverem.
ChamadoSchema.index(
  { conversaId: 1 },
  { unique: true, partialFilterExpression: { conversaId: { $type: 'objectId' } } },
);
// Triagem e painel da IA: só os chamados que passaram por ela
ChamadoSchema.index(
  { iaSituacao: 1, status: 1, createdAt: -1 },
  { partialFilterExpression: { iaSituacao: { $type: 'string' } } },
);

export type MaterialObservationDoc = {
  _id?: Types.ObjectId;
  description: string;
  createdByUserId: Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
};

export type ExecutionDoc = {
  _id?: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  serviceDescription: string;
  materialsUsed?: string;
  evidencePhotos?: string[];
  notes?: string;
  concludedAt: Date;
};

export type ServiceRefusalDoc = {
  _id?: Types.ObjectId;
  reason: string;
  createdAt: Date;
  createdByUserId: Types.ObjectId;
};

export type Chamado = InferSchemaType<typeof ChamadoSchema> & {
  solicitanteId: Types.ObjectId;
  unitId: Types.ObjectId;
  subtypeId?: Types.ObjectId;
  catalogServiceId?: Types.ObjectId;
  classifiedByUserId?: Types.ObjectId;
  assignedToUserId?: Types.ObjectId;
  assignedByUserId?: Types.ObjectId;
  rejectedByUserId?: Types.ObjectId;
  originTemplateId?: Types.ObjectId;
  concludedAt?: Date;
  slaPausedAt?: Date;
  totalPausedMinutes?: number;
  pauseReason?: string;
  pauseDetails?: string;
  materialObservations?: MaterialObservationDoc[];
  executions?: ExecutionDoc[];
  serviceRefusals?: ServiceRefusalDoc[];
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
