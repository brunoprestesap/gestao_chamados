import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { USER_ROLES } from '@/shared/auth/auth.constants';

const UserSchema = new Schema(
  {
    // matrícula/login
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },

    name: { type: String, required: true, trim: true },

    // email agora pode ser opcional (se quiser usar depois)
    email: { type: String, required: false, trim: true, lowercase: true },

    passwordHash: { type: String, required: true },

    role: { type: String, enum: USER_ROLES, required: true, default: 'Solicitante' },

    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: false },

    isActive: { type: Boolean, default: true },

    // Campos específicos para Técnico
    specialties: [
      {
        type: Schema.Types.ObjectId,
        ref: 'ServiceCatalog',
        required: false,
      },
    ],
    maxAssignedTickets: { type: Number, min: 1, default: 5, required: false },
  },
  { timestamps: true },
);

UserSchema.index({ name: 'text', username: 'text', email: 'text' });

export type User = InferSchemaType<typeof UserSchema> & {
  unitId?: Types.ObjectId;
};

export const UserModel: Model<User> = mongoose.models.User || mongoose.model('User', UserSchema);
