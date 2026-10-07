import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

/**
 * Cada PDF do relatório por contrato entregue (spec 0016, AC-16 a AC-19).
 * Só é criado, nunca alterado nem apagado. O `_id` nasce antes do PDF e vai
 * impresso no rodapé; o hash dos bytes entregues fica aqui, ligado a ele.
 */
const RelatorioContratoEmissaoSchema = new Schema({
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
  mes: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  geradoPor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // O nome no momento: a lista não muda se o usuário mudar de nome depois.
  geradoPorNome: { type: String, required: true },
  geradoEm: { type: Date, required: true },
  hashSha256: { type: String, required: true, match: /^[a-f\d]{64}$/ },
});

RelatorioContratoEmissaoSchema.index({ contratoId: 1, mes: 1, geradoEm: -1 });

export type RelatorioContratoEmissao = InferSchemaType<typeof RelatorioContratoEmissaoSchema>;

export type RelatorioContratoEmissaoDoc = RelatorioContratoEmissao & { _id: Types.ObjectId };

if (mongoose.models.RelatorioContratoEmissao) {
  delete mongoose.models.RelatorioContratoEmissao;
}

export const RelatorioContratoEmissaoModel: Model<RelatorioContratoEmissao> =
  mongoose.model<RelatorioContratoEmissao>(
    'RelatorioContratoEmissao',
    RelatorioContratoEmissaoSchema,
    'relatoriocontratoemissoes',
  );
