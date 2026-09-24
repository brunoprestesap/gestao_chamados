import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

/**
 * Configuração única de calibração da trava de confiança (spec 0006). Guarda,
 * por campo (`servico`, `prioridade`), o limite de confiança e a amostra
 * mínima usados na sugestão de corte, mais o interruptor global de autonomia.
 *
 * `limiteConfianca: null` significa autonomia impossível para aquele campo.
 * Desde a spec 0007, o portão de confiança da abertura pelo chat
 * (`lib/assistente/portao.ts`) lê `autonomiaAtiva` e o limite de `prioridade`,
 * sempre por `lerConfig()`, que só considera a autonomia ligada quando
 * `promptVersion` é a versão atual do prompt.
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
    // `PROMPT_VERSION` vigente quando o Admin salvou (spec 0007, AC-17): o
    // limite só vale para o prompt em que foi calibrado.
    promptVersion: { type: String, default: null },
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
