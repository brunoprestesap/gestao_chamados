import mongoose, { Model, Schema, Types } from 'mongoose';

import { marcarPlataforma } from '@/lib/orgaos/plugin';

/**
 * O órgão do Judiciário dono dos dados (spec 0025). É modelo de plataforma:
 * não tem `orgaoId` nem passa pelo filtro do plugin. Cadastro e tela ficam
 * com a spec 40.
 */
const OrgaoSchema = new Schema(
  {
    sigla: { type: String, required: true, trim: true, uppercase: true },
    nome: { type: String, required: true, trim: true },
    ativo: { type: Boolean, default: true },
    criadoEm: { type: Date, default: () => new Date() },
  },
  { collection: 'orgaos' },
);

OrgaoSchema.index({ sigla: 1 }, { unique: true });

marcarPlataforma(OrgaoSchema);

export type Orgao = {
  _id: Types.ObjectId;
  sigla: string;
  nome: string;
  ativo: boolean;
  criadoEm: Date;
};

if (mongoose.models.Orgao) {
  delete mongoose.models.Orgao;
}

export const OrgaoModel: Model<Orgao> = mongoose.model<Orgao>('Orgao', OrgaoSchema);
