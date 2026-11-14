import mongoose, { InferSchemaType, Model, Schema } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';

const UnitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    floor: { type: String, default: '', trim: true },

    responsibleName: { type: String, default: '', trim: true },
    responsibleEmail: { type: String, default: '', trim: true, lowercase: true },
    responsiblePhone: { type: String, default: '', trim: true },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

UnitSchema.index({ name: 'text', responsibleName: 'text', floor: 'text' });

export type Unit = InferSchemaType<typeof UnitSchema>;

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
UnitSchema.plugin(pluginOrgao);

export const UnitModel: Model<Unit> = mongoose.models.Unit || mongoose.model('Unit', UnitSchema);
