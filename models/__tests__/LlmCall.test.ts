import { describe, expect, it } from 'vitest';

import { LLM_CALL_TTL_SECONDS, LlmCallModel } from '@/models/LlmCall';

describe('LlmCallModel', () => {
  const paths = LlmCallModel.schema.paths;

  it('usa a coleção llmcalls', () => {
    expect(LlmCallModel.collection.collectionName).toBe('llmcalls');
  });

  it('tem exatamente os campos do modelo de dados da spec 0001', () => {
    const fields = Object.keys(paths)
      .filter((p) => p !== '__v')
      .sort();

    expect(fields).toEqual(
      [
        '_id',
        'attempts',
        'createdAt',
        'failureReason',
        'finishReason',
        'firstChunkMs',
        'inputTokens',
        'latencyMs',
        'lane',
        'mode',
        'model',
        'outputTokens',
        'promptVersion',
        'queueMs',
        'refId',
        'refType',
        'sampling',
        'status',
        'task',
        'userId',
      ].sort(),
    );
  });

  it('não tem updatedAt (documento gravado uma única vez)', () => {
    expect(paths).not.toHaveProperty('updatedAt');
  });

  it('não guarda texto de prompt nem de resposta', () => {
    const fields = Object.keys(paths).join(' ');
    expect(fields).not.toMatch(/prompt(?!Version)|system|message|content|text|output(?!Tokens)/i);
  });

  it('valida enums e limites', () => {
    const doc = new LlmCallModel({
      task: 'x'.repeat(81),
      promptVersion: 'v1',
      model: 'm',
      lane: 'turbo',
      mode: 'object',
      status: 'failed',
      failureReason: 'explodiu',
      finishReason: 'cansou',
      attempts: 4,
      queueMs: 0,
      latencyMs: 10,
    });

    const errors = doc.validateSync()?.errors ?? {};

    expect(Object.keys(errors).sort()).toEqual([
      'attempts',
      'failureReason',
      'finishReason',
      'lane',
      'task',
    ]);
  });

  it('grava finishReason e a amostragem efetiva sem _id no subdocumento', () => {
    const sampling = {
      temperature: 0.7,
      topP: 0.8,
      topK: 20,
      minP: 0,
      presencePenalty: 0,
      maxOutputTokens: 512,
    };
    const doc = new LlmCallModel({
      task: 'abertura.classificar',
      promptVersion: 'v1',
      model: 'qwen3-8b',
      lane: 'interactive',
      mode: 'object',
      status: 'failed',
      failureReason: 'invalid_output',
      finishReason: 'length',
      sampling,
      attempts: 1,
      queueMs: 0,
      latencyMs: 9_000,
    });

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.finishReason).toBe('length');
    expect(doc.toObject().sampling).toEqual(sampling);
  });

  it('amostragem incompleta é recusada', () => {
    const doc = new LlmCallModel({
      task: 't',
      promptVersion: 'v1',
      model: 'm',
      lane: 'batch',
      mode: 'object',
      status: 'success',
      sampling: { temperature: 0.7 },
      attempts: 1,
      queueMs: 0,
      latencyMs: 10,
    });

    const errors = Object.keys(doc.validateSync()?.errors ?? {});

    expect(errors).toEqual(expect.arrayContaining(['sampling.topP', 'sampling.maxOutputTokens']));
  });

  it('aceita um registro de falha com failureReason e padrões nulos', () => {
    const doc = new LlmCallModel({
      task: 'abertura.classificar',
      promptVersion: 'v1',
      model: 'Qwen/Qwen3-14B',
      lane: 'interactive',
      mode: 'stream_object',
      status: 'failed',
      failureReason: 'timeout',
      attempts: 2,
      queueMs: 12,
      latencyMs: 20_000,
    });

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.userId).toBeNull();
    expect(doc.firstChunkMs).toBeNull();
    expect(doc.inputTokens).toBeNull();
    expect(doc.refType).toBeNull();
    expect(doc.finishReason).toBeNull();
    expect(doc.sampling).toBeNull();
  });

  it('tem o TTL de 365 dias e os índices da spec', () => {
    const indexes = LlmCallModel.schema.indexes();

    expect(LLM_CALL_TTL_SECONDS).toBe(365 * 24 * 60 * 60);
    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ createdAt: 1 }, expect.objectContaining({ expireAfterSeconds: LLM_CALL_TTL_SECONDS })],
        [{ status: 1, createdAt: -1 }, expect.anything()],
        [{ task: 1, createdAt: -1 }, expect.anything()],
        [{ refType: 1, refId: 1 }, expect.anything()],
      ]),
    );
    expect(indexes).toHaveLength(4);
  });
});
