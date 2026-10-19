import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { PAPEIS_EMISSAO_PDF } from '@/shared/material/material.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Cada PDF da cotação de material entregue (spec 0019, AC-23). Só inclusão,
 * como a trilha: o `_id` nasce antes do PDF e vai impresso no rodapé, e o
 * SHA-256 dos bytes entregues fica aqui, ligado a ele.
 */
const CotacaoMaterialPdfEmissaoSchema = new Schema({
  cotacaoId: { type: Schema.Types.ObjectId, ref: 'CotacaoMaterial', required: true },
  sha256: { type: String, required: true, match: /^[a-f\d]{64}$/ },
  porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Revisão de 19/10: o papel com que emitiu; emissões anteriores ficam sem ele.
  papel: { type: String, enum: PAPEIS_EMISSAO_PDF, default: null },
  em: { type: Date, required: true },
});

CotacaoMaterialPdfEmissaoSchema.index({ cotacaoId: 1, em: -1 });

somenteInclusao(CotacaoMaterialPdfEmissaoSchema, 'CotacaoMaterialPdfEmissao');

export type CotacaoMaterialPdfEmissao = InferSchemaType<typeof CotacaoMaterialPdfEmissaoSchema>;
export type CotacaoMaterialPdfEmissaoDoc = CotacaoMaterialPdfEmissao & { _id: Types.ObjectId };

if (mongoose.models.CotacaoMaterialPdfEmissao) {
  delete mongoose.models.CotacaoMaterialPdfEmissao;
}

export const CotacaoMaterialPdfEmissaoModel: Model<CotacaoMaterialPdfEmissao> =
  mongoose.model<CotacaoMaterialPdfEmissao>(
    'CotacaoMaterialPdfEmissao',
    CotacaoMaterialPdfEmissaoSchema,
    'cotacaomaterialpdfemissoes',
  );
