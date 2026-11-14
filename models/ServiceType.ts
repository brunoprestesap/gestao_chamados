import mongoose, { InferSchemaType, Model, Schema } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';

const ServiceTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ServiceType = InferSchemaType<typeof ServiceTypeSchema>;

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
// Spec 0025 (AC-11): único dentro do órgão; o índice antigo, sem órgão, fica no banco até a spec 39.
ServiceTypeSchema.index({ orgaoId: 1, name: 1 }, { unique: true });
ServiceTypeSchema.plugin(pluginOrgao);

export const ServiceTypeModel: Model<ServiceType> =
  mongoose.models.ServiceType || mongoose.model('ServiceType', ServiceTypeSchema);
