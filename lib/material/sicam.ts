import 'server-only';

import { z } from 'zod';

import { disponivelDe } from '@/shared/material/checagem';
import { PRAZO_SICAM_LOTE_MS, PRAZO_SICAM_MS } from '@/shared/material/material.constants';

/**
 * O cliente do `sicam-gateway` (spec 0024). Todas as funções devolvem
 * `{ ok: false, motivo }` em vez de lançar: serviço fora, Oracle fora, prazo
 * estourado ou variável ausente contam igual, como SICAM fora do ar, e a falha
 * nunca quebra a tela nem a criação da cotação (AC-12). O texto da busca não vai
 * para o log.
 */

export type MaterialSicam = {
  coMat: string;
  descricao: string;
  unidade: string;
  saldo: number;
  reservado: number;
  disponivel: number;
  valorTotal: number | null;
  acertos?: number;
};

export type MotivoSicamFora = 'nao_configurado' | 'prazo' | 'indisponivel' | 'resposta_invalida';

export type ResultadoSicam<T> =
  | ({ ok: true; consultadoEm: Date } & T)
  | { ok: false; motivo: MotivoSicamFora };

const MaterialSchema = z
  .object({
    coMat: z.string(),
    descricao: z.string(),
    unidade: z.string(),
    saldo: z.number(),
    reservado: z.number(),
    valorTotal: z.number().nullable(),
    acertos: z.number().optional(),
  })
  .transform((m) => ({
    ...m,
    // A reserva nunca fica negativa, nem deixa o disponível abaixo de zero (AC-9).
    reservado: Math.max(0, m.reservado),
    disponivel: disponivelDe(m.saldo, Math.max(0, m.reservado)),
  }));

const ListaSchema = z.object({ materiais: z.array(MaterialSchema) });
const CandidatosSchema = z.object({ itens: z.record(z.string(), z.array(MaterialSchema)) });

async function chamar<S extends z.ZodTypeAny>(
  caminho: string,
  init: { method: 'GET' } | { method: 'POST'; body: unknown },
  schema: S,
  prazoMs: number,
): Promise<ResultadoSicam<{ dados: z.output<S> }>> {
  const base = process.env.SICAM_GATEWAY_URL;
  const segredo = process.env.SICAM_GATEWAY_SECRET;
  if (!base || !segredo) return { ok: false, motivo: 'nao_configurado' };
  try {
    const resposta = await fetch(`${base.replace(/\/$/, '')}${caminho}`, {
      method: init.method,
      headers: { 'x-internal-secret': segredo, 'content-type': 'application/json' },
      ...(init.method === 'POST' ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(prazoMs),
      cache: 'no-store',
    });
    if (!resposta.ok) {
      console.warn(
        `[material] sicam-gateway respondeu ${resposta.status} em ${caminho.split('?')[0]}`,
      );
      return { ok: false, motivo: 'indisponivel' };
    }
    const lido = schema.safeParse(await resposta.json());
    if (!lido.success) {
      console.warn('[material] sicam-gateway devolveu uma resposta fora do formato');
      return { ok: false, motivo: 'resposta_invalida' };
    }
    return { ok: true, consultadoEm: new Date(), dados: lido.data };
  } catch (e) {
    const prazo = (e as { name?: string }).name === 'TimeoutError';
    console.warn(`[material] sicam-gateway ${prazo ? 'estourou o prazo' : 'não respondeu'}`);
    return { ok: false, motivo: prazo ? 'prazo' : 'indisponivel' };
  }
}

/**
 * Os candidatos de cada item, numa só chamada em lote, com prazo de 6 segundos
 * para a requisição inteira: estourou, todos os itens contam como SICAM fora (AC-2).
 */
export async function buscarCandidatos(
  itens: readonly { itemId: string; palavras: readonly string[] }[],
): Promise<ResultadoSicam<{ porItem: Map<string, MaterialSicam[]> }>> {
  const r = await chamar(
    '/candidatos',
    { method: 'POST', body: { itens } },
    CandidatosSchema,
    PRAZO_SICAM_LOTE_MS,
  );
  if (!r.ok) return r;
  return {
    ok: true,
    consultadoEm: r.consultadoEm,
    porItem: new Map(Object.entries(r.dados.itens)),
  };
}

/** A busca manual, por texto ou `CO_MAT`, com saldo zero incluído (AC-5). */
export async function buscarMateriais(
  q: string,
  limite: number,
): Promise<ResultadoSicam<{ materiais: MaterialSicam[] }>> {
  const params = new URLSearchParams({ q, limite: String(limite) });
  const r = await chamar(`/materiais?${params}`, { method: 'GET' }, ListaSchema, PRAZO_SICAM_MS);
  if (!r.ok) return r;
  return { ok: true, consultadoEm: r.consultadoEm, materiais: r.dados.materiais };
}

/**
 * A releitura no concluir, numa só chamada (AC-9). Com a lista vazia, serve só
 * para saber se o SICAM responde: é ele quem decide a origem (AC-12).
 */
export async function relerMateriais(
  coMats: readonly string[],
): Promise<ResultadoSicam<{ porCoMat: Map<string, MaterialSicam> }>> {
  const r = await chamar(
    '/materiais/lote',
    { method: 'POST', body: { coMats } },
    ListaSchema,
    PRAZO_SICAM_MS,
  );
  if (!r.ok) return r;
  return {
    ok: true,
    consultadoEm: r.consultadoEm,
    porCoMat: new Map(r.dados.materiais.map((m) => [m.coMat, m])),
  };
}
