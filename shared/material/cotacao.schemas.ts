import { z } from 'zod';

import { somenteDigitosCnpj } from '@/shared/contratos/cnpj';

import {
  MAX_ITENS_COTACAO,
  MAX_ORCAMENTOS_COTACAO,
  PAPEIS_DESIGNACAO,
  TIPOS_MOVIMENTO_EMPENHO,
} from './material.constants';

/** Entradas das actions da cotação de material (spec 0019). Dinheiro chega em centavos. */

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido.');
/** `YYYY-MM-DD` que existe no calendário: 31/02 viraria data inválida e erro no Mongoose. */
const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Data inválida.');
const centavos = z.number().int('Valor inválido.').min(0, 'Valor inválido.');
const quantidade = z
  .number()
  .positive('A quantidade precisa ser maior que zero.')
  .max(1_000_000, 'Quantidade alta demais.')
  .refine((q) => Math.abs(Math.round(q * 1000) - q * 1000) < 1e-6, 'Até 3 casas decimais.');
const motivoObrigatorio = z
  .string()
  .trim()
  .min(5, 'Escreva o motivo (ao menos 5 letras).')
  .max(2000, 'Motivo longo demais.');

export const ItemDiagnosticoSchema = z.object({
  descricao: z.string().trim().min(2, 'Descreva o material.').max(300),
  unidade: z.string().trim().min(1, 'Informe a unidade.').max(20),
  quantidade,
  motivo: z.string().trim().min(2, 'Diga para que serve o material.').max(500),
});

export const CriarCotacaoSchema = z.object({
  chamadoId: objectId,
  itens: z.array(ItemDiagnosticoSchema).min(1, 'Registre ao menos um item.').max(MAX_ITENS_COTACAO),
  cotacaoAnteriorId: objectId.optional(),
});
export type CriarCotacaoInput = z.infer<typeof CriarCotacaoSchema>;

/** Item no rascunho: `id` existente ou gerado pela tela para item novo. */
export const ItemRascunhoSchema = ItemDiagnosticoSchema.extend({ id: objectId });

export const OrcamentoRascunhoSchema = z.object({
  id: objectId,
  fornecedor: z.string().trim().min(2, 'Informe o fornecedor.').max(160),
  cnpj: z
    .string()
    .transform(somenteDigitosCnpj)
    .refine((c) => c.length === 14, 'O CNPJ tem 14 dígitos.'),
  data: ymd,
  validade: ymd.nullable().optional(),
  arquivoId: objectId,
  precos: z
    .array(z.object({ itemId: objectId, valorUnitarioCentavos: centavos }))
    .max(MAX_ITENS_COTACAO),
});

