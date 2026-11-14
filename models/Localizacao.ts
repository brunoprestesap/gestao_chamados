import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';
import { COLECOES_ATIVOS, LOCALIZACAO_TIPOS } from '@/shared/ativos/ativo.constants';

/**
 * Local físico em árvore (spec 0011): só `predio` fica na raiz. `caminho` é
 * materializado (`Sede/3º andar/Sala 302`) e recalculado para a subárvore
 * inteira a cada mudança de nome ou pai (`lib/ativos/localizacao.ts`).
 */
const LocalizacaoSchema = new Schema(
  {
    nome: { type: String, required: true, trim: true },
    tipo: { type: String, enum: LOCALIZACAO_TIPOS, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Localizacao', default: null },
    // Quem ocupa o local; nunca muda o `unitId` do chamado (quem pede).
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    caminho: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Nome irmão repetido entre nós ativos: ignora maiúsculas, acento conta.
// Spec 0025 (AC-11): único dentro do órgão; o índice antigo, sem órgão, fica no banco até a spec 39.
LocalizacaoSchema.index(
  { orgaoId: 1, parentId: 1, nome: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    collation: { locale: 'pt', strength: 2 },
  },
);
LocalizacaoSchema.index({ unitId: 1 });
LocalizacaoSchema.index({ caminho: 1 });

export type Localizacao = InferSchemaType<typeof LocalizacaoSchema>;

export type LocalizacaoDoc = Localizacao & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
LocalizacaoSchema.plugin(pluginOrgao);

if (mongoose.models.Localizacao) {
  delete mongoose.models.Localizacao;
}

export const LocalizacaoModel: Model<Localizacao> = mongoose.model<Localizacao>(
  'Localizacao',
  LocalizacaoSchema,
  COLECOES_ATIVOS.localizacoes,
);
