import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { pluginOrgao } from '@/lib/orgaos/plugin';
import { USER_ROLES } from '@/shared/auth/auth.constants';

const UserSchema = new Schema(
  {
    // matrícula/login
    username: { type: String, required: true, trim: true, lowercase: true },

    name: { type: String, required: true, trim: true },

    // email agora pode ser opcional (se quiser usar depois)
    email: { type: String, required: false, trim: true, lowercase: true },

    passwordHash: { type: String, required: false },

    role: { type: String, enum: USER_ROLES, required: true, default: 'Solicitante' },

    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: false },

    isActive: { type: Boolean, default: true },

    // Campos específicos para Técnico (IDs dos subtipos de serviço = especialidades)
    specialties: [
      {
        type: Schema.Types.ObjectId,
        ref: 'ServiceSubType',
        required: false,
      },
    ],
    maxAssignedTickets: { type: Number, min: 1, default: 5, required: false },
  },
  { timestamps: true },
);

// Spec 0025 (AC-11): único dentro do órgão; o índice antigo, sem órgão, fica no banco até a spec 39.
UserSchema.index({ orgaoId: 1, username: 1 }, { unique: true });
UserSchema.index({ name: 'text', username: 'text', email: 'text' });
// Lookups por papel: atribuição de técnicos e fan-out de notificações a gestores
UserSchema.index({ role: 1, isActive: 1 });

// Spec 0025: todo usuário pertence a um órgão; filtro e carimbo pelo plugin.
UserSchema.plugin(pluginOrgao);

export type User = InferSchemaType<typeof UserSchema> & {
  unitId?: Types.ObjectId;
  /** Acrescentado pelo `pluginOrgao` (spec 0025). */
  orgaoId?: Types.ObjectId;
};

export const UserModel: Model<User> = mongoose.models.User || mongoose.model('User', UserSchema);
