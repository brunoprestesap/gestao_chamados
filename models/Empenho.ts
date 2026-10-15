import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { TIPOS_MOVIMENTO_EMPENHO } from '@/shared/material/material.constants';

/**
 * Empenho de material (spec 0019). `comprometidoCentavos` é sempre a soma de
 * `reservas`, e nunca passa de `valorLiquidoCentavos`. Toda escrita no saldo
 * é um update condicional de `lib/material/saldo.ts` (sem transação: o
 * MongoDB roda sem replica set).
 */

const MovimentoSchema = new Schema(
  {
    tipo: { type: String, enum: TIPOS_MOVIMENTO_EMPENHO, required: true },
    valorCentavos: { type: Number, required: true, min: 1 },
    ato: { type: String, required: true, trim: true, maxlength: 200 },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const ReservaSchema = new Schema(
  {
    cotacaoId: { type: Schema.Types.ObjectId, ref: 'CotacaoMaterial', required: true },
    valorCentavos: { type: Number, required: true, min: 0 },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const EmpenhoSchema = new Schema(
  {
    numero: { type: String, required: true, trim: true, maxlength: 40 },
    exercicio: { type: Number, required: true, min: 2000, max: 2100 },
    contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', default: null },
    valorInicialCentavos: { type: Number, required: true, min: 1 },
    movimentos: { type: [MovimentoSchema], default: [] },
    valorLiquidoCentavos: { type: Number, required: true, min: 0 },
    reservas: { type: [ReservaSchema], default: [] },
    comprometidoCentavos: { type: Number, required: true, default: 0, min: 0 },
    vigenciaFim: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    ativo: { type: Boolean, required: true, default: true },
    criadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

EmpenhoSchema.index({ numero: 1 }, { unique: true });
EmpenhoSchema.index({ 'reservas.cotacaoId': 1 });
EmpenhoSchema.index({ ativo: 1, exercicio: 1 });

export type Empenho = InferSchemaType<typeof EmpenhoSchema>;
export type EmpenhoDoc = Empenho & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

if (mongoose.models.Empenho) {
  delete mongoose.models.Empenho;
}

export const EmpenhoModel: Model<Empenho> = mongoose.model<Empenho>(
  'Empenho',
  EmpenhoSchema,
  'empenhosmaterial',
);
