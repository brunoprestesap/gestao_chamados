import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';
import { PAPEIS_EVENTO } from '@/shared/material/material.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Cada `enviar` recusado por impedimento (spec 0019, fatia 5, AC-43). Só
 * inclusão, como a trilha: alimenta o indicador "impedimento na primeira
 * tentativa" do relatório de material (AC-41). Não guarda valor nem texto
 * livre, só os códigos devolvidos.
 */
const CotacaoMaterialTentativaSchema = new Schema({
  cotacaoId: { type: Schema.Types.ObjectId, ref: 'CotacaoMaterial', required: true },
  acao: { type: String, enum: ['enviar'], required: true },
  impedimentos: { type: [String], default: [] },
  autorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  papel: { type: String, enum: PAPEIS_EVENTO, required: true },
  em: { type: Date, required: true },
});

CotacaoMaterialTentativaSchema.index({ cotacaoId: 1, em: 1 });
CotacaoMaterialTentativaSchema.index({ em: 1 });

somenteInclusao(CotacaoMaterialTentativaSchema, 'CotacaoMaterialTentativa');

export type CotacaoMaterialTentativa = InferSchemaType<typeof CotacaoMaterialTentativaSchema>;
export type CotacaoMaterialTentativaDoc = CotacaoMaterialTentativa & { _id: Types.ObjectId };

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
CotacaoMaterialTentativaSchema.plugin(pluginOrgao);

if (mongoose.models.CotacaoMaterialTentativa) {
  delete mongoose.models.CotacaoMaterialTentativa;
}

export const CotacaoMaterialTentativaModel: Model<CotacaoMaterialTentativa> =
  mongoose.model<CotacaoMaterialTentativa>(
    'CotacaoMaterialTentativa',
    CotacaoMaterialTentativaSchema,
    'cotacaomaterialtentativas',
  );
