import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { COLECOES_ATIVOS } from '@/shared/ativos/ativo.constants';

/**
 * Tipo de documento do ativo ou do local (spec 0013): PMOC, AVCB, ART...
 * Só o Admin escreve. A `chave` nunca muda, porque `CategoriaAtivo.exigeDocumento`
 * e `DocumentoAtivo.tipo` guardam a chave, não o `_id`.
 */
const TipoDocumentoSchema = new Schema(
  {
    chave: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_]{2,40}$/,
      immutable: true,
    },
    nome: { type: String, required: true, trim: true, maxlength: 80 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

TipoDocumentoSchema.index({ chave: 1 }, { unique: true });
TipoDocumentoSchema.index({ nome: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });

export type TipoDocumento = InferSchemaType<typeof TipoDocumentoSchema>;

export type TipoDocumentoDoc = TipoDocumento & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.TipoDocumento) {
  delete mongoose.models.TipoDocumento;
}

export const TipoDocumentoModel: Model<TipoDocumento> = mongoose.model<TipoDocumento>(
  'TipoDocumento',
  TipoDocumentoSchema,
  COLECOES_ATIVOS.tiposDocumento,
);
