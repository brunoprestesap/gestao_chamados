import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { PAPEIS_IMR, TIPOS_MARCACAO } from '@/shared/imr-contrato/imr-contrato.constants';

import { somenteInclusao } from './_somente-inclusao';

/**
 * Fechamento mensal do IMR do contrato (spec 0023, AC-10, AC-11). A foto
 * guarda os pontos dos quatro indicadores, as linhas de ocorrência, a soma, a
 * faixa, a reincidência e os parâmetros do ato; a tela e o PDF leem só dela,
 * sem recalcular. Só inclusão: reabrir grava um `ImrReabertura`, e o próximo
 * fechamento é a versão seguinte. O índice único `{ contratoId, competencia,
 * versao }` resolve dois fechamentos simultâneos (AC-18). Tem nome de
 * solicitante (LGPD), como o PDF da spec 0016.
 */

const MarcacaoSchema = new Schema(
  {
    motivo: { type: String, required: true },
    porNome: { type: String, required: true },
    papel: { type: String, enum: PAPEIS_IMR, required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const marcacoes = {
  marcacao: { type: MarcacaoSchema, default: null },
  desconsideracao: { type: MarcacaoSchema, default: null },
  naoAtendimento: { type: MarcacaoSchema, default: null },
};

const SITUACOES = ['atraso', 'nao_atendimento', 'desconsiderada'] as const;

const LinhaI3Schema = new Schema(
  {
    chamadoId: { type: String, required: true },
    ticketNumber: { type: String, required: true },
    solicitanteNome: String,
    setor: String,
    solicitadoEm: { type: Date, required: true },
    descricao: String,
    iniciadoEm: { type: Date, default: null },
    tempoAteInicioMin: { type: Number, default: null },
    prazo: { type: Date, required: true },
    atraso: { type: Boolean, required: true },
    situacao: { type: String, enum: SITUACOES, required: true },
    ...marcacoes,
  },
  { _id: false },
);

const LinhaI4Schema = new Schema(
  {
    cotacaoId: { type: String, required: true },
    numero: { type: String, required: true },
    chamadoTicketNumber: String,
    autorizadoEm: { type: Date, default: null },
    prazo: { type: Date, required: true },
    prazoEstimado: { type: Boolean, required: true },
    executadoEm: { type: Date, default: null },
    atraso: { type: Boolean, required: true },
    situacao: { type: String, enum: SITUACOES, required: true },
    ...marcacoes,
  },
  { _id: false },
);

const contagens = {
  pontos: { type: Number, required: true, min: 0, max: 20 },
  ocorrencias: { type: Number, required: true },
  desconsideradas: { type: Number, required: true },
  zeradoPorMarcacao: { type: Boolean, required: true },
  base: { type: Number, required: true },
  noPrazo: { type: Number, required: true },
  aguardandoPrazo: { type: Number, required: true },
};

const I3Schema = new Schema(
  {
    ...contagens,
    semRegistroDeInicio: { type: Number, required: true },
    linhas: { type: [LinhaI3Schema], default: [] },
  },
  { _id: false },
);

const I4Schema = new Schema(
  {
    ...contagens,
    prazosEstimados: { type: Number, required: true },
    linhas: { type: [LinhaI4Schema], default: [] },
  },
  { _id: false },
);

const ForaDaBaseSchema = new Schema(
  {
    indicador: { type: Number, enum: [3, 4], required: true },
    alvoId: { type: String, required: true },
    alvoNumero: String,
    tipo: { type: String, enum: TIPOS_MARCACAO, required: true },
    motivo: { type: String, required: true },
    porNome: { type: String, required: true },
    papel: { type: String, enum: PAPEIS_IMR, required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const pontosLancados = (max: number) =>
  new Schema(
    {
      pontos: { type: Number, required: true, min: 0, max },
      observacao: { type: String, default: null },
    },
    { _id: false },
  );

const ImrFechamentoSchema = new Schema({
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
  competencia: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  versao: { type: Number, required: true, min: 1 },
  i1: { type: pontosLancados(40), required: true },
  i2: { type: pontosLancados(20), required: true },
  i3: { type: I3Schema, required: true },
  i4: { type: I4Schema, required: true },
  marcacoesForaDaBase: { type: [ForaDaBaseSchema], default: [] },
  total: { type: Number, required: true, min: 0, max: 100 },
  faixa: {
    fator: { type: Number, required: true },
    percentual: { type: Number, required: true },
  },
  reincidenciaZero: { type: [Number], default: [] },
  reincidenciaAvaliada: { type: Boolean, required: true },
  parametros: {
    prazoFornecimentoDiasUteis: { type: Number, required: true },
    expediente: {
      dias: { type: [Number], required: true },
      inicio: { type: String, required: true },
      fim: { type: String, required: true },
      fuso: { type: String, required: true },
    },
    feriados: { type: [String], default: [] },
    tiposServico: { type: [String], default: [] },
    vigencia: {
      inicio: { type: String, required: true },
      fim: { type: String, required: true },
    },
  },
  contratoNumero: { type: String, required: true },
  fechadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fechadoPorNome: { type: String, required: true },
  papel: { type: String, enum: PAPEIS_IMR, required: true },
  fechadoEm: { type: Date, required: true },
});

ImrFechamentoSchema.index({ contratoId: 1, competencia: 1, versao: 1 }, { unique: true });

somenteInclusao(ImrFechamentoSchema, 'ImrFechamento');

export type ImrFechamento = InferSchemaType<typeof ImrFechamentoSchema>;
export type ImrFechamentoDoc = ImrFechamento & { _id: Types.ObjectId };

if (mongoose.models.ImrFechamento) {
  delete mongoose.models.ImrFechamento;
}

export const ImrFechamentoModel: Model<ImrFechamento> = mongoose.model<ImrFechamento>(
  'ImrFechamento',
  ImrFechamentoSchema,
  'imr_fechamentos',
);
