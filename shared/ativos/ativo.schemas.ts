import { z } from 'zod';

import {
  ATIVO_STATUSES,
  CRITICIDADES,
  LOCALIZACAO_TIPOS,
  ORIGENS_CODIGO,
  TIERS_MANUTENCAO,
} from './ativo.constants';
import {
  ERRO_LIMITE_CORRETIVOS,
  ERRO_LIMITE_REINCIDENCIA,
  LIMITE_CATEGORIA_MAX,
  LIMITE_CATEGORIA_MIN,
} from './substituicao.constants';

const objectId = (mensagem: string) => z.string().regex(/^[a-f\d]{24}$/i, mensagem);

/** Texto opcional: espaço em branco ou vazio vira ausente. */
const textoOpcional = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? '').trim() || undefined);

/** `''` ou ausente vira `undefined`; senão, ObjectId válido. */
const idOpcional = (mensagem: string) =>
  z
    .union([z.literal(''), objectId(mensagem)])
    .optional()
    .nullable()
    .transform((v) => v || undefined);

/** Data `AAAA-MM-DD` do `<input type="date">`; vazio vira ausente. */
const dataOpcional = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')])
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(`${v}T12:00:00Z`) : undefined));

const numeroOpcional = (min: number, mensagem: string) =>
  z
    .union([z.literal(''), z.coerce.number().int(mensagem).min(min, mensagem)])
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === null || v === undefined ? undefined : v));

/**
 * Limite da categoria para os candidatos à substituição (spec 0015, AC-6):
 * inteiro de 1 a 99; vazio vira ausente e a regra grava `null` (nunca 0).
 */
const limiteOpcional = (mensagem: string) =>
  z
    .union(
      [
        z.literal(''),
        z.coerce
          .number({ error: mensagem })
          .int(mensagem)
          .min(LIMITE_CATEGORIA_MIN, mensagem)
          .max(LIMITE_CATEGORIA_MAX, mensagem),
      ],
      { error: mensagem },
    )
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === null || v === undefined ? undefined : v));

// ── Localização ─────────────────────────────────────────────────────────────

const nomeLocal = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, 'Informe o nome do local.')
  .refine((v) => v.length <= 120, 'Nome longo demais.')
  .refine((v) => !v.includes('/'), 'O nome não pode ter "/".');

export const CriarLocalizacaoSchema = z.object({
  nome: nomeLocal,
  tipo: z.enum(LOCALIZACAO_TIPOS, { error: 'Selecione o tipo do local.' }),
  parentId: idOpcional('Local pai inválido.'),
  unitId: idOpcional('Unidade inválida.'),
});
export type CriarLocalizacaoInput = z.input<typeof CriarLocalizacaoSchema>;

export const EditarLocalizacaoSchema = z.object({
  id: objectId('Local inválido.'),
  nome: nomeLocal.optional(),
  // `null` = raiz (só vale para `predio`); ausente = não mexe no pai.
  parentId: z.union([objectId('Local pai inválido.'), z.null()]).optional(),
  unitId: z.union([objectId('Unidade inválida.'), z.null(), z.literal('')]).optional(),
});
export type EditarLocalizacaoInput = z.input<typeof EditarLocalizacaoSchema>;

export const IdSchema = z.object({ id: objectId('Registro inválido.') });

// ── Categoria ───────────────────────────────────────────────────────────────

export const CategoriaAtivoFormSchema = z.object({
  chave: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .refine((v) => /^[a-z][a-z0-9_]{1,49}$/.test(v), 'Chave: letras minúsculas, números e "_".'),
  nome: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'Informe o nome.'),
  criticidadePadrao: z.enum(CRITICIDADES, { error: 'Selecione a criticidade padrão.' }),
  periodicidadePreventivaDias: numeroOpcional(1, 'Periodicidade inválida.'),
  exigeDocumento: z
    .array(z.string())
    .optional()
    .transform((v) => [...new Set((v ?? []).map((d) => d.trim()).filter(Boolean))]),
  vidaUtilAnos: numeroOpcional(1, 'Vida útil inválida.'),
  limiteCorretivos12m: limiteOpcional(ERRO_LIMITE_CORRETIVOS),
  limiteReincidencia90d: limiteOpcional(ERRO_LIMITE_REINCIDENCIA),
  serviceSubTypeId: idOpcional('Subtipo inválido.'),
});
export type CategoriaAtivoFormInput = z.input<typeof CategoriaAtivoFormSchema>;

