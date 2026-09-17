import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  LLM_CALL_MODES,
  LLM_CALL_STATUSES,
  LLM_FAILURE_REASONS,
  LLM_FINISH_REASONS,
  LLM_LANES,
} from '@/lib/llm/types';

/**
 * Registro de uma chamada lógica ao modelo (spec 0001).
 * Gravado uma única vez e nunca atualizado; nunca guarda texto de prompt ou de resposta.
 */

/** 365 dias. Mudar depois exige `collMod` manual (o Mongoose não altera índice TTL existente). */
export const LLM_CALL_TTL_SECONDS = 31_536_000;

/** Amostragem efetiva da chamada (os seis campos ajustáveis). */
const LlmCallSamplingSchema = new Schema(
  {
    temperature: { type: Number, required: true },
    topP: { type: Number, required: true },
    topK: { type: Number, required: true },
    minP: { type: Number, required: true },
    presencePenalty: { type: Number, required: true },
    maxOutputTokens: { type: Number, required: true },
  },
  { _id: false },
);

const LlmCallSchema = new Schema(
  {
    task: { type: String, required: true, maxlength: 80 },
    promptVersion: { type: String, required: true, maxlength: 40 },
    model: { type: String, required: true },
    lane: { type: String, enum: LLM_LANES, required: true },
    mode: { type: String, enum: LLM_CALL_MODES, required: true },
    status: { type: String, enum: LLM_CALL_STATUSES, required: true },
    failureReason: { type: String, enum: [...LLM_FAILURE_REASONS, null], default: null },
    attempts: { type: Number, required: true, min: 0, max: 3 },
    queueMs: { type: Number, required: true, min: 0 },
    firstChunkMs: { type: Number, default: null },
    latencyMs: { type: Number, required: true, min: 0 },
    inputTokens: { type: Number, default: null },
    outputTokens: { type: Number, default: null },
    /** Motivo de parada normalizado pelo AI SDK; `null` quando nenhuma resposta terminou. */
    finishReason: { type: String, enum: [...LLM_FINISH_REASONS, null], default: null },
    /** `null` só quando a amostragem pedida foi rejeitada. Registros antigos leem `null`. */
    sampling: { type: LlmCallSamplingSchema, default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    refType: { type: String, maxlength: 40, default: null },
    refId: { type: String, maxlength: 64, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

LlmCallSchema.index({ createdAt: 1 }, { expireAfterSeconds: LLM_CALL_TTL_SECONDS });
LlmCallSchema.index({ status: 1, createdAt: -1 });
LlmCallSchema.index({ task: 1, createdAt: -1 });
LlmCallSchema.index({ refType: 1, refId: 1 });

export type LlmCall = InferSchemaType<typeof LlmCallSchema>;

export type LlmCallDoc = LlmCall & {
  _id: Types.ObjectId;
  createdAt: Date;
};

if (mongoose.models.LlmCall) {
  delete mongoose.models.LlmCall;
}

export const LlmCallModel: Model<LlmCall> = mongoose.model<LlmCall>('LlmCall', LlmCallSchema);
