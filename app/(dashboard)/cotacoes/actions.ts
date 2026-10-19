'use server';

import { revalidatePath } from 'next/cache';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { podeRemoverArquivo } from '@/lib/material/arquivos';
import { papeisDe } from '@/lib/material/papeis';
import {
  criarCotacao,
  type EntradaTransicao,
  type ResultadoMaterial,
  salvarRascunho,
  transicionar,
} from '@/lib/material/transicoes';
import { ArquivoCotacaoModel } from '@/models/ArquivoCotacao';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import {
  AprovarSchema,
  CriarCotacaoSchema,
  ExecutarSchema,
  NotaFiscalSchema,
  RecebimentoSchema,
  SalvarRascunhoSchema,
  TransicaoComMotivoSchema,
  TransicaoSchema,
} from '@/shared/material/cotacao.schemas';
import type { SituacaoCotacao } from '@/shared/material/material.constants';

/**
 * Actions da cotação de material (spec 0019). Cada uma confere a sessão,
 * valida a entrada e chama `transicionar`, que confere papel e situação no
 * servidor. Nunca lança: devolve `{ ok: false, error, impedimentos? }`.
 */

const ERRO_GENERICO = 'Não foi possível concluir agora. Tente de novo.';

function revalidar(chamadoId?: string, cotacaoId?: string) {
  revalidatePath('/cotacoes');
  if (cotacaoId) revalidatePath(`/cotacoes/${cotacaoId}`);
  revalidatePath('/gestao');
  if (chamadoId) {
    revalidatePath(`/chamados-atribuidos/${chamadoId}`);
    revalidatePath(`/meus-chamados/${chamadoId}`);
  }
}

async function chamadoDa(cotacaoId: string): Promise<string | undefined> {
  const c = await CotacaoMaterialModel.findById(cotacaoId).select('chamadoId').lean();
  return c ? String(c.chamadoId) : undefined;
}

function primeiroErro(issues: { message: string }[]) {
  return { ok: false as const, error: issues[0]?.message ?? 'Dados inválidos.' };
}

async function executar<T extends object>(
  rotulo: string,
  fn: (sessao: { userId: string; role: string }) => Promise<ResultadoMaterial<T>>,
  revalidarDepois: (r: ResultadoMaterial<T>) => Promise<void> | void,
): Promise<ResultadoMaterial<T>> {
  try {
    const sessao = await verifySession();
    if (!sessao) return { ok: false, error: 'Sessão expirada. Entre de novo.' };
    await dbConnect();
    const r = await fn({ userId: sessao.userId, role: sessao.role });
    if (r.ok) await revalidarDepois(r);
    return r;
  } catch (e) {
    console.error(`[material] ${rotulo}:`, e);
    return { ok: false, error: ERRO_GENERICO };
  }
}

export async function criarCotacaoAction(raw: unknown): Promise<ResultadoMaterial<{ id: string }>> {
  const p = CriarCotacaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar(
    'criar',
    (s) => criarCotacao({ userId: s.userId }, p.data),
    (r) => {
      if (r.ok) revalidar(p.data.chamadoId, r.id);
    },
  );
}

export async function salvarRascunhoAction(
  raw: unknown,
): Promise<ResultadoMaterial<{ versao: number }>> {
  const p = SalvarRascunhoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar(
    'salvar',
    (s) => salvarRascunho(s, p.data),
    async () => revalidar(await chamadoDa(p.data.id), p.data.id),
  );
}

type ResultadoTransicao = ResultadoMaterial<{ situacao: SituacaoCotacao; versao: number }>;

async function transicao(
  acao: EntradaTransicao['acao'],
  dados: Omit<EntradaTransicao, 'acao' | 'ator' | 'cotacaoId'> & { id: string },
): Promise<ResultadoTransicao> {
  const { id, ...resto } = dados;
  return executar(
    acao,
    (s) =>
      transicionar({
        ...resto,
        cotacaoId: id,
        acao,
        ator: { tipo: 'usuario', userId: s.userId, role: s.role },
      }),
    async () => revalidar(await chamadoDa(id), id),
  );
}

export async function enviarCotacaoAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = TransicaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('enviar', p.data);
}

export async function assumirAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = TransicaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('assumir', p.data);
}

export async function devolverAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = TransicaoComMotivoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('devolver', p.data);
}

export async function reprovarAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = TransicaoComMotivoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('reprovar', p.data);
}

export async function encaminharAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = TransicaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('encaminhar', p.data);
}

export async function aprovarAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = AprovarSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('aprovar', p.data);
}

export async function alterarAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = TransicaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('alterar', p.data);
}

export async function cancelarAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = TransicaoComMotivoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('cancelar', p.data);
}

export async function executarAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = ExecutarSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return transicao('executar', p.data);
}

/** O gestor registra o recebimento provisório e, depois, o definitivo (AC-21). */
export async function registrarRecebimentoAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = RecebimentoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  const { etapa, ...resto } = p.data;
  return transicao(etapa === 'provisorio' ? 'receber_provisorio' : 'receber_definitivo', resto);
}

/** O responsável técnico registra a nota fiscal da cotação atestada (AC-22). */
export async function registrarNotaFiscalAction(raw: unknown): Promise<ResultadoTransicao> {
  const p = NotaFiscalSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  const { numero, data, arquivoId, ...resto } = p.data;
  return transicao('registrar_nf', { ...resto, notaFiscal: { numero, data, arquivoId } });
}

/**
 * Remover só marca `removidoEm`, só para quem enviou, em `rascunho` ou
 * `devolvida` (e a NF ainda não ligada na `atestada`, `podeRemoverArquivo`).
 */
export async function removerArquivoAction(raw: unknown): Promise<ResultadoMaterial> {
  const arquivoId =
    typeof raw === 'object' && raw ? (raw as { arquivoId?: unknown }).arquivoId : null;
  if (typeof arquivoId !== 'string' || !/^[a-f\d]{24}$/i.test(arquivoId)) {
    return { ok: false, error: 'Arquivo inválido.' };
  }
  return executar<object>(
    'remover arquivo',
    async (s): Promise<ResultadoMaterial> => {
      const arq = await ArquivoCotacaoModel.findOne({ _id: arquivoId, removidoEm: null }).lean();
      if (!arq) return { ok: false, error: 'Arquivo não encontrado.' };
      if (String(arq.enviadoPorUserId) !== s.userId) {
        return { ok: false, error: 'Só quem enviou remove o arquivo.' };
      }
      const cot = await CotacaoMaterialModel.findById(arq.cotacaoId)
        .select('situacao notaFiscal')
        .lean();
      // A exceção da `atestada` é do responsável técnico vigente, não só de quem enviou.
      const responsavelTecnico =
        cot?.situacao === 'atestada' &&
        (await papeisDe(s.userId, s.role)).tem('responsavel_tecnico');
      if (
        !cot ||
        !podeRemoverArquivo(
          arq,
          { situacao: cot.situacao as SituacaoCotacao, notaFiscal: cot.notaFiscal ?? null },
          { responsavelTecnico },
        )
      ) {
        return { ok: false, error: 'O arquivo não pode mais ser removido nesta situação.' };
      }
      await ArquivoCotacaoModel.updateOne(
        { _id: arq._id, removidoEm: null },
        { $set: { removidoEm: new Date(), removidoPorUserId: s.userId } },
      );
      return { ok: true };
    },
    async () => {
      const arq = await ArquivoCotacaoModel.findById(arquivoId).select('cotacaoId').lean();
      if (arq) revalidar(await chamadoDa(String(arq.cotacaoId)), String(arq.cotacaoId));
    },
  );
}
