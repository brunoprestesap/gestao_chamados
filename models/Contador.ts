import mongoose, { Model, Schema } from 'mongoose';

import { COLECOES_ATIVOS } from '@/shared/ativos/ativo.constants';

/**
 * Sequência atômica por chave (spec 0011). Hoje só `ativo_mnt`, que gera os
 * códigos internos `MNT-####` sem repetir em cadastros simultâneos.
 */
const ContadorSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export type Contador = { _id: string; seq: number };

if (mongoose.models.Contador) {
  delete mongoose.models.Contador;
}

export const ContadorModel: Model<Contador> = mongoose.model<Contador>(
  'Contador',
  ContadorSchema,
  COLECOES_ATIVOS.contadores,
);
