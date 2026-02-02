import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

const NOTIFICATION_TYPES = [
  'ticket:assigned',
  'ticket:new',
  'ticket:execution_registered',
  'ticket:closed',
] as const;

const NotificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    data: { type: Schema.Types.Mixed, required: false },
    readAt: { type: Date, required: false, default: null },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof NotificationSchema> & {
  userId: Types.ObjectId;
};

export type NotificationDoc = Notification & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.Notification) {
  delete mongoose.models.Notification;
}

export const NotificationModel: Model<Notification> = mongoose.model<Notification>(
  'Notification',
  NotificationSchema,
);
