import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';

const ServiceSubTypeSchema = new Schema(
  {
    typeId: { type: Schema.Types.ObjectId, ref: 'ServiceType', required: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// garante que não existam subtipos duplicados por tipo
ServiceSubTypeSchema.index({ typeId: 1, name: 1 }, { unique: true });

export type ServiceSubType = InferSchemaType<typeof ServiceSubTypeSchema> & {
  typeId: Types.ObjectId;
};

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
ServiceSubTypeSchema.plugin(pluginOrgao);

export const ServiceSubTypeModel: Model<ServiceSubType> =
  mongoose.models.ServiceSubType || mongoose.model('ServiceSubType', ServiceSubTypeSchema);
