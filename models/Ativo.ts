import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  ATIVO_STATUSES,
  COLECOES_ATIVOS,
  CRITICIDADES,
  ORIGENS_CODIGO,
  STATUS_CADASTRO,
  TIERS_MANUTENCAO,
} from '@/shared/ativos/ativo.constants';
import {
  CRITERIOS_SUBSTITUICAO,
  MOTIVO_DISPENSA_MAX,
  MOTIVO_DISPENSA_MIN,
} from '@/shared/ativos/substituicao.constants';

/**
 * Dados que vieram do SICAM. Só leitura no Sigma, e só Admin e Preposto
 * recebem (nome e matrícula do responsável pelo termo, LGPD).
 */
const CamposPatrimoniaisSchema = new Schema(
  {
    lotacao: String,
    setor: String,
    responsavelMatricula: String,
    responsavelNome: String,
    dataTombo: Date,
    garantiaInicio: Date,
    garantiaFim: Date,
    valorHistorico: Number,
    codigoMaterial: String,
    fornecedor: String,
    numeroSerie: String,
    importadoEm: { type: Date, required: true },
    // Escrito só pelo importador (spec 0012); o pacote da vistoria leva só um booleano.
    ausenteNoSicamDesde: Date,
  },
  { _id: false },
);

/**
 * A dispensa mais recente de candidato à substituição (spec 0015). As
 * anteriores ficam no `AtivoHistory`. Só `dispensarSubstituicao` e
 * `desfazerDispensaSubstituicao` (`lib/ativos/substituicao.ts`) escrevem; `em`
 * é a versão da escrita condicional.
 */
const DispensaSubstituicaoSchema = new Schema(
  {
    // Dia sem hora (meia noite UTC).
    ate: { type: Date, required: true },
    motivo: {
      type: String,
      required: true,
      trim: true,
      minlength: MOTIVO_DISPENSA_MIN,
      maxlength: MOTIVO_DISPENSA_MAX,
    },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    em: { type: Date, required: true },
    motivosNaDispensa: {
      type: [{ type: String, enum: CRITERIOS_SUBSTITUICAO }],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length > 0,
        message: 'A dispensa precisa de ao menos um critério.',
      },
    },
  },
  { _id: false },
);

/**
 * Equipamento (spec 0011). `codigo` é o tombamento normalizado ou o
 * `MNT-####` interno, único e imutável. Ativo nunca é apagado: o fim é
 * `status: 'baixado'`.
 */
const AtivoSchema = new Schema(
  {
    codigo: { type: String, required: true, trim: true },
    origemCodigo: { type: String, enum: ORIGENS_CODIGO, required: true },
    tombamento: { type: String, default: null },
    descricao: { type: String, required: true, trim: true },
    categoriaId: { type: Schema.Types.ObjectId, ref: 'CategoriaAtivo', required: true },
    localizacaoId: { type: Schema.Types.ObjectId, ref: 'Localizacao', default: null },
    fabricante: { type: String, trim: true, default: null },
    modelo: { type: String, trim: true, default: null },
    numeroSerie: { type: String, trim: true, default: null },
    dataInstalacao: { type: Date, default: null },
    criticidade: { type: String, enum: CRITICIDADES, required: true },
    tierManutencao: { type: String, enum: TIERS_MANUTENCAO, required: true },
    status: { type: String, enum: ATIVO_STATUSES, default: 'em_operacao' },
    statusCadastro: { type: String, enum: STATUS_CADASTRO, required: true },
    validadoPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    validadoEm: { type: Date, default: null },
    camposPatrimoniais: { type: CamposPatrimoniaisSchema, default: undefined },
    // O `clientOpId` do cadastro em campo que criou o ativo (spec 0012): o
    // reenvio depois de uma queda acha o ativo por aqui, sem criar outro.
    origemOpId: { type: String, default: undefined },
    dispensaSubstituicao: { type: DispensaSubstituicaoSchema, default: undefined },
  },
  { timestamps: true },
);

AtivoSchema.index({ codigo: 1 }, { unique: true });
AtivoSchema.index({ categoriaId: 1, status: 1 });
AtivoSchema.index({ localizacaoId: 1 });
AtivoSchema.index({ statusCadastro: 1 });
AtivoSchema.index({ tierManutencao: 1, status: 1 });
AtivoSchema.index(
  { origemOpId: 1 },
  { unique: true, partialFilterExpression: { origemOpId: { $type: 'string' } } },
);

export type Ativo = InferSchemaType<typeof AtivoSchema>;

export type AtivoDoc = Ativo & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.Ativo) {
  delete mongoose.models.Ativo;
}

export const AtivoModel: Model<Ativo> = mongoose.model<Ativo>(
  'Ativo',
  AtivoSchema,
  COLECOES_ATIVOS.ativos,
);
