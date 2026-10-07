import { z } from 'zod';

import { CHAMADO_STATUSES, FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';

import {
  CARTAO_FALTANDO,
  CARTAO_MODOS,
  CONVERSA_AUTORES,
  CONVERSA_MENSAGEM_TIPOS,
  type ConversaMensagemTipo,
  DECISAO_CAMPOS,
  DECISAO_CAMPOS_DA_IA,
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

/** Teto de candidatos de equipamento num cartão (spec 0014, AC-3). */
export const ATIVO_CANDIDATOS_MAX = 5;
/** Teto do texto de descrição e de caminho de um candidato no cartão. */
export const ATIVO_CANDIDATO_TEXTO_MAX = 300;
export const ATIVO_ORIGENS = ['codigo', 'regra'] as const;
export type AtivoOrigem = (typeof ATIVO_ORIGENS)[number];

/**
 * O equipamento sugerido no cartão (spec 0014, AC-5): de onde veio e de 1 a 5
 * candidatos. Só código, descrição e caminho do local; `camposPatrimoniais`
 * nunca entra aqui.
 */
export const ativoDoCartaoSchema = z.strictObject({
  origem: z.enum(ATIVO_ORIGENS),
  candidatos: z
    .array(
      z.strictObject({
        ativoId: objectIdSchema,
        codigo: z.string().min(1).max(DECISAO_ROTULO_MAX),
        descricao: z.string().max(ATIVO_CANDIDATO_TEXTO_MAX),
        caminho: z.string().max(ATIVO_CANDIDATO_TEXTO_MAX).nullable(),
      }),
    )
    .min(1)
    .max(ATIVO_CANDIDATOS_MAX),
});
export type AtivoDoCartao = z.infer<typeof ativoDoCartaoSchema>;

/** Teto de chamados parecidos num cartão (spec 0017, AC-4). */
export const DUPLICADOS_CARTAO_MAX = 3;

/**
 * Um chamado em andamento que parece ser o mesmo problema (spec 0017, AC-6).
 * Só o que ajuda a decidir: número, serviço, local, equipamento, status e
 * idade. `strictObject` é o que impede nome, unidade, relato ou qualquer dado
 * de quem abriu o outro chamado de sair num cartão.
 */
export const duplicadoDoCartaoSchema = z.strictObject({
  chamadoId: objectIdSchema,
  ticketNumber: z.string().min(1).max(DECISAO_ROTULO_MAX),
  rotuloServico: z.string().min(1).max(DECISAO_ROTULO_MAX),
  localExato: z.string().max(LOCAL_EXATO_MAX).nullable(),
  ativoCodigo: z.string().max(DECISAO_ROTULO_MAX).nullable(),
  status: z.enum(CHAMADO_STATUSES),
  abertoEm: z.iso.datetime(),
  proprio: z.boolean(),
  jaTemAcesso: z.boolean(),
});
export type DuplicadoDoCartao = z.infer<typeof duplicadoDoCartaoSchema>;

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
    // Cartão gravado antes da spec 0014 não tem o campo: lido como `null`.
    // O cartão novo sempre grava o campo, com `null` quando não há ativo.
    ativo: ativoDoCartaoSchema.nullable().optional(),
    // Cartão gravado antes da spec 0017 não tem o campo: lido como `null`.
    duplicados: z
      .array(duplicadoDoCartaoSchema)
      .min(1)
      .max(DUPLICADOS_CARTAO_MAX)
      .nullable()
      .optional(),
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

/** O equipamento (spec 0014). `null` quando a gestão tira o ativo do chamado. */
export const valorAtivoSchema = z.object({
  ativoId: objectIdSchema.nullable(),
});

/** O schema do valor conforme o campo decidido. */
export function valorSchemaPara(campo: DecisaoCampo): z.ZodType {
  if (campo === 'servico') return valorServicoSchema;
  if (campo === 'prioridade') return valorPrioridadeSchema;
  if (campo === 'tecnico') return valorTecnicoSchema;
  return valorAtivoSchema;
}

export type ValorServicoInput = z.infer<typeof valorServicoSchema>;
export type ValorPrioridadeInput = z.infer<typeof valorPrioridadeSchema>;
export type ValorTecnicoInput = z.infer<typeof valorTecnicoSchema>;
export type ValorAtivoInput = z.infer<typeof valorAtivoSchema>;
export type ValorDecisaoInput =
  | ValorServicoInput
  | ValorPrioridadeInput
  | ValorTecnicoInput
  | ValorAtivoInput;

/** Valor como fica gravado: os identificadores mais o rótulo lido do banco. */
export type ValorDecisao = {
  catalogServiceId: string | null;
  subtypeId: string | null;
  tipoServico: string | null;
  prioridade: string | null;
  tecnicoId: string | null;
  /** Só na decisão `ativo` (spec 0014); `null` nas outras e ao tirar o ativo. */
  ativoId: string | null;
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

/**
 * Confirma uma decisão pendente, ou todas as pendentes do chamado quando
 * `campos` fica de fora (spec 0009, AC-5).
 */
export const confirmarDecisoesIaSchema = z.object({
  chamadoId: objectIdSchema,
  // `ativo` não é decisão da IA e nunca é confirmado por aqui (spec 0014, AC-11).
  campos: z.array(z.enum(DECISAO_CAMPOS_DA_IA)).optional(),
});
export type ConfirmarDecisoesIaInput = z.infer<typeof confirmarDecisoesIaSchema>;
