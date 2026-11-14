import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';
import { HOLIDAY_SCOPES } from '@/shared/holidays/holiday.schemas';

const HolidaySchema = new Schema(
  {
    /** Formato YYYY-MM-DD — evita timezone shifting */
    date: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    scope: {
      type: String,
      enum: HOLIDAY_SCOPES,
      default: 'INSTITUCIONAL',
      trim: true,
    },
    isActive: { type: Boolean, default: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true },
);

// Spec 0025 (AC-11): único dentro do órgão; o índice antigo, sem órgão, fica no banco até a spec 39.
HolidaySchema.index({ orgaoId: 1, date: 1, scope: 1 }, { unique: true });
HolidaySchema.index({ date: 1 });
HolidaySchema.index({ isActive: 1, date: 1 });

export type HolidayDoc = InferSchemaType<typeof HolidaySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

// Spec 0025: pertence a um órgão; filtro e carimbo pelo plugin.
HolidaySchema.plugin(pluginOrgao);

if (mongoose.models.Holiday) {
  delete mongoose.models.Holiday;
}

export const HolidayModel: Model<HolidayDoc> = mongoose.model<HolidayDoc>(
  'Holiday',
  HolidaySchema,
  'holidays',
);
