import mongoose, { InferSchemaType, Model, Query, Schema, Types } from 'mongoose';

import { TIPOS_MOVIMENTO_EMPENHO } from '@/shared/material/material.constants';

import { EscritaProibidaError } from './_somente-inclusao';

/**
 * Empenho de material (spec 0019). `comprometidoCentavos` é sempre a soma de
 * `reservas`, e nunca passa de `valorLiquidoCentavos`. Toda escrita no saldo
 * é um update condicional de `lib/material/saldo.ts` (sem transação: o
 * MongoDB roda sem replica set).
 */

const MovimentoSchema = new Schema(
  {
    tipo: { type: String, enum: TIPOS_MOVIMENTO_EMPENHO, required: true },
    valorCentavos: { type: Number, required: true, min: 1 },
    ato: { type: String, required: true, trim: true, maxlength: 200 },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const ReservaSchema = new Schema(
  {
    cotacaoId: { type: Schema.Types.ObjectId, ref: 'CotacaoMaterial', required: true },
    valorCentavos: { type: Number, required: true, min: 0 },
    em: { type: Date, required: true },
  },
  { _id: false },
);

/** Uma mudança de situação (spec 0022): só cresce, por `$push`. */
const SituacaoSchema = new Schema(
  {
    ativo: { type: Boolean, required: true },
    motivo: { type: String, required: true, trim: true, maxlength: 500 },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const EmpenhoSchema = new Schema(
  {
    numero: { type: String, required: true, trim: true, maxlength: 40 },
    exercicio: { type: Number, required: true, min: 2000, max: 2100 },
    contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', default: null },
    valorInicialCentavos: { type: Number, required: true, min: 1 },
    movimentos: { type: [MovimentoSchema], default: [] },
    valorLiquidoCentavos: { type: Number, required: true, min: 0 },
    reservas: { type: [ReservaSchema], default: [] },
    comprometidoCentavos: { type: Number, required: true, default: 0, min: 0 },
    vigenciaFim: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    ativo: { type: Boolean, required: true, default: true },
    historicoSituacao: { type: [SituacaoSchema], default: [] },
    criadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

/**
 * `historicoSituacao` só recebe `$push` (spec 0022, AC-4). O empenho não usa
 * `somenteInclusao`, porque reservas e movimentos precisam de `$pull` e `$inc`:
 * este hook recusa só as escritas que mudariam ou tirariam um item do histórico.
 */
const OPERADORES_QUE_ALTERAM = ['$set', '$unset', '$pull', '$pullAll', '$pop', '$rename'];
const tocaHistorico = (chave: unknown) =>
  typeof chave === 'string' && chave.startsWith('historicoSituacao');

function alteraHistorico(update: Record<string, unknown>): boolean {
  for (const [chave, valor] of Object.entries(update)) {
    // Chave solta no topo vira `$set` no Mongoose.
    if (!chave.startsWith('$')) {
      if (tocaHistorico(chave)) return true;
      continue;
    }
    if (!valor || typeof valor !== 'object') continue;
    const campos = valor as Record<string, unknown>;
    if (OPERADORES_QUE_ALTERAM.includes(chave)) {
      if (Object.keys(campos).some(tocaHistorico)) return true;
      if (chave === '$rename' && Object.values(campos).some(tocaHistorico)) return true;
    }
    // `$push` com `$slice` cortaria o histórico.
    if (chave === '$push') {
      const push = campos.historicoSituacao;
      if (push && typeof push === 'object' && '$slice' in push) return true;
    }
  }
  return false;
}

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
  EmpenhoSchema.pre(op, function (this: Query<unknown, unknown>) {
    const update = (this.getUpdate() ?? {}) as Record<string, unknown>;
    if (alteraHistorico(update)) throw new EscritaProibidaError('Empenho.historicoSituacao', op);
  });
}
for (const op of ['replaceOne', 'findOneAndReplace'] as const) {
  EmpenhoSchema.pre(op, function () {
    throw new EscritaProibidaError('Empenho', op);
  });
}

EmpenhoSchema.index({ numero: 1 }, { unique: true });
EmpenhoSchema.index({ 'reservas.cotacaoId': 1 });
EmpenhoSchema.index({ ativo: 1, exercicio: 1 });

export type Empenho = InferSchemaType<typeof EmpenhoSchema>;
export type EmpenhoDoc = Empenho & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

if (mongoose.models.Empenho) {
  delete mongoose.models.Empenho;
}

export const EmpenhoModel: Model<Empenho> = mongoose.model<Empenho>(
  'Empenho',
  EmpenhoSchema,
  'empenhosmaterial',
);
