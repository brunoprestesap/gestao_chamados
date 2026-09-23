import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

/**
 * Configuração única de calibração da trava de confiança (spec 0006). Guarda,
 * por campo (`servico`, `prioridade`), o limite de confiança e a amostra
 * mínima usados na sugestão de corte, mais o interruptor global de autonomia.
 *
 * `limiteConfianca: null` significa autonomia impossível para aquele campo;
 * nesta fatia nada além desta configuração lê `autonomiaAtiva` nem os limites.
 */

/** Chave fixa do documento único; o índice único impede duas cargas concorrentes criarem dois. */
export const IA_AUTONOMIA_CONFIG_CHAVE = 'global';

const CampoConfigSchema = new Schema(
  {
    limiteConfianca: { type: Number, default: null, min: 0, max: 1 },
    amostraMinima: { type: Number, required: true, default: 30, min: 1 },
  },
  { _id: false },
);

const IaAutonomiaConfigSchema = new Schema(
  {
    chave: { type: String, required: true, default: IA_AUTONOMIA_CONFIG_CHAVE, unique: true },
    servico: { type: CampoConfigSchema, required: true, default: () => ({}) },
    prioridade: { type: CampoConfigSchema, required: true, default: () => ({}) },
    autonomiaAtiva: { type: Boolean, required: true, default: false },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type IaAutonomiaConfig = InferSchemaType<typeof IaAutonomiaConfigSchema>;

export type IaAutonomiaConfigDoc = IaAutonomiaConfig & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.IaAutonomiaConfig) {
  delete mongoose.models.IaAutonomiaConfig;
}

export const IaAutonomiaConfigModel: Model<IaAutonomiaConfig> = mongoose.model<IaAutonomiaConfig>(
  'IaAutonomiaConfig',
  IaAutonomiaConfigSchema,
);
