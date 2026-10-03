import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { COLECOES_ATIVOS } from '@/shared/ativos/ativo.constants';
import { DOCUMENTO_SITUACOES, LIMITES_ALERTA } from '@/shared/ativos/documento.constants';

/**
 * Laudo ou certificado preso a um ativo **ou** a um local (spec 0013).
 * No máximo um `vigente` por tipo e alvo (índices únicos parciais). Nunca é
 * apagado: o fim é `excluido`, e o arquivo continua no disco.
 * `emitidoEm` e `validadeAte` são datas sem hora, gravadas como meia noite UTC.
 */
const DocumentoAtivoSchema = new Schema(
  {
    tipo: { type: String, required: true, trim: true, lowercase: true },
    ativoId: { type: Schema.Types.ObjectId, ref: 'Ativo', default: null },
    localizacaoId: { type: Schema.Types.ObjectId, ref: 'Localizacao', default: null },
    arquivo: {
      type: new Schema(
        {
          filename: { type: String, required: true },
          originalName: { type: String, required: true },
          mimeType: { type: String, required: true },
          size: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    numero: { type: String, trim: true, maxlength: 80, default: null },
    emitidoPor: { type: String, trim: true, maxlength: 120, default: null },
    emitidoEm: { type: Date, required: true },
    validadeAte: { type: Date, default: null },
    situacao: { type: String, enum: DOCUMENTO_SITUACOES, default: 'vigente' },
    substituidoPorId: { type: Schema.Types.ObjectId, ref: 'DocumentoAtivo', default: null },
    substituidoEm: { type: Date, default: null },
    excluidoPorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    excluidoEm: { type: Date, default: null },
    motivoExclusao: { type: String, trim: true, maxlength: 500, default: null },
    alertasEnviados: { type: [{ type: String, enum: LIMITES_ALERTA }], default: [] },
    cadastradoPorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

DocumentoAtivoSchema.pre('validate', function () {
  const temAtivo = Boolean(this.ativoId);
  const temLocal = Boolean(this.localizacaoId);
  if (temAtivo === temLocal) {
    this.invalidate('ativoId', 'O documento é de um ativo ou de um local, nunca dos dois.');
  }
  if (this.validadeAte && this.emitidoEm && this.validadeAte < this.emitidoEm) {
    this.invalidate('validadeAte', 'A validade não pode ser anterior à emissão.');
  }
});

DocumentoAtivoSchema.index(
  { tipo: 1, ativoId: 1 },
  {
    unique: true,
    partialFilterExpression: { situacao: 'vigente', ativoId: { $type: 'objectId' } },
  },
);
DocumentoAtivoSchema.index(
  { tipo: 1, localizacaoId: 1 },
  {
    unique: true,
    partialFilterExpression: { situacao: 'vigente', localizacaoId: { $type: 'objectId' } },
  },
);
DocumentoAtivoSchema.index({ situacao: 1, validadeAte: 1 });
DocumentoAtivoSchema.index({ ativoId: 1, situacao: 1 });
DocumentoAtivoSchema.index({ localizacaoId: 1, situacao: 1 });

export type DocumentoAtivo = InferSchemaType<typeof DocumentoAtivoSchema>;

export type DocumentoAtivoDoc = DocumentoAtivo & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.DocumentoAtivo) {
  delete mongoose.models.DocumentoAtivo;
}

export const DocumentoAtivoModel: Model<DocumentoAtivo> = mongoose.model<DocumentoAtivo>(
  'DocumentoAtivo',
  DocumentoAtivoSchema,
  COLECOES_ATIVOS.documentos,
);
