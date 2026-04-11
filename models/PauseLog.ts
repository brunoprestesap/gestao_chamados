import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { PAUSE_REASONS } from '@/shared/chamados/pause-reason.constants';

const PauseLogSchema = new Schema(
  {
    chamadoId: {
      type: Schema.Types.ObjectId,
      ref: 'Chamado',
      required: true,
    },
    reason: {
      type: String,
      enum: PAUSE_REASONS,
      required: true,
    },
    details: { type: String, default: '', trim: true },
    pausedAt: { type: Date, required: true },
    resumedAt: { type: Date, required: false },
    pausedMinutes: { type: Number, required: false },
    pausedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    resumedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  { timestamps: true },
);

PauseLogSchema.index({ chamadoId: 1, pausedAt: -1 });

export type PauseLog = InferSchemaType<typeof PauseLogSchema> & {
  chamadoId: Types.ObjectId;
  pausedByUserId: Types.ObjectId;
  resumedByUserId?: Types.ObjectId;
};

export type PauseLogDoc = PauseLog & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const PauseLogModel: Model<PauseLog> =
  (mongoose.models.PauseLog as Model<PauseLog>) ??
  mongoose.model<PauseLog>('PauseLog', PauseLogSchema);
