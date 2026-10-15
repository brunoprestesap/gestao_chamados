import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { TIPOS_ARQUIVO_COTACAO } from '@/shared/material/material.constants';

/**
 * Arquivo de uma cotação de material (spec 0019): orçamento, evidência da
 * aplicação ou nota fiscal. O disco guarda `<arquivoId>.<ext>`, nunca o nome
 * original. Remover só marca `removidoEm` e nunca apaga o disco.
 */
const ArquivoCotacaoSchema = new Schema({
  cotacaoId: { type: Schema.Types.ObjectId, ref: 'CotacaoMaterial', required: true },
  tipo: { type: String, enum: TIPOS_ARQUIVO_COTACAO, required: true },
  nomeOriginal: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true },
  tamanho: { type: Number, required: true, min: 1 },
  caminho: { type: String, required: true },
  enviadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  em: { type: Date, required: true },
  removidoEm: { type: Date, default: null },
  removidoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

ArquivoCotacaoSchema.index({ cotacaoId: 1, tipo: 1, removidoEm: 1 });

export type ArquivoCotacao = InferSchemaType<typeof ArquivoCotacaoSchema>;
export type ArquivoCotacaoDoc = ArquivoCotacao & { _id: Types.ObjectId };

if (mongoose.models.ArquivoCotacao) {
  delete mongoose.models.ArquivoCotacao;
}

export const ArquivoCotacaoModel: Model<ArquivoCotacao> = mongoose.model<ArquivoCotacao>(
  'ArquivoCotacao',
  ArquivoCotacaoSchema,
  'arquivoscotacao',
);
