import { z } from 'zod';

import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';

import { cnpjValido, somenteDigitosCnpj } from './cnpj';
import { DATA_YMD_RE, MES_RE } from './janela';

/** Cadastro de contratos e pedido do PDF (spec 0016, AC-2 e AC-20). */

const objectId = (mensagem: string) => z.string().regex(/^[a-f\d]{24}$/i, mensagem);

const textoObrigatorio = (max: number, vazio: string, longo: string) =>
  z
    .string({ error: vazio })
    .trim()
    .refine((v) => v.length > 0, vazio)
    .refine((v) => v.length <= max, longo);

const textoOpcional = (max: number, longo: string) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ?? '').trim() || null)
    .refine((v) => v === null || v.length <= max, longo);

/** `YYYY-MM-DD` que existe no calendário; mês 13 ou 30/02 viram `false`, nunca exceção. */
const dataValida = (v: string) => {
  if (!DATA_YMD_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const data = (vazio: string, invalida: string) =>
  z
    .string({ error: vazio })
    .trim()
    .refine((v) => v.length > 0, vazio)
    .refine(dataValida, invalida);

const camposDoContrato = z
  .object({
    numero: textoObrigatorio(
      40,
      'Informe o número do contrato.',
      'Número longo demais (até 40 caracteres).',
    ),
    empresa: textoObrigatorio(
      160,
      'Informe a empresa contratada.',
      'Nome da empresa longo demais (até 160 caracteres).',
    ),
    cnpj: z
      .string({ error: 'Informe o CNPJ.' })
      .trim()
      .refine((v) => v.length > 0, 'Informe o CNPJ.')
      .refine(cnpjValido, 'CNPJ inválido.')
      .transform(somenteDigitosCnpj),
    processoSei: textoObrigatorio(
      40,
      'Informe o processo SEI.',
      'Processo SEI longo demais (até 40 caracteres).',
    ),
    objeto: textoOpcional(300, 'Objeto longo demais (até 300 caracteres).'),
    fiscal: textoOpcional(120, 'Nome do fiscal longo demais (até 120 caracteres).'),
    vigenciaInicio: data('Informe o início da vigência.', 'Início da vigência inválido.'),
    vigenciaFim: data('Informe o fim da vigência.', 'Fim da vigência inválido.'),
    tiposServico: z
      .array(z.enum(TIPO_SERVICO_OPTIONS, { error: 'Tipo de serviço inválido.' }), {
        error: 'Selecione ao menos um tipo de serviço.',
      })
      .min(1, 'Selecione ao menos um tipo de serviço.')
      .max(TIPO_SERVICO_OPTIONS.length, 'Tipos de serviço demais.')
      .refine((v) => new Set(v).size === v.length, 'Tipo de serviço repetido.'),
  })
  .refine((d) => d.vigenciaInicio <= d.vigenciaFim, {
    message: 'O início da vigência não pode ser depois do fim.',
    path: ['vigenciaFim'],
  });

export const CriarContratoSchema = camposDoContrato;
export type CriarContratoInput = z.input<typeof CriarContratoSchema>;
export type ContratoValidado = z.output<typeof CriarContratoSchema>;

export const EditarContratoSchema = z
  .object({ id: objectId('Contrato inválido.') })
  .and(camposDoContrato);
export type EditarContratoInput = z.input<typeof EditarContratoSchema>;

export const AlterarSituacaoContratoSchema = z.object({
  id: objectId('Contrato inválido.'),
  isActive: z.boolean({ error: 'Situação inválida.' }),
});
export type AlterarSituacaoContratoInput = z.input<typeof AlterarSituacaoContratoSchema>;

/** Corpo do `POST /api/relatorios/contrato/pdf`. */
export const PedidoPdfContratoSchema = z.object({
  contratoId: objectId('Contrato inválido.'),
  mes: z.string().regex(MES_RE, 'Mês inválido.'),
});
export type PedidoPdfContrato = z.infer<typeof PedidoPdfContratoSchema>;
