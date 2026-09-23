import { z } from 'zod';

/** Campos medidos por esta fatia. `tecnico` fica fora (spec 0006, fatia 16 decide o dele). */
export const IA_CONFIANCA_CAMPOS = ['servico', 'prioridade'] as const;
export type IaConfiancaCampo = (typeof IA_CONFIANCA_CAMPOS)[number];

/** Em branco vira `null` ("sem limite definido"); fora de 0 a 1 é recusado (AC-10). */
const limiteConfiancaSchema = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : Number(v)),
  z
    .number({ error: 'Informe um número entre 0 e 1' })
    .min(0, 'Deve ser entre 0 e 1')
    .max(1, 'Deve ser entre 0 e 1')
    .nullable(),
);

/** Nunca abaixo de 1 (AC-10). */
const amostraMinimaSchema = z.coerce
  .number({ error: 'Informe um número inteiro' })
  .int('Deve ser um número inteiro')
  .min(1, 'Deve ser pelo menos 1');

const campoConfigSchema = z.object({
  limiteConfianca: limiteConfiancaSchema,
  amostraMinima: amostraMinimaSchema,
});

export const salvarIaAutonomiaConfigSchema = z.object({
  servico: campoConfigSchema,
  prioridade: campoConfigSchema,
  autonomiaAtiva: z.boolean(),
});

export type SalvarIaAutonomiaConfigInput = z.infer<typeof salvarIaAutonomiaConfigSchema>;
export type CampoConfigInput = z.infer<typeof campoConfigSchema>;
