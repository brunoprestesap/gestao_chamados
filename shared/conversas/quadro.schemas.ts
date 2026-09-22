import { z } from 'zod';

import { CONVERSA_FALHAS } from './conversa.constants';
import { cartaoPayloadSchema, objectIdSchema } from './conversa.schemas';

/**
 * Contrato de rede da resposta do assistente (spec 0003). As rotas de POST
 * devolvem NDJSON: um quadro por linha, terminado em `\n`. Nada disto vai para
 * o banco; é só o que trafega entre a rota e a tela.
 */

/** Como a linha é separada no fluxo. Uma linha vazia é ignorada pelo leitor. */
export const QUADRO_SEPARADOR = '\n';

export const QUADRO_TIPOS = ['inicio', 'parcial', 'fim', 'reserva', 'cartao'] as const;
export type QuadroTipo = (typeof QUADRO_TIPOS)[number];

/**
 * Primeiro quadro: a conversa já existe e a mensagem do solicitante já está
 * gravada. A tela guarda o `conversaId` aqui e, a partir daí, toda nova
 * tentativa vai pela rota com `id` (AC-4).
 */
export const quadroInicioSchema = z.object({
  tipo: z.literal('inicio'),
  conversaId: objectIdSchema,
  mensagemId: objectIdSchema,
});

/** Texto acumulado do assistente. Nunca é gravado (AC-5). */
export const quadroParcialSchema = z.object({
  tipo: z.literal('parcial'),
  texto: z.string(),
});

/**
 * Resposta pronta. `mensagemId` nulo significa que a resposta é boa mas não
 * pôde ser gravada, e a tela avisa que ela não fica salva (AC-5b).
 */
export const quadroFimSchema = z.object({
  tipo: z.literal('fim'),
  texto: z.string(),
  mensagemId: objectIdSchema.nullable(),
  motivo: z.enum(CONVERSA_FALHAS).nullish(),
});

/**
 * A IA não respondeu. O texto é uma constante do Sigma, nunca do modelo, e já
 * está gravado como mensagem de autor `sistema` (AC-7).
 */
export const quadroReservaSchema = z.object({
  tipo: z.literal('reserva'),
  texto: z.string(),
  mensagemId: objectIdSchema.nullable(),
  motivo: z.string(),
});

/**
 * O cartão resumo mudou (spec 0004, AC-4). Vem depois de `fim` ou `reserva`.
 * Com `cartao` preenchido, é o cartão novo, já gravado como `mensagemId`; com
 * `cartao: null`, o cartão `substituiId` deixou de valer e não há outro.
 * Cliente antigo não entende este quadro, e `lerQuadro` o ignora sem quebrar.
 */
export const quadroCartaoSchema = z
  .strictObject({
    tipo: z.literal('cartao'),
    mensagemId: objectIdSchema.nullable(),
    cartao: cartaoPayloadSchema.nullable(),
    substituiId: objectIdSchema.nullable(),
  })
  .refine((quadro) => (quadro.cartao === null) === (quadro.mensagemId === null), {
    message: 'Cartão novo sempre vem com o id da mensagem gravada',
    path: ['mensagemId'],
  });

export const quadroRespostaSchema = z.discriminatedUnion('tipo', [
  quadroInicioSchema,
  quadroParcialSchema,
  quadroFimSchema,
  quadroReservaSchema,
  quadroCartaoSchema,
]);

export type QuadroInicio = z.infer<typeof quadroInicioSchema>;
export type QuadroParcial = z.infer<typeof quadroParcialSchema>;
export type QuadroFim = z.infer<typeof quadroFimSchema>;
export type QuadroReserva = z.infer<typeof quadroReservaSchema>;
export type QuadroCartao = z.infer<typeof quadroCartaoSchema>;
export type QuadroResposta = z.infer<typeof quadroRespostaSchema>;

/** Uma linha do fluxo, do jeito que a rota escreve. */
export function serializarQuadro(quadro: QuadroResposta): string {
  return `${JSON.stringify(quadro)}${QUADRO_SEPARADOR}`;
}

/**
 * Lê uma linha do fluxo. Linha em branco ou quadro fora do contrato devolve
 * `null`: a tela ignora o que não entende em vez de quebrar no meio da resposta.
 */
export function lerQuadro(linha: string): QuadroResposta | null {
  const limpa = linha.trim();
  if (!limpa) return null;
  try {
    const parsed = quadroRespostaSchema.safeParse(JSON.parse(limpa));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
