import mongoose, { InferSchemaType, Model, Schema } from 'mongoose';

const UnitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    floor: { type: String, required: true, trim: true },

    responsibleName: { type: String, required: true, trim: true },
    responsibleEmail: { type: String, default: '', trim: true, lowercase: true },
    responsiblePhone: { type: String, default: '', trim: true },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

UnitSchema.index({ name: 'text', responsibleName: 'text', floor: 'text' });

export type Unit = InferSchemaType<typeof UnitSchema>;

export const UnitModel: Model<Unit> = mongoose.models.Unit || mongoose.model('Unit', UnitSchema);
