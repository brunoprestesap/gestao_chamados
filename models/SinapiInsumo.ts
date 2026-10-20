import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { SINAPI_REGIME, SINAPI_UF } from '@/shared/material/material.constants';

/**
 * Um insumo do SINAPI num mês de referência (spec 0019, fatia 3). O mês só
 * existe para a busca, a cópia e a anomalia quando há o `SinapiReferencia`
 * dele, criado depois de todas as linhas. UF e regime são constantes.
 */
const SinapiInsumoSchema = new Schema({
  referencia: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  // Só dígitos, sem zeros à esquerda (a forma de `AnexoVItem.sinapiCodigo`).
  codigo: { type: String, required: true, match: /^[1-9]\d*$/ },
  descricao: { type: String, required: true, trim: true, maxlength: 300 },
  unidade: { type: String, required: true, trim: true, maxlength: 20 },
  precoCentavos: { type: Number, required: true, min: 1 },
  uf: { type: String, required: true, default: SINAPI_UF },
  regime: { type: String, required: true, default: SINAPI_REGIME },
});

SinapiInsumoSchema.index({ referencia: 1, codigo: 1 }, { unique: true });
// Sem reduzir as palavras ao radical: "tubo" não acha "tubulação" por engano.
SinapiInsumoSchema.index(
  { descricao: 'text' },
  { default_language: 'none', name: 'busca_descricao' },
);

export type SinapiInsumo = InferSchemaType<typeof SinapiInsumoSchema>;
export type SinapiInsumoDoc = SinapiInsumo & { _id: Types.ObjectId };

if (mongoose.models.SinapiInsumo) {
  delete mongoose.models.SinapiInsumo;
}

export const SinapiInsumoModel: Model<SinapiInsumo> = mongoose.model<SinapiInsumo>(
  'SinapiInsumo',
  SinapiInsumoSchema,
  'sinapiinsumos',
);
