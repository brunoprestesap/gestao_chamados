import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { COLECOES_ATIVOS, CRITICIDADES } from '@/shared/ativos/ativo.constants';

/** Categoria de ativo (spec 0011). Só o Admin escreve. */
const CategoriaAtivoSchema = new Schema(
  {
    chave: { type: String, required: true, trim: true, lowercase: true },
    nome: { type: String, required: true, trim: true },
    // Liga a categoria ao catálogo: sugere tipo e subtipo no formulário do chamado.
    serviceSubTypeId: { type: Schema.Types.ObjectId, ref: 'ServiceSubType', default: null },
    criticidadePadrao: { type: String, enum: CRITICIDADES, required: true },
    periodicidadePreventivaDias: { type: Number, default: null, min: 1 },
    exigeDocumento: { type: [String], default: [] },
    vidaUtilAnos: { type: Number, default: null, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CategoriaAtivoSchema.index({ chave: 1 }, { unique: true });
CategoriaAtivoSchema.index({ nome: 1 }, { unique: true });

export type CategoriaAtivo = InferSchemaType<typeof CategoriaAtivoSchema>;

export type CategoriaAtivoDoc = CategoriaAtivo & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.CategoriaAtivo) {
  delete mongoose.models.CategoriaAtivo;
}

export const CategoriaAtivoModel: Model<CategoriaAtivo> = mongoose.model<CategoriaAtivo>(
  'CategoriaAtivo',
  CategoriaAtivoSchema,
  COLECOES_ATIVOS.categorias,
);
