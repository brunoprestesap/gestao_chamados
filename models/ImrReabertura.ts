import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  MOTIVO_IMR_MAX,
  MOTIVO_IMR_MIN,
  PAPEIS_IMR,
} from '@/shared/imr-contrato/imr-contrato.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Reabertura de um mês fechado do IMR do contrato (spec 0023, AC-11). Coleção
 * própria, e não um campo no fechamento, para que "fechado ou aberto" seja
 * decidido por índice único: o mês está fechado quando a maior versão não tem
 * reabertura, e duas reaberturas simultâneas da mesma versão gravam uma só
 * (AC-18). Só inclusão.
 */

const ImrReaberturaSchema = new Schema({
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
  competencia: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  versaoReaberta: { type: Number, required: true, min: 1 },
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

ImrReaberturaSchema.index({ contratoId: 1, competencia: 1, versaoReaberta: 1 }, { unique: true });

somenteInclusao(ImrReaberturaSchema, 'ImrReabertura');

export type ImrReabertura = InferSchemaType<typeof ImrReaberturaSchema>;
export type ImrReaberturaDoc = ImrReabertura & { _id: Types.ObjectId };

if (mongoose.models.ImrReabertura) {
  delete mongoose.models.ImrReabertura;
}

export const ImrReaberturaModel: Model<ImrReabertura> = mongoose.model<ImrReabertura>(
  'ImrReabertura',
  ImrReaberturaSchema,
  'imr_reaberturas',
);
