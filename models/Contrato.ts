import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';

/**
 * Contrato de manutenção (spec 0016). Só o Admin escreve, e nunca se apaga.
 * O chamado pertence ao contrato pelo `tipoServico` e pela data de abertura,
 * sem campo no `Chamado`; dois contratos nunca cobrem o mesmo tipo em
 * vigências que se cruzam (conferido na aplicação, AC-3).
 */
const ContratoSchema = new Schema(
  {
    numero: { type: String, required: true, trim: true, maxlength: 40 },
    // `numero` em minúsculas: o número é único sem diferença de maiúscula.
    numeroNormalizado: { type: String, required: true },
    empresa: { type: String, required: true, trim: true, maxlength: 160 },
    cnpj: { type: String, required: true, match: /^\d{14}$/ },
    processoSei: { type: String, required: true, trim: true, maxlength: 40 },
    objeto: { type: String, default: null, trim: true, maxlength: 300 },
    // Dado pessoal: sai no cabeçalho do PDF, que vai para o processo.
    fiscal: { type: String, default: null, trim: true, maxlength: 120 },
    tiposServico: {
      type: [{ type: String, enum: TIPO_SERVICO_OPTIONS }],
      required: true,
      validate: {
        validator: (v: string[]) =>
          v.length >= 1 && v.length <= TIPO_SERVICO_OPTIONS.length && new Set(v).size === v.length,
        message: 'tiposServico precisa de 1 a 3 valores distintos.',
      },
    },
    // Datas sem hora, como o contrato fala (`YYYY-MM-DD`); viram `Date` só na janela.
    vigenciaInicio: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    vigenciaFim: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ContratoSchema.index({ numeroNormalizado: 1 }, { unique: true });
ContratoSchema.index({ tiposServico: 1, vigenciaInicio: 1 });

export type Contrato = InferSchemaType<typeof ContratoSchema>;

export type ContratoDoc = Contrato & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.Contrato) {
  delete mongoose.models.Contrato;
}

export const ContratoModel: Model<Contrato> = mongoose.model<Contrato>(
  'Contrato',
  ContratoSchema,
  'contratos',
);
