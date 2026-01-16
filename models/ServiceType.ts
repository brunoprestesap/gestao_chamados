import mongoose, { InferSchemaType, Model, Schema } from 'mongoose';

const ServiceTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ServiceType = InferSchemaType<typeof ServiceTypeSchema>;

export const ServiceTypeModel: Model<ServiceType> =
  mongoose.models.ServiceType || mongoose.model('ServiceType', ServiceTypeSchema);
