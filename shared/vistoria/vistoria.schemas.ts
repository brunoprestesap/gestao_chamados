import { z } from 'zod';

import { ORIGENS_CODIGO } from '@/shared/ativos/ativo.constants';

import {
  type EstadoResultado,
  LIMITE_LOTE_VISTORIA,
  NOME_CAMPANHA_MAX,
  type PapelAutor,
  TIERS_CADASTRO_CAMPO,
} from './vistoria.constants';

const objectId = (mensagem: string) => z.string().regex(/^[a-f\d]{24}$/i, mensagem);

/** Texto técnico opcional: em branco vira ausente, e ausente mantém o valor atual (AC-5). */
const textoTecnico = z
  .string()
  .max(120, 'Texto longo demais.')
  .optional()
  .nullable()
  .transform((v) => (v ?? '').trim() || undefined);

// ── Campanha ────────────────────────────────────────────────────────────────

export const AbrirCampanhaSchema = z.object({
  nome: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'Informe o nome da campanha.')
    .refine((v) => v.length <= NOME_CAMPANHA_MAX, 'Nome longo demais.'),
});
export type AbrirCampanhaInput = z.input<typeof AbrirCampanhaSchema>;

export const EncerrarCampanhaSchema = z.object({ id: objectId('Campanha inválida.') });
export type EncerrarCampanhaInput = z.input<typeof EncerrarCampanhaSchema>;

// ── Sincronização ───────────────────────────────────────────────────────────

/** UUID gerado no aparelho; só o formato importa, a versão não. */
export const ClientOpIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'clientOpId inválido.');

export const OperacaoConferenciaSchema = z.object({
  clientOpId: ClientOpIdSchema,
  tipo: z.literal('conferencia'),
  campanhaId: objectId('Campanha inválida.'),
  ativoId: objectId('Ativo inválido.'),
  localizacaoId: objectId('Local inválido.'),
  fabricante: textoTecnico,
  modelo: textoTecnico,
  numeroSerie: textoTecnico,
  conferidoEm: z.coerce.date({ error: 'Data inválida.' }),
});
export type OperacaoConferencia = z.infer<typeof OperacaoConferenciaSchema>;
export type OperacaoConferenciaInput = z.input<typeof OperacaoConferenciaSchema>;

/**
 * Cadastro em campo (AC-11): os mesmos limites do `CriarAtivoSchema` da 0011,
 * com o local obrigatório (é a sala onde a pessoa está) e só os tiers A e B.
 */
export const OperacaoCadastroSchema = z
  .object({
    clientOpId: ClientOpIdSchema,
    tipo: z.literal('cadastro'),
    campanhaId: objectId('Campanha inválida.'),
    origemCodigo: z.enum(ORIGENS_CODIGO, { error: 'Selecione a origem do código.' }),
    tombamento: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ?? '').replace(/\s+/g, '') || undefined),
    descricao: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, 'Informe a descrição.'),
    categoriaId: objectId('Selecione a categoria.'),
    tierManutencao: z.enum(TIERS_CADASTRO_CAMPO, { error: 'Selecione o tier A ou B.' }),
    localizacaoId: objectId('Local inválido.'),
    fabricante: textoTecnico,
    modelo: textoTecnico,
    numeroSerie: textoTecnico,
    conferidoEm: z.coerce.date({ error: 'Data inválida.' }),
  })
  .superRefine((v, ctx) => {
    if (v.origemCodigo !== 'patrimonio') return;
    if (!v.tombamento) {
      ctx.addIssue({ code: 'custom', path: ['tombamento'], message: 'Informe o tombamento.' });
    } else if (!/^\d+$/.test(v.tombamento)) {
      ctx.addIssue({
        code: 'custom',
        path: ['tombamento'],
        message: 'O tombamento só tem números.',
      });
    }
  });
export type OperacaoCadastro = z.infer<typeof OperacaoCadastroSchema>;
export type OperacaoCadastroInput = z.input<typeof OperacaoCadastroSchema>;

/** Qualquer operação da fila; o `tipo` decide o schema. */
export const OperacaoVistoriaSchema = z.discriminatedUnion('tipo', [
  OperacaoConferenciaSchema,
  OperacaoCadastroSchema,
]);
export type OperacaoVistoria = z.infer<typeof OperacaoVistoriaSchema>;
export type OperacaoVistoriaInput = z.input<typeof OperacaoVistoriaSchema>;

/**
 * O corpo só precisa ser um lote; cada operação é validada sozinha depois,
 * para uma malformada voltar `recusada` sem travar as outras (AC-6).
 */
export const LoteSincronizacaoSchema = z.object({
  operacoes: z.array(z.unknown()).min(1).max(LIMITE_LOTE_VISTORIA),
});

export type ResultadoOperacao = {
  clientOpId: string;
  estado: EstadoResultado;
  ativoId?: string;
  codigo?: string;
  mensagem?: string;
  conferidoPor?: string;
  conferidoEm?: string;
};

export type RespostaSincronizacao = { resultados: ResultadoOperacao[] };

// ── Pacote ──────────────────────────────────────────────────────────────────

export type AtivoDoPacote = {
  id: string;
  codigo: string;
  descricao: string;
  categoriaId: string;
  tierManutencao: string;
  localizacaoId: string | null;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  ausenteNoSicam: boolean;
};

export type LocalDoPacote = {
  id: string;
  nome: string;
  tipo: string;
  parentId: string | null;
  caminho: string;
};

export type ConferidoDoPacote = {
  ativoId: string;
  autorNome: string;
  conferidoEm: string;
};

export type PacoteVistoria = {
  campanha: { id: string; nome: string; status: string; abertaEm: string };
  geradoEm: string;
  ativos: AtivoDoPacote[];
  locais: LocalDoPacote[];
  categorias: { id: string; nome: string }[];
  conferidos: ConferidoDoPacote[];
};

/** Técnico é da contratada; Admin e Preposto, servidores. */
export function papelDoPerfil(role: string): PapelAutor {
  return role === 'Técnico' ? 'contratada' : 'servidor';
}
