import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  MOTIVO_IMR_MAX,
  MOTIVO_IMR_MIN,
  PAPEIS_IMR,
  TIPOS_MARCACAO,
} from '@/shared/imr-contrato/imr-contrato.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Marcação do fiscal ou do gestor no IMR do contrato (spec 0023, AC-7, AC-8).
 * Só inclusão: desfazer é um evento novo, e o estado de um alvo é o último
 * evento da família (desconsiderar ou não atendimento), por `em` e `_id`. A
 * própria coleção é a trilha; nada vai para `ChamadoHistory`.
 */

const ImrMarcacaoSchema = new Schema({
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
  competencia: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  indicador: { type: Number, enum: [3, 4], required: true },
  alvoTipo: { type: String, enum: ['chamado', 'cotacao'], required: true },
  alvoId: { type: Schema.Types.ObjectId, required: true },
  tipo: { type: String, enum: TIPOS_MARCACAO, required: true },
  motivo: {
    type: String,
    required: true,
    trim: true,
    minlength: MOTIVO_IMR_MIN,
    maxlength: MOTIVO_IMR_MAX,
  },
  porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  papel: { type: String, enum: PAPEIS_IMR, required: true },
  em: { type: Date, required: true },
});

ImrMarcacaoSchema.index({ contratoId: 1, competencia: 1, em: 1 });

somenteInclusao(ImrMarcacaoSchema, 'ImrMarcacao');

export type ImrMarcacao = InferSchemaType<typeof ImrMarcacaoSchema>;
export type ImrMarcacaoDoc = ImrMarcacao & { _id: Types.ObjectId };

if (mongoose.models.ImrMarcacao) {
  delete mongoose.models.ImrMarcacao;
}

export const ImrMarcacaoModel: Model<ImrMarcacao> = mongoose.model<ImrMarcacao>(
  'ImrMarcacao',
  ImrMarcacaoSchema,
  'imr_marcacoes',
);
