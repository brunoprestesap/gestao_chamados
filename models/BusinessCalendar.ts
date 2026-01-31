import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

const BusinessCalendarSchema = new Schema(
  {
    timezone: { type: String, required: true, trim: true, default: 'America/Belem' },
    workdayStart: { type: String, required: true, trim: true, default: '08:00' },
    workdayEnd: { type: String, required: true, trim: true, default: '18:00' },
    weekdays: {
      type: [Number],
      required: true,
      default: [1, 2, 3, 4, 5],
      validate: {
        validator: (v: number[]) => Array.isArray(v) && v.length >= 1 && v.every((d) => d >= 0 && d <= 6),
        message: 'weekdays deve ter pelo menos 1 dia (0=Dom..6=Sab)',
      },
    },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true },
);

export type BusinessCalendarDoc = InferSchemaType<typeof BusinessCalendarSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.BusinessCalendar) {
  delete mongoose.models.BusinessCalendar;
}

export const BusinessCalendarModel: Model<BusinessCalendarDoc> = mongoose.model<BusinessCalendarDoc>(
  'BusinessCalendar',
  BusinessCalendarSchema,
  'business_calendar',
);
