import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

export const PRIORITIES = ['Baixa', 'Normal', 'Alta', 'Emergencial'] as const;

// AAAA-999
export const SERVICE_CODE_REGEX = /^[A-Z]{4}-\d{3}$/;

const ServiceCatalogSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: (v: string) => SERVICE_CODE_REGEX.test(v),
        message: 'Code must match AAAA-999 (e.g., ELET-001)',
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

ServiceCatalogSchema.index({ name: 'text', description: 'text', code: 'text' });

export type ServiceCatalog = InferSchemaType<typeof ServiceCatalogSchema> & {
  typeId: Types.ObjectId;
  subtypeId: Types.ObjectId;
};

export const ServiceCatalogModel: Model<ServiceCatalog> =
  mongoose.models.ServiceCatalog || mongoose.model('ServiceCatalog', ServiceCatalogSchema);
