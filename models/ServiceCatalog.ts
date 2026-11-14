import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';

export const PRIORITIES = ['Baixa', 'Normal', 'Alta', 'Emergencial'] as const;

// AAAA-NNNN (4 dígitos). Aceita AAAA-NNN (legado) para serviços existentes.
export const SERVICE_CODE_REGEX = /^[A-Z]{4}-\d{3,4}$/;

const ServiceCatalogSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v: string) => /^[A-Z]{4}-\d{3,4}$/.test(v),
        message: 'Code must match AAAA-NNNN (e.g., ELET-0001).',
      },
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    typeId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceType',
      required: true,
    },
    subtypeId: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceSubType',
      required: true,
    },

    priorityDefault: {
      type: String,
      enum: PRIORITIES,
    },

    estimatedHours: { type: Number, min: 0 },
    materials: { type: String, trim: true, default: '' },
    procedure: { type: String, trim: true, default: '' },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Spec 0025 (AC-11): único dentro do órgão; o índice antigo, sem órgão, fica no banco até a spec 39.
ServiceCatalogSchema.index({ orgaoId: 1, code: 1 }, { unique: true });
ServiceCatalogSchema.index({ name: 'text', description: 'text', code: 'text' });

export type ServiceCatalog = InferSchemaType<typeof ServiceCatalogSchema> & {
  typeId: Types.ObjectId;
  subtypeId: Types.ObjectId;
};

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
ServiceCatalogSchema.plugin(pluginOrgao);

export const ServiceCatalogModel: Model<ServiceCatalog> =
  mongoose.models.ServiceCatalog || mongoose.model('ServiceCatalog', ServiceCatalogSchema);
