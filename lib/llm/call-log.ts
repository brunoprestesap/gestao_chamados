import 'server-only';

import { Types } from 'mongoose';

import { dbConnect } from '@/lib/db';
import type {
  LlmCallMode,
  LlmCallStatus,
  LlmFailureReason,
  LlmFinishReason,
  LlmLane,
  LlmSampling,
} from '@/lib/llm/types';
import { LlmCallModel } from '@/models/LlmCall';

export type LlmCallRecord = {
  /** Vira o `_id` do documento; o mesmo valor sai em `meta.callId`. */
  callId: string;
  task: string;
  promptVersion: string;
  model: string;
  lane: LlmLane;
  mode: LlmCallMode;
  status: LlmCallStatus;
  failureReason: LlmFailureReason | null;
  attempts: number;
  queueMs: number;
  firstChunkMs: number | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: LlmFinishReason | null;
  /** Valores efetivos; `null` quando a amostragem pedida foi rejeitada. */
  sampling: LlmSampling | null;
  userId: string | null;
  refType: string | null;
  refId: string | null;
};

/**
 * Grava o `LlmCall` sem que quem chama precise esperar.
 * A promessa nunca rejeita: uma falha ao gravar só vira log e não altera o
 * resultado entregue à funcionalidade.
 */
export async function recordLlmCall(record: LlmCallRecord): Promise<void> {
  const { callId, ...fields } = record;
  try {
    await dbConnect();
    await LlmCallModel.create({
      ...fields,
      _id: new Types.ObjectId(callId),
      userId:
        record.userId && Types.ObjectId.isValid(record.userId)
          ? new Types.ObjectId(record.userId)
          : null,
    });
  } catch (err) {
    console.error(
      '[llm] falha ao gravar LlmCall:',
      JSON.stringify({
        task: record.task,
        status: record.status,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
  }
}
