import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';

/**
 * Um mês do SINAPI já completo (spec 0019, fatia 3): criado só depois de
 * todas as linhas do mês, ele é a chave que torna o mês visível. Os meses são
 * imutáveis, sem remoção nem reimportação. O mês mais recente é o maior
 * `referencia`.
 */
const SinapiReferenciaSchema = new Schema({
  referencia: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  quantidade: { type: Number, required: true, min: 0 },
  importacaoId: { type: Schema.Types.ObjectId, ref: 'ImportacaoMaterial', required: true },
  em: { type: Date, required: true },
});

// Spec 0025 (AC-11): único dentro do órgão; o índice antigo, sem órgão, fica no banco até a spec 39.
SinapiReferenciaSchema.index({ orgaoId: 1, referencia: 1 }, { unique: true });

export type SinapiReferencia = InferSchemaType<typeof SinapiReferenciaSchema>;
export type SinapiReferenciaDoc = SinapiReferencia & { _id: Types.ObjectId };

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
SinapiReferenciaSchema.plugin(pluginOrgao);

if (mongoose.models.SinapiReferencia) {
  delete mongoose.models.SinapiReferencia;
}

export const SinapiReferenciaModel: Model<SinapiReferencia> = mongoose.model<SinapiReferencia>(
  'SinapiReferencia',
  SinapiReferenciaSchema,
  'sinapireferencias',
);
