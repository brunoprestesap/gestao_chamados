import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';

const SlaConfigSchema = new Schema(
  {
    priority: {
      type: String,
      enum: ['BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIAL'],
      required: true,
    },
    responseTargetMinutes: { type: Number, required: true, min: 1 },
    resolutionTargetMinutes: { type: Number, required: true, min: 1 },
    businessHoursOnly: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true },
    version: { type: String, required: false, trim: true },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true },
);

// Spec 0025 (AC-11): único dentro do órgão; o índice antigo, sem órgão, fica no banco até a spec 39.
SlaConfigSchema.index({ orgaoId: 1, priority: 1 }, { unique: true });
SlaConfigSchema.index({ priority: 1, isActive: 1 });

export type SlaConfig = InferSchemaType<typeof SlaConfigSchema> & {
  updatedByUserId?: Types.ObjectId;
};

export type SlaConfigDoc = SlaConfig & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
SlaConfigSchema.plugin(pluginOrgao);

if (mongoose.models.SlaConfig) {
  delete mongoose.models.SlaConfig;
}

export const SlaConfigModel: Model<SlaConfig> = mongoose.model<SlaConfig>(
  'SlaConfig',
  SlaConfigSchema,
  'sla_configs',
);
