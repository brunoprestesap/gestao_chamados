import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Faixa de competência do aprovador (spec 0019, AC-19). Imutável: mudar um
 * limite é criar faixa nova e designar de novo, então nada já gravado na
 * trilha muda (CA-21). Só `desativarFaixa` muda algo: `ativa` e, desde a
 * spec 0022, a data, o autor e o motivo, na mesma escrita.
 */
const FaixaCompetenciaSchema = new Schema({
  nome: { type: String, required: true, trim: true, maxlength: 80 },
  limiteCentavos: { type: Number, required: true, min: 1 },
  ativa: { type: Boolean, required: true, default: true },
  criadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  em: { type: Date, required: true },
  desativadaEm: { type: Date, default: null },
  desativadaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  desativadaMotivo: { type: String, trim: true, maxlength: 500, default: null },
});

somenteInclusao(FaixaCompetenciaSchema, 'FaixaCompetencia', [
  'ativa',
  'desativadaEm',
  'desativadaPorUserId',
  'desativadaMotivo',
]);

export type FaixaCompetencia = InferSchemaType<typeof FaixaCompetenciaSchema>;
export type FaixaCompetenciaDoc = FaixaCompetencia & { _id: Types.ObjectId };

if (mongoose.models.FaixaCompetencia) {
  delete mongoose.models.FaixaCompetencia;
}

export const FaixaCompetenciaModel: Model<FaixaCompetencia> = mongoose.model<FaixaCompetencia>(
  'FaixaCompetencia',
  FaixaCompetenciaSchema,
  'faixascompetencia',
);
