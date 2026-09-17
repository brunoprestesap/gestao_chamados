import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { CONVERSA_PREVIA_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * Conversa do solicitante (spec 0002). Nasce como rascunho do dono, antes de
 * existir qualquer chamado, e passa a pertencer a um chamado na confirmação.
 *
 * Ninguém escreve nesta coleção sem passar por `lib/conversas/`: os valores
 * derivados (`previa`, `mensagensCount`, `ultimaMensagemEm`) são mantidos lá,
 * na mesma gravação condicional que aplica os limites.
 */

const ConversaSchema = new Schema(
  {
    /** Dono da conversa. Vem sempre da sessão verificada, nunca do corpo do pedido. */
    solicitanteId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Gravado uma única vez, no vínculo. Depois disso nunca muda. */
    chamadoId: { type: Schema.Types.ObjectId, ref: 'Chamado', default: null },
    /** Id gerado na reserva e reusado em toda repetição da confirmação. */
    chamadoIdReservado: { type: Schema.Types.ObjectId, default: null },
    /** Marca a reserva em andamento; vale por `CONVERSA_RESERVA_MS`. */
    vinculandoEm: { type: Date, default: null },
    /** Começo da primeira mensagem do solicitante, para a lista lateral. */
    previa: { type: String, default: '', maxlength: CONVERSA_PREVIA_MAX },
    /** Incrementado na mesma gravação que aplica o teto de mensagens do rascunho. */
    mensagensCount: { type: Number, required: true, default: 0, min: 0 },
    /** Ordena a lista lateral. Começa igual ao `createdAt`, antes de existir mensagem. */
    ultimaMensagemEm: { type: Date, required: true },
    /**
     * `ultimaMensagemEm` mais `CONVERSA_RASCUNHO_DIAS` enquanto é rascunho.
     * Vira `null` na reserva e nunca volta: conversa ligada não expira.
     */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ConversaSchema.index({ solicitanteId: 1, chamadoId: 1, ultimaMensagemEm: -1 });
/** TTL do rascunho. O Mongo ignora documento cujo `expiresAt` não é data. */
ConversaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/** Uma conversa pertence a um único chamado. O parcial deixa vários `null` conviverem. */
ConversaSchema.index(
  { chamadoId: 1 },
  { unique: true, partialFilterExpression: { chamadoId: { $type: 'objectId' } } },
);

export type Conversa = InferSchemaType<typeof ConversaSchema>;

export type ConversaDoc = Conversa & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.Conversa) {
  delete mongoose.models.Conversa;
}

export const ConversaModel: Model<Conversa> = mongoose.model<Conversa>('Conversa', ConversaSchema);
