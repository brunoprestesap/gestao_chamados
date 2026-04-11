import mongoose, { type InferSchemaType, type Model, Schema, type Types } from 'mongoose';

const ESCALATION_TYPES = ['warning_80', 'breach_response', 'breach_resolution'] as const;
const ESCALATION_LEVELS = ['manager', 'admin'] as const;

const SlaEscalationSchema = new Schema(
  {
    chamadoId: {
      type: Schema.Types.ObjectId,
      ref: 'Chamado',
      required: true,
    },
    type: {
      type: String,
      enum: ESCALATION_TYPES,
      required: true,
    },
    level: {
      type: String,
      enum: ESCALATION_LEVELS,
      required: true,
    },
    notifiedAt: {
      type: Date,
      required: true,
    },
    notifiedUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true },
);

SlaEscalationSchema.index({ chamadoId: 1, type: 1 }, { unique: true });

export type SlaEscalation = InferSchemaType<typeof SlaEscalationSchema> & {
  chamadoId: Types.ObjectId;
  notifiedUserIds: Types.ObjectId[];
};

export type SlaEscalationDoc = SlaEscalation & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type EscalationType = (typeof ESCALATION_TYPES)[number];
export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

if (mongoose.models.SlaEscalation) {
  delete mongoose.models.SlaEscalation;
}

export const SlaEscalationModel: Model<SlaEscalation> = mongoose.model<SlaEscalation>(
  'SlaEscalation',
  SlaEscalationSchema,
);