/** Algum id aparece mais de uma vez na lista. */
export function temIdRepetido(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * Ids repetidos burlariam a trava dos itens do diagnóstico (AC-1): a regra
 * compararia só uma das entradas. Recusa item, orçamento e preço repetidos.
 */
export function idsRepetidosDoRascunho(e: {
  itens: readonly { id: string }[];
  orcamentos?: readonly {
    id: string;
    arquivoId: string;
    precos: readonly { itemId: string }[];
  }[];
}): string | null {
  if (temIdRepetido(e.itens.map((i) => i.id))) return 'Um item aparece repetido na cotação.';
  const orcamentos = e.orcamentos ?? [];
  if (temIdRepetido(orcamentos.map((o) => o.id))) return 'Um orçamento aparece repetido.';
  if (temIdRepetido(orcamentos.map((o) => o.arquivoId))) {
    return 'Cada orçamento precisa do próprio arquivo.';
  }
  if (orcamentos.some((o) => temIdRepetido(o.precos.map((p) => p.itemId)))) {
    return 'Um orçamento dá dois preços ao mesmo item.';
  }
  return null;
}

export const SalvarRascunhoSchema = z
  .object({
    id: objectId,
    versao: z.number().int().min(1),
    itens: z
      .array(ItemRascunhoSchema)
      .min(1, 'A cotação precisa de ao menos um item.')
      .max(MAX_ITENS_COTACAO),
    orcamentos: z.array(OrcamentoRascunhoSchema).max(MAX_ORCAMENTOS_COTACAO).optional(),
  })
  .superRefine((e, ctx) => {
    const erro = idsRepetidosDoRascunho(e);
    if (erro) ctx.addIssue({ code: 'custom', message: erro });
  });
export type SalvarRascunhoInput = z.infer<typeof SalvarRascunhoSchema>;

export const TransicaoSchema = z.object({
  id: objectId,
  versao: z.number().int().min(1),
});
export type TransicaoInput = z.infer<typeof TransicaoSchema>;

export const TransicaoComMotivoSchema = TransicaoSchema.extend({ motivo: motivoObrigatorio });
export type TransicaoComMotivoInput = z.infer<typeof TransicaoComMotivoSchema>;

export const AprovarSchema = TransicaoSchema.extend({ empenhoId: objectId });
export type AprovarInput = z.infer<typeof AprovarSchema>;

export const ExecutarSchema = TransicaoSchema.extend({
  quantidades: z
    .array(
      z.object({
        itemId: objectId,
        quantidadeExecutada: z
          .number()
          .min(0, 'A quantidade não pode ser negativa.')
          .refine((q) => Math.abs(Math.round(q * 1000) - q * 1000) < 1e-6, 'Até 3 casas decimais.'),
      }),
    )
    .min(1)
    .max(MAX_ITENS_COTACAO),
});
export type ExecutarInput = z.infer<typeof ExecutarSchema>;

/** Recebimento do gestor (AC-21): o provisório primeiro, o definitivo leva a `atestada`. */
export const RecebimentoSchema = TransicaoSchema.extend({
  etapa: z.enum(['provisorio', 'definitivo']),
});
export type RecebimentoInput = z.infer<typeof RecebimentoSchema>;

/** Nota fiscal do responsável técnico, só em `atestada` (AC-22). */
export const NotaFiscalSchema = TransicaoSchema.extend({
  numero: z.string().trim().min(1, 'Informe o número da nota fiscal.').max(60),
  data: ymd,
  arquivoId: objectId,
});
export type NotaFiscalInput = z.infer<typeof NotaFiscalSchema>;

// ---------------------------------------------------------------------------
// Cadastro do Admin (AC-19)
// ---------------------------------------------------------------------------

export const CriarEmpenhoSchema = z.object({
  numero: z.string().trim().min(3, 'Informe o número do empenho.').max(40),
  exercicio: z.number().int().min(2000).max(2100),
  valorInicialCentavos: z.number().int().min(1, 'O valor precisa ser maior que zero.'),
  vigenciaFim: ymd.nullable().optional(),
});
export type CriarEmpenhoInput = z.infer<typeof CriarEmpenhoSchema>;

export const MovimentoEmpenhoSchema = z.object({
  empenhoId: objectId,
  tipo: z.enum(TIPOS_MOVIMENTO_EMPENHO),
  valorCentavos: z.number().int().min(1, 'O valor precisa ser maior que zero.'),
  ato: z.string().trim().min(3, 'Informe o ato (documento SEI).').max(200),
});
export type MovimentoEmpenhoInput = z.infer<typeof MovimentoEmpenhoSchema>;

export const SituacaoEmpenhoSchema = z.object({ empenhoId: objectId, ativo: z.boolean() });

export const CriarFaixaSchema = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à faixa.').max(80),
  limiteCentavos: z.number().int().min(1, 'O limite precisa ser maior que zero.'),
});
export type CriarFaixaInput = z.infer<typeof CriarFaixaSchema>;

export const DesativarFaixaSchema = z.object({ faixaId: objectId });

export const CriarDesignacaoSchema = z
  .object({
    userId: objectId,
    papel: z.enum(PAPEIS_DESIGNACAO),
    faixaId: objectId.nullable().optional(),
    vigenciaInicio: ymd,
    vigenciaFim: ymd.nullable().optional(),
    ato: z.string().trim().min(3, 'Informe o ato de designação.').max(200),
  })
  .refine((d) => d.papel !== 'aprovador' || !!d.faixaId, {
    message: 'Aprovador precisa de uma faixa.',
    path: ['faixaId'],
  })
  .refine((d) => !d.vigenciaFim || d.vigenciaFim >= d.vigenciaInicio, {
    message: 'O fim da vigência é anterior ao início.',
    path: ['vigenciaFim'],
  });
export type CriarDesignacaoInput = z.infer<typeof CriarDesignacaoSchema>;

export const RevogarDesignacaoSchema = z.object({ designacaoId: objectId });
