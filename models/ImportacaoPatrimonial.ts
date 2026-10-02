import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { COLECOES_ATIVOS, TIERS_MANUTENCAO } from '@/shared/ativos/ativo.constants';
import { GRUPOS_IMPORTACAO, IMPORTACAO_STATUSES } from '@/shared/ativos/importacao.constants';

/**
 * Uma linha da diferença. O código é a chave estável entre SICAM e Sigma (não
 * o `_id` do ativo). `descricao`, `local`, `camposAlterados` e `dados` só
 * existem enquanto a importação está `pendente`: o enxugamento os apaga ao
 * fechar, porque podem ter nome e matrícula (LGPD).
 */
const ItemImportacaoSchema = new Schema(
  {
    grupo: { type: String, enum: GRUPOS_IMPORTACAO, required: true },
    codigo: { type: String, required: true },
    retornou: Boolean,
    tier: { type: String, enum: TIERS_MANUTENCAO },
    categoriaSugerida: String,
    categoriaId: { type: Schema.Types.ObjectId, ref: 'CategoriaAtivo' },
    bloqueio: String,
    aplicado: Boolean,
    motivoPulo: String,
    descricao: String,
    local: String,
    camposAlterados: {
      type: [
        new Schema(
          {
            campo: { type: String, required: true },
            antes: Schema.Types.Mixed,
            depois: Schema.Types.Mixed,
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    dados: Schema.Types.Mixed,
  },
  { _id: false },
);

const PorGrupoSchema = new Schema(
  {
    novos: { type: Number, default: 0 },
    alterados: { type: Number, default: 0 },
    sumidos: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Importação do export do SICAM (spec 0012, parte 2). Uma `pendente` por vez,
 * garantida pelo índice único parcial em `emAberto` (que só existe enquanto
 * `pendente`). Aplicar ou descartar fecha e enxuga na mesma escrita.
 */
const ImportacaoPatrimonialSchema = new Schema(
  {
    arquivoNome: { type: String, required: true, trim: true },
    autorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: IMPORTACAO_STATUSES, default: 'pendente' },
    emAberto: { type: Boolean, default: undefined },
    linhasLidas: { type: Number, required: true },
    linhasReparadas: { type: Number, required: true },
    linhasAceitas: { type: Number, required: true },
    linhasDuplicadas: { type: Number, required: true },
    valoresIlegiveis: { type: Number, required: true },
    continuamAusentes: { type: Number, required: true },
    contagens: {
      novos: { type: Number, default: 0 },
      alterados: { type: Number, default: 0 },
      sumidos: { type: Number, default: 0 },
      aplicados: { type: PorGrupoSchema, default: () => ({}) },
      pulados: { type: PorGrupoSchema, default: () => ({}) },
    },
    itens: { type: [ItemImportacaoSchema], default: [] },
    aplicadaPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    aplicadaEm: { type: Date, default: null },
    descartadaPor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    descartadaEm: { type: Date, default: null },
  },
  { timestamps: true },
);

ImportacaoPatrimonialSchema.index(
  { emAberto: 1 },
  { unique: true, partialFilterExpression: { emAberto: true } },
);
ImportacaoPatrimonialSchema.index({ createdAt: -1 });

export type ImportacaoPatrimonial = InferSchemaType<typeof ImportacaoPatrimonialSchema>;

export type ImportacaoPatrimonialDoc = ImportacaoPatrimonial & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.ImportacaoPatrimonial) {
  delete mongoose.models.ImportacaoPatrimonial;
}

export const ImportacaoPatrimonialModel: Model<ImportacaoPatrimonial> =
  mongoose.model<ImportacaoPatrimonial>(
    'ImportacaoPatrimonial',
    ImportacaoPatrimonialSchema,
    COLECOES_ATIVOS.importacoes,
  );
