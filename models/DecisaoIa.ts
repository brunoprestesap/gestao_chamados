import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import {
  DECISAO_CAMPOS,
  DECISAO_CORRECAO_ORIGENS,
  DECISAO_DECIDIDO_POR,
  DECISAO_EFEITOS,
  DECISAO_SITUACOES,
} from '@/shared/conversas/conversa.constants';
import {
  DECISAO_CORRECAO_MOTIVO_MAX,
  DECISAO_MOTIVO_MAX,
  DECISAO_ROTULO_MAX,
} from '@/shared/conversas/conversa.schemas';

/**
 * Uma decisão da IA sobre um campo de um chamado (spec 0002). Serve à auditoria
 * e à medição de acerto: guarda o que foi decidido, com que confiança, por quê,
 * com qual modelo, e toda correção humana que veio depois.
 *
 * `valorIa`, `confianca`, `motivo` e os campos de modelo nunca mudam depois de
 * gravados. O que muda é `valorFinal`, `correcoes`, `situacao` e a revisão.
 */

/** Quantas correções a lista guarda; as mais antigas saem por `$slice`. */
export const DECISAO_CORRECOES_MAX = 20;

/**
 * Valor decidido. Os campos preenchidos dependem do `campo` da decisão; o
 * `rotulo` é o nome exibido lido do banco no momento da gravação, nunca texto
 * vindo do modelo.
 */
const ValorDecisaoSchema = new Schema(
  {
    catalogServiceId: { type: Schema.Types.ObjectId, ref: 'ServiceCatalog', default: null },
    subtypeId: { type: Schema.Types.ObjectId, ref: 'ServiceSubType', default: null },
    tipoServico: { type: String, enum: [...TIPO_SERVICO_OPTIONS, null], default: null },
    prioridade: { type: String, enum: [...FINAL_PRIORITY_VALUES, null], default: null },
    tecnicoId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rotulo: { type: String, required: true, trim: true, maxlength: DECISAO_ROTULO_MAX },
  },
  { _id: false },
);

/** Uma correção humana sobre a decisão, do solicitante na abertura ou da gestão na triagem. */
const CorrecaoSchema = new Schema(
  {
    anterior: { type: ValorDecisaoSchema, required: true },
    novo: { type: ValorDecisaoSchema, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    origem: { type: String, enum: DECISAO_CORRECAO_ORIGENS, required: true },
    motivo: { type: String, default: '', trim: true, maxlength: DECISAO_CORRECAO_MOTIVO_MAX },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const DecisaoIaSchema = new Schema(
  {
    chamadoId: { type: Schema.Types.ObjectId, ref: 'Chamado', required: true },
    /** Vazio quando a decisão veio fora de uma conversa. */
    conversaId: { type: Schema.Types.ObjectId, ref: 'Conversa', default: null },
    campo: { type: String, enum: DECISAO_CAMPOS, required: true },
    decididoPor: { type: String, enum: DECISAO_DECIDIDO_POR, required: true },
    /** `sugestao` espera a triagem; `aplicado` já valeu sem humano. */
    efeito: { type: String, enum: DECISAO_EFEITOS, required: true },
    /** Nunca muda depois de gravado. */
    valorIa: { type: ValorDecisaoSchema, required: true },
    /** Começa igual ao `valorIa` e muda a cada correção. */
    valorFinal: { type: ValorDecisaoSchema, required: true },
    /** Só com `decididoPor: 'ia'`; `null` com `regra`. */
    confianca: { type: Number, default: null, min: 0, max: 1 },
    motivo: { type: String, required: true, trim: true, maxlength: DECISAO_MOTIVO_MAX },
    /** Vêm de `LlmResult.meta`; `null` com `regra`. */
    modelo: { type: String, default: null },
    promptVersion: { type: String, default: null, maxlength: 40 },
    task: { type: String, default: null, maxlength: 80 },
    /** `meta.callId`. O `LlmCall` expira em 365 dias, então o elo pode ficar sem destino. */
    llmCallId: { type: Schema.Types.ObjectId, ref: 'LlmCall', default: null },
    correcoes: { type: [CorrecaoSchema], default: [] },
    /** Último veredito da gestão. */
    revisadaEm: { type: Date, default: null },
    revisadaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Derivada na mesma gravação que muda `valorFinal` ou `revisadaEm`. */
    situacao: { type: String, enum: DECISAO_SITUACOES, required: true, default: 'sem_revisao' },
  },
  { timestamps: true },
);

/** No máximo uma decisão por campo de cada chamado. É o que torna o registro repetível. */
DecisaoIaSchema.index({ chamadoId: 1, campo: 1 }, { unique: true });
/** Base das métricas de acerto por campo. */
DecisaoIaSchema.index({ situacao: 1, campo: 1, createdAt: -1 });

export type DecisaoIa = InferSchemaType<typeof DecisaoIaSchema>;

export type DecisaoIaDoc = DecisaoIa & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.DecisaoIa) {
  delete mongoose.models.DecisaoIa;
}

export const DecisaoIaModel: Model<DecisaoIa> = mongoose.model<DecisaoIa>(
  'DecisaoIa',
  DecisaoIaSchema,
);
