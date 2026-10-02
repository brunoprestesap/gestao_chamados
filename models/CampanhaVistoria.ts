import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { CAMPANHA_STATUSES, NOME_CAMPANHA_MAX } from '@/shared/vistoria/vistoria.constants';

/**
 * Rodada de vistoria em campo (spec 0012, parte 1). Só uma fica aberta por
 * vez, garantido pelo índice único parcial; encerrada não reabre.
 */
const CampanhaVistoriaSchema = new Schema(
  {
    nome: { type: String, required: true, trim: true, maxlength: NOME_CAMPANHA_MAX },
    status: { type: String, enum: CAMPANHA_STATUSES, default: 'aberta' },
    abertaPor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    abertaEm: { type: Date, required: true },
    encerradaPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    encerradaEm: { type: Date, default: null },
  },
  { timestamps: true },
);

CampanhaVistoriaSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'aberta' } },
);
CampanhaVistoriaSchema.index({ abertaEm: -1 });

export type CampanhaVistoria = InferSchemaType<typeof CampanhaVistoriaSchema>;

export type CampanhaVistoriaDoc = CampanhaVistoria & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.CampanhaVistoria) {
  delete mongoose.models.CampanhaVistoria;
}

export const CampanhaVistoriaModel: Model<CampanhaVistoria> = mongoose.model<CampanhaVistoria>(
  'CampanhaVistoria',
  CampanhaVistoriaSchema,
);
