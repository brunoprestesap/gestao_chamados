import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { MAX_ITEM_ANEXO_V } from '@/shared/material/material.constants';

/**
 * Item do Anexo V de um contrato (spec 0019, fatia 3). Cada importação grava
 * uma versão nova, `(contratoId, numero, versao)`, inclusive os itens sem
 * mudança. Vigente não é campo do item: são os itens do contrato cuja
 * `versao` é a do ponteiro em `AnexoVVigencia`. Toda escrita em `anomalia` é
 * `$set` por caminho de campo, para o recálculo e a marcação manual não
 * apagarem um ao outro.
 */

const HistoricoCodigoSchema = new Schema(
  {
    de: { type: String, default: null },
    para: { type: String, default: null },
    // Texto do Admin ou `importacao` quando o código mudou pelo CSV.
    motivo: { type: String, required: true, maxlength: 500 },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const AnomaliaSchema = new Schema(
  {
    // Só o recálculo muda estes dois: acima do SINAPI do mês mais recente.
    automatica: { type: Boolean, default: false },
    referenciaSinapi: { type: String, default: null },
    // A marca do Admin, herdada pela versão nova do mesmo número.
    manual: { type: Boolean, default: false },
    motivo: { type: String, default: null, maxlength: 500 },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    em: { type: Date, default: null },
  },
  { _id: false },
);

const HistoricoAnomaliaSchema = new Schema(
  {
    manual: { type: Boolean, required: true },
    motivo: { type: String, required: true, maxlength: 500 },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const AnexoVItemSchema = new Schema(
  {
    contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
    numero: { type: Number, required: true, min: 1, max: MAX_ITEM_ANEXO_V },
    versao: { type: Number, required: true, min: 1 },
    descricao: { type: String, required: true, trim: true, maxlength: 300 },
    // Até 20, a mesma medida do item da cotação, que recebe a unidade da tabela.
    unidade: { type: String, required: true, trim: true, maxlength: 20 },
    quantidadeEstimada: { type: Number, required: true, min: 0 },
    precoPactuadoCentavos: { type: Number, required: true, min: 1 },
    // Só dígitos, sem zeros à esquerda (a forma de `SinapiInsumo.codigo`).
    sinapiCodigo: { type: String, default: null },
    sinapiCodigoHistorico: { type: [HistoricoCodigoSchema], default: [] },
    anomalia: { type: AnomaliaSchema, default: () => ({}) },
    anomaliaHistorico: { type: [HistoricoAnomaliaSchema], default: [] },
    // Descrição sem acento e em minúsculas, para a busca do caminho 1.
    descricaoBusca: { type: String, required: true },
  },
  { timestamps: true },
);

AnexoVItemSchema.index({ contratoId: 1, numero: 1, versao: 1 }, { unique: true });
AnexoVItemSchema.index({ contratoId: 1, versao: 1, sinapiCodigo: 1 });

export type AnexoVItem = InferSchemaType<typeof AnexoVItemSchema>;
export type AnexoVItemDoc = AnexoVItem & { _id: Types.ObjectId };

if (mongoose.models.AnexoVItem) {
  delete mongoose.models.AnexoVItem;
}

export const AnexoVItemModel: Model<AnexoVItem> = mongoose.model<AnexoVItem>(
  'AnexoVItem',
  AnexoVItemSchema,
  'anexovitens',
);