export const EditarCategoriaAtivoSchema = CategoriaAtivoFormSchema.extend({
  id: objectId('Categoria inválida.'),
});

// ── Ativo ───────────────────────────────────────────────────────────────────

const camposEditaveisAtivo = {
  descricao: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'Informe a descrição.'),
  categoriaId: objectId('Selecione a categoria.'),
  localizacaoId: idOpcional('Local inválido.'),
  tierManutencao: z.enum(TIERS_MANUTENCAO, { error: 'Selecione o tier de manutenção.' }),
  fabricante: textoOpcional,
  modelo: textoOpcional,
  numeroSerie: textoOpcional,
  dataInstalacao: dataOpcional,
  criticidade: z
    .union([z.literal(''), z.enum(CRITICIDADES)])
    .optional()
    .transform((v) => v || undefined),
};

export const CriarAtivoSchema = z
  .object({
    origemCodigo: z.enum(ORIGENS_CODIGO, { error: 'Selecione a origem do código.' }),
    tombamento: z
      .string()
      .optional()
      .transform((v) => (v ?? '').replace(/\s+/g, '') || undefined),
    ...camposEditaveisAtivo,
  })
  .superRefine((v, ctx) => {
    if (v.origemCodigo !== 'patrimonio') return;
    if (!v.tombamento) {
      ctx.addIssue({ code: 'custom', path: ['tombamento'], message: 'Informe o tombamento.' });
    } else if (!/^\d+$/.test(v.tombamento)) {
      // Só dígitos: o tombamento manual nunca invade a faixa `MNT-`.
      ctx.addIssue({
        code: 'custom',
        path: ['tombamento'],
        message: 'O tombamento só tem números.',
      });
    }
  });
export type CriarAtivoInput = z.input<typeof CriarAtivoSchema>;

export const EditarAtivoSchema = z.object({
  id: objectId('Ativo inválido.'),
  ...camposEditaveisAtivo,
  criticidade: z.enum(CRITICIDADES, { error: 'Selecione a criticidade.' }),
});
export type EditarAtivoInput = z.input<typeof EditarAtivoSchema>;

export const AlterarStatusAtivoSchema = z.object({
  id: objectId('Ativo inválido.'),
  status: z.enum(ATIVO_STATUSES, { error: 'Selecione o status.' }),
  observacao: textoOpcional,
});
export type AlterarStatusAtivoInput = z.input<typeof AlterarStatusAtivoSchema>;

export const VincularAtivoChamadoSchema = z.object({
  chamadoId: objectId('Chamado inválido.'),
  ativoId: z.union([objectId('Equipamento inválido.'), z.null()]),
});
export type VincularAtivoChamadoInput = z.input<typeof VincularAtivoChamadoSchema>;

// ── Busca e lista ───────────────────────────────────────────────────────────

export const BuscaSeletorSchema = z.object({
  q: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length >= 2, 'Digite ao menos 2 caracteres.'),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

export const FiltrosListaAtivosSchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim() || undefined),
  // id de um prédio, ou `sem` para os ativos sem local (exclusivos entre si).
  local: z
    .union([z.literal('sem'), objectId('Local inválido.'), z.literal('')])
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  categoria: idOpcional('Categoria inválida.').catch(undefined),
  status: z
    .union([z.enum(ATIVO_STATUSES), z.literal('')])
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  cadastro: z
    .union([z.enum(['importado', 'em_vistoria', 'validado']), z.literal('')])
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  // Candidatos à substituição (spec 0015, AC-9): só a gestão; a página ignora para os demais.
  substituicao: z
    .union([z.enum(['candidatos', 'dispensados']), z.literal('')])
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  pagina: z.coerce.number().int().min(1).catch(1).default(1),
});
export type FiltrosListaAtivos = z.infer<typeof FiltrosListaAtivosSchema>;
