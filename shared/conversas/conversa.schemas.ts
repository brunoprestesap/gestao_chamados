import { z } from 'zod';

import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';

import {
  CARTAO_FALTANDO,
  CARTAO_MODOS,
  CONVERSA_AUTORES,
  CONVERSA_MENSAGEM_TIPOS,
  type ConversaMensagemTipo,
  DECISAO_CAMPOS,
  type DecisaoCampo,
} from './conversa.constants';

/** Limites de tamanho do texto da mensagem (o teto de contagem fica em `lib/conversas/config.ts`). */
export const CONVERSA_TEXTO_MIN = 1;
export const CONVERSA_TEXTO_MAX = 2000;
/** Prévia guardada na conversa para a lista lateral. */
export const CONVERSA_PREVIA_MAX = 120;
/** Uma frase explicando a decisão. */
export const DECISAO_MOTIVO_MAX = 200;
/** Justificativa de uma correção humana. */
export const DECISAO_CORRECAO_MOTIVO_MAX = 500;
/** Nome exibido do valor decidido, lido do banco no momento da gravação. */
export const DECISAO_ROTULO_MAX = 160;
/** Local exato do chamado, no cartão resumo e na confirmação (spec 0004). */
export const LOCAL_EXATO_MAX = 200;

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Identificador inválido');

/** Texto de qualquer mensagem: também é o que o leitor de tela lê. */
export const conversaTextoSchema = z
  .string()
  .trim()
  .min(CONVERSA_TEXTO_MIN, 'Escreva a mensagem')
  .max(CONVERSA_TEXTO_MAX, `A mensagem passa de ${CONVERSA_TEXTO_MAX} caracteres`);

/**
 * O cartão resumo (spec 0004, AC-5). Todo rótulo é lido do banco na montagem,
 * nunca do texto do modelo. `strictObject` recusa qualquer campo a mais: é o
 * que garante que confiança, motivo e prioridade nunca saem num cartão.
 */
export const cartaoPayloadSchema = z
  .strictObject({
    modo: z.enum(CARTAO_MODOS),
    servico: z
      .strictObject({
        catalogServiceId: objectIdSchema,
        subtypeId: objectIdSchema,
        tipoServico: z.enum(TIPO_SERVICO_OPTIONS),
        rotuloServico: z.string().min(1).max(DECISAO_ROTULO_MAX),
        rotuloSubtipo: z.string().max(DECISAO_ROTULO_MAX),
      })
      .nullable(),
    unidade: z
      .strictObject({
        unitId: objectIdSchema,
        rotulo: z.string().min(1).max(DECISAO_ROTULO_MAX),
        andar: z.string().max(DECISAO_ROTULO_MAX),
      })
      .nullable(),
    localExato: z.string().max(LOCAL_EXATO_MAX).nullable(),
    faltando: z.array(z.enum(CARTAO_FALTANDO)),
  })
  .refine((cartao) => (cartao.modo === 'manual') === (cartao.servico === null), {
    message: 'O cartão manual é exatamente o que não tem serviço',
    path: ['servico'],
  });
export type CartaoPayload = z.infer<typeof cartaoPayloadSchema>;

/**
 * `payload` aceito por tipo de mensagem. A mensagem de texto não tem payload.
 * Um tipo novo entra aqui junto com a constante, sem migração no banco.
 */
export const CONVERSA_PAYLOAD_SCHEMAS: Record<ConversaMensagemTipo, z.ZodType> = {
  texto: z.null(),
  cartao: cartaoPayloadSchema,
};

export const enviarMensagemSchema = z.object({
  conversaId: objectIdSchema,
  autor: z.enum(CONVERSA_AUTORES),
  tipo: z.enum(CONVERSA_MENSAGEM_TIPOS),
  texto: conversaTextoSchema,
  payload: z.unknown().optional(),
  llmCallId: objectIdSchema.nullish(),
});
export type EnviarMensagemInput = z.input<typeof enviarMensagemSchema>;
export type EnviarMensagemValues = z.infer<typeof enviarMensagemSchema>;

/**
 * Valor decidido, do jeito que quem chama informa: só os identificadores.
 * O `rotulo` não entra aqui, é lido do banco por `registrarDecisao` — texto
 * vindo do modelo nunca vira rótulo.
 */
export const valorServicoSchema = z.object({
  catalogServiceId: objectIdSchema,
  subtypeId: objectIdSchema,
  tipoServico: z.enum(TIPO_SERVICO_OPTIONS).nullish(),
});

export const valorPrioridadeSchema = z.object({
  prioridade: z.enum(FINAL_PRIORITY_VALUES),
});

export const valorTecnicoSchema = z.object({
  tecnicoId: objectIdSchema,
});

/** O schema do valor conforme o campo decidido. */
export function valorSchemaPara(campo: DecisaoCampo): z.ZodType {
  if (campo === 'servico') return valorServicoSchema;
  if (campo === 'prioridade') return valorPrioridadeSchema;
  return valorTecnicoSchema;
}

export type ValorServicoInput = z.infer<typeof valorServicoSchema>;
export type ValorPrioridadeInput = z.infer<typeof valorPrioridadeSchema>;
export type ValorTecnicoInput = z.infer<typeof valorTecnicoSchema>;
export type ValorDecisaoInput = ValorServicoInput | ValorPrioridadeInput | ValorTecnicoInput;

/** Valor como fica gravado: os identificadores mais o rótulo lido do banco. */
export type ValorDecisao = {
  catalogServiceId: string | null;
  subtypeId: string | null;
  tipoServico: string | null;
  prioridade: string | null;
  tecnicoId: string | null;
  rotulo: string;
};

export const decisaoMotivoSchema = z
  .string()
  .trim()
  .min(1, 'Explique a decisão em uma frase')
  .max(DECISAO_MOTIVO_MAX, `O motivo passa de ${DECISAO_MOTIVO_MAX} caracteres`);

export const registrarDecisaoSchema = z.object({
  chamadoId: objectIdSchema,
  conversaId: objectIdSchema.nullish(),
  campo: z.enum(DECISAO_CAMPOS),
  decididoPor: z.enum(['ia', 'regra'] as const),
  efeito: z.enum(['sugestao', 'aplicado'] as const),
  valor: z.unknown(),
  motivo: decisaoMotivoSchema,
  confianca: z.number().min(0).max(1).nullish(),
});
export type RegistrarDecisaoValues = z.infer<typeof registrarDecisaoSchema>;
