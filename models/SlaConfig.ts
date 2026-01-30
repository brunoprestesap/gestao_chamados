import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

const SlaConfigSchema = new Schema(
  {
    priority: {
      type: String,
      enum: ['BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIAL'],
      required: true,
      unique: true,
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

SlaConfigSchema.index({ priority: 1, isActive: 1 });

export type SlaConfig = InferSchemaType<typeof SlaConfigSchema> & {
  updatedByUserId?: Types.ObjectId;
};

export type SlaConfigDoc = SlaConfig & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.SlaConfig) {
  delete mongoose.models.SlaConfig;
}

export const SlaConfigModel: Model<SlaConfig> = mongoose.model<SlaConfig>(
  'SlaConfig',
  SlaConfigSchema,
  'sla_configs',
);
