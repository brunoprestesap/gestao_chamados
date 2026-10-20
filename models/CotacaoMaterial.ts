import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import {
  BASES_APLICADAS,
  DECISOES_URGENCIA,
  FASES_ORCAMENTO,
  MAX_ITENS_COTACAO,
  MAX_ORCAMENTOS_COTACAO,
  ORIGENS_ITEM,
  PAPEIS_REFERENCIA,
  SITUACOES_COTACAO,
  TIPOS_REFERENCIA,
} from '@/shared/material/material.constants';

/**
 * Cotação de material (spec 0019). Modelo novo ao lado da `Cotacao` antiga:
 * itens, orçamentos, 10 situações e controle otimista por `versao`. Dinheiro
 * sempre em centavos inteiros. Toda mudança de situação passa por
 * `transicionar` (`lib/material/transicoes.ts`).
 */

/**
 * Referência de preço do caminho 3 (fatia 4, AC-32). `sinapi`: preço, unidade
 * e fonte vêm da tabela; `livre`: digitados. A do fiscal nunca se apaga:
 * retirar só grava `retiradaEm`, e a retirada não conta em controle nenhum.
 */
const ReferenciaSchema = new Schema({
  tipo: { type: String, enum: TIPOS_REFERENCIA, required: true, default: 'livre' },
  fonte: { type: String, required: true, trim: true, maxlength: 200 },
  sinapiCodigo: { type: String, default: null },
  sinapiReferencia: { type: String, default: null },
  unidade: { type: String, default: null, maxlength: 20 },
  valorUnitarioCentavos: { type: Number, required: true, min: 1 },
  data: { type: Date, required: true },
  incluidaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  papel: {
    type: String,
    enum: PAPEIS_REFERENCIA,
    required: true,
    default: 'responsavel_tecnico',
  },
  em: { type: Date, default: null },
  retiradaEm: { type: Date, default: null },
  retiradaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

const ItemSchema = new Schema({
  descricao: { type: String, required: true, trim: true, maxlength: 300 },
  unidade: { type: String, required: true, trim: true, maxlength: 20 },
  quantidade: { type: Number, required: true, min: 0.001 },
  motivo: { type: String, required: true, trim: true, maxlength: 500 },
  doDiagnostico: { type: Boolean, required: true, default: false },
  origem: { type: String, enum: [...ORIGENS_ITEM, null], default: null },
  // Caminhos 1 e 2 (fatia 3): cópia na classificação, congelada no envio.
  anexoVItemId: { type: Schema.Types.ObjectId, default: null },
  // O número do item no Anexo V: o envio copia de novo o item vigente de mesmo número.
  anexoVNumero: { type: Number, default: null },
  anexoVPrecoCentavos: { type: Number, default: null },
  anexoVVersao: { type: Number, default: null },
  sinapiCodigo: { type: String, default: null },
  sinapiReferencia: { type: String, default: null },
  sinapiPrecoCentavos: { type: Number, default: null },
  baseAplicada: { type: String, enum: [...BASES_APLICADAS, null], default: null },
  justificativaBase: { type: String, default: null, maxlength: 1000 },
  precoAplicadoCentavos: { type: Number, default: null, min: 0 },
  referencias: { type: [ReferenciaSchema], default: [] },
  conferencia: {
    type: new Schema(
      {
        texto: { type: String, required: true, maxlength: 1000 },
        porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        em: { type: Date, required: true },
      },
      { _id: false },
    ),
    default: null,
  },
  quantidadeExecutada: { type: Number, default: null, min: 0 },
  valorExecutadoCentavos: { type: Number, default: null, min: 0 },
});

const PrecoOrcamentoSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, required: true },
    valorUnitarioCentavos: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const OrcamentoSchema = new Schema({
  fornecedor: { type: String, required: true, trim: true, maxlength: 160 },
  cnpj: { type: String, required: true, match: /^\d{14}$/ },
  data: { type: Date, required: true },
  validade: { type: Date, default: null },
  arquivoId: { type: Schema.Types.ObjectId, ref: 'ArquivoCotacao', required: true },
  precos: { type: [PrecoOrcamentoSchema], default: [] },
  // Fatia 4: o `complemento` só entra pela pesquisa da urgência; ausente lê como `envio`.
  fase: { type: String, enum: FASES_ORCAMENTO, default: 'envio' },
});

const AdvertenciaSchema = new Schema(
  {
    codigo: { type: String, required: true },
    itemId: { type: Schema.Types.ObjectId, default: null },
    // A confirmação do orçamento vencido é uma por orçamento (AC-34).
    orcamentoId: { type: Schema.Types.ObjectId, default: null },
    confirmadaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    em: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * Urgência (fatia 4, AC-35). `pedida` nunca volta a `false`; `recusada` nunca
 * sai; `aceita` é limpa por uma devolução comum; `pesquisaCompletaEm` libera
 * o recebimento definitivo.
 */
const UrgenciaSchema = new Schema(
  {
    pedida: { type: Boolean, required: true, default: true },
    justificativa: { type: String, required: true, maxlength: 500 },
    pedidaEm: { type: Date, required: true },
    decisao: { type: String, enum: [...DECISOES_URGENCIA, null], default: null },
    decididaPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decididaEm: { type: Date, default: null },
    motivoRecusa: { type: String, default: null, maxlength: 500 },
    pesquisaCompletaEm: { type: Date, default: null },
  },
  { _id: false },
);

// Recebimento provisório e definitivo do gestor (fatia 2, AC-21).
const RecebimentoSchema = new Schema(
  {
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

// Nota fiscal do responsável técnico, só em `atestada` (fatia 2, AC-22).
const NotaFiscalSchema = new Schema(
  {
    numero: { type: String, required: true, trim: true, maxlength: 60 },
    data: { type: Date, required: true },
    arquivoId: { type: Schema.Types.ObjectId, ref: 'ArquivoCotacao', required: true },
    porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const CotacaoMaterialSchema = new Schema(
  {
    numero: { type: String, required: true },
    chamadoId: { type: Schema.Types.ObjectId, ref: 'Chamado', required: true },
    ativoId: { type: Schema.Types.ObjectId, ref: 'Ativo', default: null },
    localizacaoId: { type: Schema.Types.ObjectId, ref: 'Localizacao', default: null },
    situacao: { type: String, enum: SITUACOES_COTACAO, required: true, default: 'rascunho' },
    emTramite: { type: Boolean, required: true, default: true },
    versao: { type: Number, required: true, default: 1 },
    cotacaoAnteriorId: { type: Schema.Types.ObjectId, ref: 'CotacaoMaterial', default: null },
    itens: {
      type: [ItemSchema],
      validate: {
        validator: (v: unknown[]) => v.length >= 1 && v.length <= MAX_ITENS_COTACAO,
        message: `A cotação precisa de 1 a ${MAX_ITENS_COTACAO} itens.`,
      },
    },
    orcamentos: {
      type: [OrcamentoSchema],
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= MAX_ORCAMENTOS_COTACAO,
        message: `A cotação aceita até ${MAX_ORCAMENTOS_COTACAO} orçamentos.`,
      },
    },
    diagnosticadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    diagnosticadoEm: { type: Date, required: true },
    montadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fiscalUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    valorTotalCentavos: { type: Number, required: true, default: 0, min: 0 },
    empenhoId: { type: Schema.Types.ObjectId, ref: 'Empenho', default: null },
    valorAutorizadoCentavos: { type: Number, default: null, min: 0 },
    autorizadoEm: { type: Date, default: null },
    autorizadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    executadoEm: { type: Date, default: null },
    executadoPorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    valorExecutadoCentavos: { type: Number, default: null, min: 0 },
    recebimentoProvisorio: { type: RecebimentoSchema, default: null },
    recebimentoDefinitivo: { type: RecebimentoSchema, default: null },
    notaFiscal: { type: NotaFiscalSchema, default: null },
    pauseLogId: { type: Schema.Types.ObjectId, ref: 'PauseLog', default: null },
    advertencias: { type: [AdvertenciaSchema], default: [] },
    urgencia: { type: UrgenciaSchema, default: null },
  },
  { timestamps: true },
);

CotacaoMaterialSchema.index({ numero: 1 }, { unique: true });
CotacaoMaterialSchema.index(
  { chamadoId: 1 },
  {
    unique: true,
    partialFilterExpression: { emTramite: true },
    name: 'uma_em_tramite_por_chamado',
  },
);
CotacaoMaterialSchema.index({ situacao: 1, updatedAt: -1 });
CotacaoMaterialSchema.index({ ativoId: 1, autorizadoEm: -1 });
CotacaoMaterialSchema.index({ localizacaoId: 1, autorizadoEm: -1 });
CotacaoMaterialSchema.index({ chamadoId: 1, createdAt: -1 });

export type CotacaoMaterial = InferSchemaType<typeof CotacaoMaterialSchema>;
export type ItemCotacao = InferSchemaType<typeof ItemSchema> & { _id: Types.ObjectId };
export type OrcamentoCotacao = InferSchemaType<typeof OrcamentoSchema> & { _id: Types.ObjectId };

export type CotacaoMaterialDoc = Omit<CotacaoMaterial, 'itens' | 'orcamentos'> & {
  _id: Types.ObjectId;
  itens: ItemCotacao[];
  orcamentos: OrcamentoCotacao[];
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.CotacaoMaterial) {
  delete mongoose.models.CotacaoMaterial;
}

export const CotacaoMaterialModel: Model<CotacaoMaterial> = mongoose.model<CotacaoMaterial>(
  'CotacaoMaterial',
  CotacaoMaterialSchema,
  'cotacoesmaterial',
);
