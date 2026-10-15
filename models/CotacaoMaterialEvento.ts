import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  ACOES_COTACAO,
  PAPEIS_EVENTO,
  SITUACOES_COTACAO,
} from '@/shared/material/material.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Trilha da cotação de material (spec 0019, AC-9). Só inclusão: cada
 * transição grava situação anterior e nova, autor, papel, limite e faixa no
 * ato, a base e o preço de cada item, os parâmetros vigentes e o motivo.
 * Nunca muda nem se apaga (RN-39).
 */

const ItemNoAtoSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, required: true },
    descricao: { type: String, required: true },
    quantidade: { type: Number, required: true },
    origem: { type: String, default: null },
    baseAplicada: { type: String, default: null },
    precoAplicadoCentavos: { type: Number, default: null },
    quantidadeExecutada: { type: Number, default: null },
  },
  { _id: false },
);

const CotacaoMaterialEventoSchema = new Schema({
  cotacaoId: { type: Schema.Types.ObjectId, ref: 'CotacaoMaterial', required: true },
  de: { type: String, enum: [...SITUACOES_COTACAO, null], default: null },
  para: { type: String, enum: SITUACOES_COTACAO, required: true },
  acao: { type: String, enum: [...ACOES_COTACAO, 'conciliar'], required: true },
  autorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  // O nome no momento: a trilha não muda se o usuário mudar de nome depois.
  autorNome: { type: String, default: null },
  papel: { type: String, enum: PAPEIS_EVENTO, required: true },
  faixaId: { type: Schema.Types.ObjectId, ref: 'FaixaCompetencia', default: null },
  limiteCentavosNoAto: { type: Number, default: null },
  parametrosNoAto: { type: Schema.Types.Mixed, default: null },
  itensNoAto: { type: [ItemNoAtoSchema], default: [] },
  advertenciasNoAto: { type: [String], default: [] },
  motivo: { type: String, default: null, maxlength: 2000 },
  empenhoId: { type: Schema.Types.ObjectId, ref: 'Empenho', default: null },
  // Valor reservado (positivo) ou liberado (negativo) no ato.
  valorCentavos: { type: Number, default: null },
  em: { type: Date, required: true },
});

CotacaoMaterialEventoSchema.index({ cotacaoId: 1, em: 1 });
CotacaoMaterialEventoSchema.index({ empenhoId: 1, em: 1 });

somenteInclusao(CotacaoMaterialEventoSchema, 'CotacaoMaterialEvento');

export type CotacaoMaterialEvento = InferSchemaType<typeof CotacaoMaterialEventoSchema>;
export type CotacaoMaterialEventoDoc = CotacaoMaterialEvento & { _id: Types.ObjectId };

if (mongoose.models.CotacaoMaterialEvento) {
  delete mongoose.models.CotacaoMaterialEvento;
}

export const CotacaoMaterialEventoModel: Model<CotacaoMaterialEvento> =
  mongoose.model<CotacaoMaterialEvento>(
    'CotacaoMaterialEvento',
    CotacaoMaterialEventoSchema,
    'cotacaomaterialeventos',
  );
