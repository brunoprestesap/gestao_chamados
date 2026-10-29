import { z } from 'zod';

import {
  MOTIVO_IMR_MAX,
  MOTIVO_IMR_MIN,
  OBSERVACAO_IMR_MAX,
  PONTOS_MAXIMOS,
  TIPOS_MARCACAO,
} from './imr-contrato.constants';

/** Entradas das ações do IMR do contrato (spec 0023). */

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido.');
const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');

export const motivoImr = z
  .string()
  .trim()
  .min(MOTIVO_IMR_MIN, `Escreva o motivo (ao menos ${MOTIVO_IMR_MIN} caracteres).`)
  .max(MOTIVO_IMR_MAX, `O motivo tem no máximo ${MOTIVO_IMR_MAX} caracteres.`);

/** AC-7 e AC-8: o indicador 3 marca chamado, o 4 marca cotação. */
export const MarcarImrSchema = z
  .object({
    contratoId: objectId,
    competencia,
    indicador: z.union([z.literal(3), z.literal(4)]),
    alvoTipo: z.enum(['chamado', 'cotacao']),
    alvoId: objectId,
    tipo: z.enum(TIPOS_MARCACAO),
    motivo: motivoImr,
  })
  .strict()
  .refine((m) => (m.indicador === 3 ? m.alvoTipo === 'chamado' : m.alvoTipo === 'cotacao'), {
    message: 'O indicador 3 marca chamado; o indicador 4 marca cotação.',
    path: ['alvoTipo'],
  });
export type MarcarImrInput = z.infer<typeof MarcarImrSchema>;

/** AC-8: o número do chamado, com ou sem `#`. */
export const BuscarChamadoDaBaseSchema = z
  .object({
    contratoId: objectId,
    competencia,
    numero: z
      .string()
      .trim()
      .transform((s) => s.replace(/^#/, '').trim())
      .pipe(z.string().min(1, 'Informe o número do chamado.').max(30)),
  })
  .strict();

const observacao = z
  .string()
  .trim()
  .max(OBSERVACAO_IMR_MAX, `A observação tem no máximo ${OBSERVACAO_IMR_MAX} caracteres.`)
  .optional()
  .transform((s) => (s ? s : null));

const pontos = (rotulo: string, max: number) =>
  z
    .number({ error: `Informe os pontos do ${rotulo}.` })
    .int(`Os pontos do ${rotulo} são um número inteiro.`)
    .min(0, `Os pontos do ${rotulo} vão de 0 a ${max}.`)
    .max(max, `Os pontos do ${rotulo} vão de 0 a ${max}.`);

/**
 * AC-10: os pontos dos indicadores 1 e 2 entram no fechamento. Os do 3 e do 4
 * vêm só como conferência: são os que a pessoa viu, e o servidor recusa o
 * fechamento se a apuração mudou desde então.
 */
export const FecharMesImrSchema = z
  .object({
    contratoId: objectId,
    competencia,
    i1Pontos: pontos('indicador 1', PONTOS_MAXIMOS.i1),
    i1Observacao: observacao,
    i2Pontos: pontos('indicador 2', PONTOS_MAXIMOS.i2),
    i2Observacao: observacao,
    pontosVistos: z
      .object({
        i3: pontos('indicador 3', PONTOS_MAXIMOS.i3),
        i4: pontos('indicador 4', PONTOS_MAXIMOS.i4),
      })
      .strict(),
  })
  .strict();
export type FecharMesImrInput = z.infer<typeof FecharMesImrSchema>;

/** AC-11: reabrir pede motivo. */
export const ReabrirMesImrSchema = z
  .object({ contratoId: objectId, competencia, motivo: motivoImr })
  .strict();

/** AC-13: o PDF do fechamento vigente do mês. */
export const PedidoPdfImrSchema = z.object({ contratoId: objectId, competencia }).strict();
export type PedidoPdfImrInput = z.infer<typeof PedidoPdfImrSchema>;
