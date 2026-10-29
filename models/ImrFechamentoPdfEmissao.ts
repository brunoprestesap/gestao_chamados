import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { PAPEIS_EMISSAO_IMR } from '@/shared/imr-contrato/imr-contrato.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Cada PDF do fechamento do IMR do contrato entregue (spec 0023, AC-13). Só
 * inclusão: o `_id` nasce antes do PDF e vai impresso no rodapé, e o SHA-256
 * dos bytes entregues fica aqui, ligado à versão do fechamento.
 */
const ImrFechamentoPdfEmissaoSchema = new Schema({
  fechamentoId: { type: Schema.Types.ObjectId, ref: 'ImrFechamento', required: true },
  sha256: { type: String, required: true, match: /^[a-f\d]{64}$/ },
  porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  papel: { type: String, enum: PAPEIS_EMISSAO_IMR, required: true },
  em: { type: Date, required: true },
});

ImrFechamentoPdfEmissaoSchema.index({ fechamentoId: 1, em: -1 });

somenteInclusao(ImrFechamentoPdfEmissaoSchema, 'ImrFechamentoPdfEmissao');

export type ImrFechamentoPdfEmissao = InferSchemaType<typeof ImrFechamentoPdfEmissaoSchema>;
export type ImrFechamentoPdfEmissaoDoc = ImrFechamentoPdfEmissao & { _id: Types.ObjectId };

if (mongoose.models.ImrFechamentoPdfEmissao) {
  delete mongoose.models.ImrFechamentoPdfEmissao;
}

export const ImrFechamentoPdfEmissaoModel: Model<ImrFechamentoPdfEmissao> =
  mongoose.model<ImrFechamentoPdfEmissao>(
    'ImrFechamentoPdfEmissao',
    ImrFechamentoPdfEmissaoSchema,
    'imr_fechamento_pdf_emissoes',
  );
