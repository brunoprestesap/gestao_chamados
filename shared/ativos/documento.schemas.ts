import { z } from 'zod';

import { FILTROS_SITUACAO } from './documento.constants';

const objectId = (mensagem: string) => z.string().regex(/^[a-f\d]{24}$/i, mensagem);

const idOpcional = (mensagem: string) =>
  z
    .union([z.literal(''), objectId(mensagem)])
    .optional()
    .nullable()
    .transform((v) => v || undefined);

const textoOpcional = (max: number, mensagem: string) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ?? '').trim() || undefined)
    .refine((v) => v === undefined || v.length <= max, mensagem);

/** Data `AAAA-MM-DD` do `<input type="date">`, mantida como texto. */
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (v: string) => DATA_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

const dataObrigatoria = z
  .string({ error: 'Informe a data de emissão.' })
  .trim()
  .refine((v) => v.length > 0, 'Informe a data de emissão.')
  .refine(dataValida, 'Data de emissão inválida.');

const dataOpcional = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? '').trim() || undefined)
  .refine((v) => v === undefined || dataValida(v), 'Data de validade inválida.');

const camposDoDocumento = {
  numero: textoOpcional(80, 'Número longo demais (até 80 caracteres).'),
  emitidoPor: textoOpcional(120, 'Emissor longo demais (até 120 caracteres).'),
  emitidoEm: dataObrigatoria,
  validadeAte: dataOpcional,
};

const validadeDepoisDaEmissao = (d: { emitidoEm: string; validadeAte?: string }) =>
  !d.validadeAte || d.validadeAte >= d.emitidoEm;
const ERRO_VALIDADE = {
  message: 'A validade não pode ser anterior à emissão.',
  path: ['validadeAte'],
};

/** Campos de texto do `POST /api/ativos/documentos` (o arquivo é conferido à parte). */
export const CadastrarDocumentoSchema = z
  .object({
    tipo: z
      .string({ error: 'Selecione o tipo do documento.' })
      .trim()
      .toLowerCase()
      .refine((v) => v.length > 0, 'Selecione o tipo do documento.'),
    ativoId: idOpcional('Ativo inválido.'),
    localizacaoId: idOpcional('Local inválido.'),
    ...camposDoDocumento,
  })
  .refine((d) => Boolean(d.ativoId) !== Boolean(d.localizacaoId), {
    message: 'Escolha um ativo ou um local (só um dos dois).',
    path: ['ativoId'],
  })
  .refine(validadeDepoisDaEmissao, ERRO_VALIDADE);
export type CadastrarDocumentoInput = z.output<typeof CadastrarDocumentoSchema>;

export const CorrigirDocumentoSchema = z
  .object({
    id: objectId('Documento inválido.'),
    ...camposDoDocumento,
  })
  .refine(validadeDepoisDaEmissao, ERRO_VALIDADE);
export type CorrigirDocumentoInput = z.input<typeof CorrigirDocumentoSchema>;
export type CorrigirDocumentoDados = z.output<typeof CorrigirDocumentoSchema>;

export const ExcluirDocumentoSchema = z.object({
  id: objectId('Documento inválido.'),
  motivo: z
    .string({ error: 'Informe o motivo da exclusão.' })
    .trim()
    .refine((v) => v.length > 0, 'Informe o motivo da exclusão.')
    .refine((v) => v.length <= 500, 'Motivo longo demais (até 500 caracteres).'),
});
export type ExcluirDocumentoInput = z.input<typeof ExcluirDocumentoSchema>;

// ── Tipos de documento (Admin) ──────────────────────────────────────────────

const nomeTipo = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .refine((v) => v.length > 0, 'Informe o nome.')
  .refine((v) => v.length <= 80, 'Nome longo demais (até 80 caracteres).');

export const CriarTipoDocumentoSchema = z.object({
  chave: z
    .string({ error: 'Informe a chave.' })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, 'A chave usa de 2 a 40 letras minúsculas, números ou "_".'),
  nome: nomeTipo,
});
export type CriarTipoDocumentoInput = z.input<typeof CriarTipoDocumentoSchema>;

export const EditarTipoDocumentoSchema = z.object({
  id: objectId('Tipo inválido.'),
  nome: nomeTipo,
});
export type EditarTipoDocumentoInput = z.input<typeof EditarTipoDocumentoSchema>;

// ── Painel ──────────────────────────────────────────────────────────────────

export const FiltroPainelDocumentosSchema = z.object({
  visao: z.enum(['documentos', 'faltando']).catch('documentos'),
  tipo: z.string().trim().toLowerCase().optional().catch(undefined),
  situacao: z.enum(FILTROS_SITUACAO).optional().catch(undefined),
  predio: objectId('').optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).catch(1),
});
export type FiltroPainelDocumentos = z.output<typeof FiltroPainelDocumentosSchema>;
