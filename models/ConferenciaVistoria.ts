import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { PAPEIS_AUTOR } from '@/shared/vistoria/vistoria.constants';

/**
 * Uma conferência de ativo numa campanha (spec 0012, parte 1). A primeira que
 * chega vence: o índice único `{ campanhaId, ativoId }` é o árbitro. O
 * `clientOpId` (gerado no aparelho) é único, para reenviar sem duplicar, e
 * `efeitoAplicadoEm` marca que a escrita no ativo terminou.
 */
const ConferenciaVistoriaSchema = new Schema(
  {
    campanhaId: { type: Schema.Types.ObjectId, ref: 'CampanhaVistoria', required: true },
    ativoId: { type: Schema.Types.ObjectId, ref: 'Ativo', required: true },
    autorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    papelAutor: { type: String, enum: PAPEIS_AUTOR, required: true },
    localizacaoId: { type: Schema.Types.ObjectId, ref: 'Localizacao', required: true },
    // O que a pessoa informou, para comparar quando outra conferência venceu.
    fabricante: { type: String, trim: true, default: null },
    modelo: { type: String, trim: true, default: null },
    numeroSerie: { type: String, trim: true, default: null },
    cadastradoEmCampo: { type: Boolean, default: false },
    conferidoEm: { type: Date, required: true },
    recebidoEm: { type: Date, required: true },
    clientOpId: { type: String, required: true },
    efeitoAplicadoEm: { type: Date, default: null },
  },
  { timestamps: true },
);

ConferenciaVistoriaSchema.index({ campanhaId: 1, ativoId: 1 }, { unique: true });
ConferenciaVistoriaSchema.index({ clientOpId: 1 }, { unique: true });
ConferenciaVistoriaSchema.index({ ativoId: 1, conferidoEm: -1 });

export type ConferenciaVistoria = InferSchemaType<typeof ConferenciaVistoriaSchema>;

export type ConferenciaVistoriaDoc = ConferenciaVistoria & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.ConferenciaVistoria) {
  delete mongoose.models.ConferenciaVistoria;
}

export const ConferenciaVistoriaModel: Model<ConferenciaVistoria> =
  mongoose.model<ConferenciaVistoria>('ConferenciaVistoria', ConferenciaVistoriaSchema);
