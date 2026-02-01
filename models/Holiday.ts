import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

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

HolidaySchema.index({ date: 1, scope: 1 }, { unique: true });
HolidaySchema.index({ date: 1 });
HolidaySchema.index({ isActive: 1, date: 1 });

export type HolidayDoc = InferSchemaType<typeof HolidaySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.Holiday) {
  delete mongoose.models.Holiday;
}

export const HolidayModel: Model<HolidayDoc> = mongoose.model<HolidayDoc>(
  'Holiday',
  HolidaySchema,
  'holidays',
);
