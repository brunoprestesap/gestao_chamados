import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

/**
 * Quem passou a acompanhar um chamado de outra pessoa a partir do aviso de
 * chamado duplicado do chat (spec 0017). É a trilha do interesse: nenhuma
 * entrada de `ChamadoHistory` é criada por ele, para nenhum nome de
 * interessado chegar ao dono do chamado pela linha do tempo.
 *
 * Nunca é apagado. Sair grava `saiuEm`; voltar zera `saiuEm` no mesmo registro.
 */

export const INTERESSE_ORIGENS = ['aviso_duplicado'] as const;
export type InteresseOrigem = (typeof INTERESSE_ORIGENS)[number];

const ChamadoInteressadoSchema = new Schema({
  chamadoId: { type: Schema.Types.ObjectId, ref: 'Chamado', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  origem: { type: String, enum: INTERESSE_ORIGENS, required: true },
  /** A entrada, ou a volta depois de sair. */
  criadoEm: { type: Date, required: true },
  /** Preenchido por "deixar de acompanhar". */
  saiuEm: { type: Date, default: null },
  /** Gravado com o aviso de fim, zerado quando o chamado é reaberto. */
  avisadoFimEm: { type: Date, default: null },
  /**
   * Se quem acompanha pode ver o local do chamado: a mesma decisão que o
   * cartão tomou no item do clique (AC-6), regravada na reativação. Ausente
   * vale `false`.
   */
  localVisivel: { type: Boolean, default: false },
});

/** Um registro só por pessoa e chamado: é o que torna o "acompanhar" repetível. */
ChamadoInteressadoSchema.index({ chamadoId: 1, userId: 1 }, { unique: true });
/** A seção "Acompanhando" da lateral. */
ChamadoInteressadoSchema.index({ userId: 1, saiuEm: 1, criadoEm: -1 });
/** Contagem na gestão e o aviso de fim. */
ChamadoInteressadoSchema.index({ chamadoId: 1, saiuEm: 1 });

export type ChamadoInteressado = InferSchemaType<typeof ChamadoInteressadoSchema> & {
  chamadoId: Types.ObjectId;
  userId: Types.ObjectId;
};

export type ChamadoInteressadoDoc = ChamadoInteressado & { _id: Types.ObjectId };

if (mongoose.models.ChamadoInteressado) {
  delete mongoose.models.ChamadoInteressado;
}

export const ChamadoInteressadoModel: Model<ChamadoInteressado> =
  mongoose.model<ChamadoInteressado>('ChamadoInteressado', ChamadoInteressadoSchema);
