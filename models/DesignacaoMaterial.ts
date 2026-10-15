import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { PAPEIS_DESIGNACAO } from '@/shared/material/material.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Designação para um papel no fluxo de material (spec 0019, AC-19). Só
 * inclusão: revogar grava a data por `revogarDesignacao`, nunca apaga.
 * Vigente: sem `revogadaEm` e hoje (Belém) entre início e fim.
 */
const DesignacaoMaterialSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  papel: { type: String, enum: PAPEIS_DESIGNACAO, required: true },
  faixaId: { type: Schema.Types.ObjectId, ref: 'FaixaCompetencia', default: null },
  vigenciaInicio: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  vigenciaFim: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
  ato: { type: String, required: true, trim: true, maxlength: 200 },
  criadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  em: { type: Date, required: true },
  revogadaEm: { type: Date, default: null },
  revogadaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

DesignacaoMaterialSchema.pre('validate', function () {
  if (this.papel === 'aprovador' && !this.faixaId) {
    throw new Error('Designação de aprovador precisa de faixa.');
  }
  if (this.vigenciaFim && this.vigenciaFim < this.vigenciaInicio) {
    throw new Error('O fim da vigência é anterior ao início.');
  }
});

DesignacaoMaterialSchema.index({ userId: 1, papel: 1 });
DesignacaoMaterialSchema.index({ papel: 1, revogadaEm: 1 });

somenteInclusao(DesignacaoMaterialSchema, 'DesignacaoMaterial', [
  'revogadaEm',
  'revogadaPorUserId',
]);

export type DesignacaoMaterial = InferSchemaType<typeof DesignacaoMaterialSchema>;
export type DesignacaoMaterialDoc = DesignacaoMaterial & { _id: Types.ObjectId };

if (mongoose.models.DesignacaoMaterial) {
  delete mongoose.models.DesignacaoMaterial;
}

export const DesignacaoMaterialModel: Model<DesignacaoMaterial> =
  mongoose.model<DesignacaoMaterial>(
    'DesignacaoMaterial',
    DesignacaoMaterialSchema,
    'designacoesmaterial',
  );
