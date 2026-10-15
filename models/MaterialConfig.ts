import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { MATERIAL_CONFIG_PADRAO } from '@/shared/material/material.constants';

/**
 * Parâmetros do fluxo de material (spec 0019), documento único de chave
 * `global` (padrão de `IaAutonomiaConfig`). Cada ato copia os valores
 * vigentes para a trilha. Não há campo de taxa de administração: o zero é
 * constante (AC-20).
 */

export const MATERIAL_CONFIG_CHAVE = 'global';

const MaterialConfigSchema = new Schema(
  {
    chave: { type: String, required: true, default: MATERIAL_CONFIG_CHAVE, unique: true },
    raizCnpjContratada: {
      type: String,
      required: true,
      default: MATERIAL_CONFIG_PADRAO.raizCnpjContratada,
      match: /^\d{8}$/,
    },
    historico: {
      type: [
        new Schema(
          {
            campo: { type: String, required: true },
            de: { type: Schema.Types.Mixed, default: null },
            para: { type: Schema.Types.Mixed, default: null },
            porUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            em: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

export type MaterialConfig = InferSchemaType<typeof MaterialConfigSchema>;
export type MaterialConfigDoc = MaterialConfig & { _id: Types.ObjectId };

if (mongoose.models.MaterialConfig) {
  delete mongoose.models.MaterialConfig;
}

export const MaterialConfigModel: Model<MaterialConfig> = mongoose.model<MaterialConfig>(
  'MaterialConfig',
  MaterialConfigSchema,
  'materialconfig',
);
