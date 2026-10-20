import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  ESTADOS_IMPORTACAO_MATERIAL,
  TIPOS_IMPORTACAO_MATERIAL,
} from '@/shared/material/material.constants';

/**
 * Importação do Anexo V ou do SINAPI (spec 0019, fatia 3), no padrão de
 * `ImportacaoPatrimonial`: uma aberta por tipo (índice único parcial em
 * `emAberto`), revisão antes de aplicar e enxugamento ao fechar. A pendente
 * que ninguém aplicou nem descartou expira em 7 dias, sem rastro. A aplicação
 * roda sem transação, em passos que podem ser repetidos sem estrago.
 */

const ResumoSchema = new Schema(
  {
    total: { type: Number, default: 0 },
    novos: { type: Number, default: 0 },
    alterados: { type: Number, default: 0 },
    removidos: { type: Number, default: 0 },
  },
  { _id: false },
);

const ImportacaoMaterialSchema = new Schema(
  {
    tipo: { type: String, enum: TIPOS_IMPORTACAO_MATERIAL, required: true },
    // Anexo V: o contrato e a versão do ponteiro usada na revisão (nula na primeira).
    contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', default: null },
    versaoBase: { type: Number, default: null },
    // SINAPI: o mês, vindo do formulário.
    referencia: { type: String, default: null },
    arquivoNome: { type: String, required: true, trim: true, maxlength: 200 },
    // As linhas já interpretadas e a revisão para a tela; saem ao fechar.
    linhas: { type: [Schema.Types.Mixed], default: undefined },
    revisao: { type: Schema.Types.Mixed, default: undefined },
    resumo: { type: ResumoSchema, default: () => ({}) },
    estado: {
      type: String,
      enum: ESTADOS_IMPORTACAO_MATERIAL,
      required: true,
      default: 'pendente',
    },
    // Verdadeiro em `pendente` e `aplicando`: uma aberta por tipo.
    emAberto: { type: Boolean, default: true },
    aplicandoDesde: { type: Date, default: null },
    enviadaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    aplicadaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    aplicadaEm: { type: Date, default: null },
    descartadaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    descartadaEm: { type: Date, default: null },
    motivoDescarte: { type: String, default: null },
    expiraEm: { type: Date, required: true },
  },
  { timestamps: true },
);

ImportacaoMaterialSchema.index(
  { tipo: 1 },
  { unique: true, partialFilterExpression: { emAberto: true }, name: 'uma_aberta_por_tipo' },
);
// Só a pendente expira: a que está sendo aplicada, aplicada ou descartada fica.
ImportacaoMaterialSchema.index(
  { expiraEm: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { estado: 'pendente' },
    name: 'pendente_expira',
  },
);
ImportacaoMaterialSchema.index({ tipo: 1, createdAt: -1 });

export type ImportacaoMaterial = InferSchemaType<typeof ImportacaoMaterialSchema>;
export type ImportacaoMaterialDoc = ImportacaoMaterial & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.ImportacaoMaterial) {
  delete mongoose.models.ImportacaoMaterial;
}

export const ImportacaoMaterialModel: Model<ImportacaoMaterial> =
  mongoose.model<ImportacaoMaterial>(
    'ImportacaoMaterial',
    ImportacaoMaterialSchema,
    'importacoesmaterial',
  );
