import mongoose, { Model, Schema } from 'mongoose';

import { COLECOES_ATIVOS } from '@/shared/ativos/ativo.constants';

/**
 * Sequência atômica por chave (spec 0011). `ativo_mnt` gera os códigos internos
 * `MNT-####`, e `chamado_<ano>` gera os números `CHM-<ano>-#####` dos chamados
 * (`generateTicketNumber`), sem repetir em gravações simultâneas.
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
