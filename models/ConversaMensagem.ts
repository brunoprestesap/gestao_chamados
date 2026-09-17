import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { CONVERSA_AUTORES, CONVERSA_MENSAGEM_TIPOS } from '@/shared/conversas/conversa.constants';
import { CONVERSA_TEXTO_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * Mensagem de uma conversa (spec 0002). O `payload` é validado pelo schema Zod
 * do `tipo` antes de gravar; o Mongoose só garante o formato do envelope.
 *
 * Depois que a conversa vira chamado, o que o solicitante escreve vai para o
 * comentário do chamado, não para cá: o texto do relato existe em um lugar só.
 */

const ConversaMensagemSchema = new Schema(
  {
    conversaId: { type: Schema.Types.ObjectId, ref: 'Conversa', required: true },
    autor: { type: String, enum: CONVERSA_AUTORES, required: true },
    /** Só com autor `solicitante`; `null` nos outros. */
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    tipo: { type: String, enum: CONVERSA_MENSAGEM_TIPOS, required: true },
    /** Também é o texto lido por leitor de tela. */
    texto: { type: String, required: true, trim: true, maxlength: CONVERSA_TEXTO_MAX },
    /** Validado pelo schema Zod do `tipo` em `shared/conversas/` antes de chegar aqui. */
    payload: { type: Schema.Types.Mixed, default: null },
    /** `meta.callId` da chamada que gerou a mensagem, quando veio do modelo. */
    llmCallId: { type: Schema.Types.ObjectId, ref: 'LlmCall', default: null },
    /** Acompanha a conversa: mesma data enquanto rascunho, `null` depois do vínculo. */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/** Ordem de leitura da conversa: data e, no empate, `_id`. */
ConversaMensagemSchema.index({ conversaId: 1, createdAt: 1, _id: 1 });
ConversaMensagemSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ConversaMensagem = InferSchemaType<typeof ConversaMensagemSchema>;

export type ConversaMensagemDoc = ConversaMensagem & {
  _id: Types.ObjectId;
  createdAt: Date;
};

if (mongoose.models.ConversaMensagem) {
  delete mongoose.models.ConversaMensagem;
}

export const ConversaMensagemModel: Model<ConversaMensagem> = mongoose.model<ConversaMensagem>(
  'ConversaMensagem',
  ConversaMensagemSchema,
);
