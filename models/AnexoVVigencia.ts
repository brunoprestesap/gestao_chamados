import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

/**
 * O ponteiro da versão vigente do Anexo V de cada contrato (spec 0019,
 * fatia 3). Só muda por update condicional `{ contratoId, versao }`, o último
 * passo da aplicação, então o contrato nunca fica com duas versões vigentes
 * nem com nenhuma depois de uma queda.
 */
const AnexoVVigenciaSchema = new Schema({
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
  versao: { type: Number, required: true, min: 1 },
  importacaoId: { type: Schema.Types.ObjectId, ref: 'ImportacaoMaterial', required: true },
  em: { type: Date, required: true },
});

AnexoVVigenciaSchema.index({ contratoId: 1 }, { unique: true });

export type AnexoVVigencia = InferSchemaType<typeof AnexoVVigenciaSchema>;
export type AnexoVVigenciaDoc = AnexoVVigencia & { _id: Types.ObjectId };

if (mongoose.models.AnexoVVigencia) {
  delete mongoose.models.AnexoVVigencia;
}

export const AnexoVVigenciaModel: Model<AnexoVVigencia> = mongoose.model<AnexoVVigencia>(
  'AnexoVVigencia',
  AnexoVVigenciaSchema,
  'anexovvigencias',
);
