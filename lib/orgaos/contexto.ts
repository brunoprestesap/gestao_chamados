import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

import { Types } from 'mongoose';
import { cache } from 'react';

import { type ModoIsolamento, MODOS_ISOLAMENTO } from '@/shared/orgaos/orgao.constants';

/**
 * De que órgão é a operação em curso (spec 0025, AC-2).
 *
 * A ordem é: o `comOrgao`/`semOrgao` em volta da chamada; senão, o `orgaoId`
 * do JWT da requisição; senão, nenhum. O plugin dos modelos lê daqui e nunca
 * consulta o banco para saber o órgão.
 */
export type Contexto =
  | { tipo: 'orgao'; orgaoId: string; origem: 'explicito' | 'sessao' }
  | { tipo: 'sem'; motivo: string };

type Escopo = { tipo: 'orgao'; orgaoId: string } | { tipo: 'sem'; motivo: string };

/**
 * Um armazenamento só por processo. O Next pode carregar este arquivo mais de
 * uma vez (uma cópia por camada do bundle: a do Server Action e a dos
 * modelos). Com um `AsyncLocalStorage` por cópia, o `comOrgao` do `authorize`
 * gravaria numa instância e o plugin leria de outra, e o login cairia sem
 * órgão no `estrito`. Por isso a instância mora no `globalThis`, numa chave
 * de `Symbol.for`, que é a mesma em todas as cópias.
 */
const CHAVE_ARMAZENAMENTO = Symbol.for('sigma.orgaos.contexto');
const globalComArmazenamento = globalThis as typeof globalThis & {
  [CHAVE_ARMAZENAMENTO]?: AsyncLocalStorage<Escopo>;
};
const armazenamento = (globalComArmazenamento[CHAVE_ARMAZENAMENTO] ??=
  new AsyncLocalStorage<Escopo>());

/** Operação num modelo de órgão sem órgão conhecido (modo estrito, AC-6). */
export class OrgaoAusenteError extends Error {
  readonly modelo: string;
  readonly operacao: string;

  constructor(modelo: string, operacao: string) {
    super(`Operação ${operacao} em ${modelo} sem órgão conhecido.`);
    this.name = 'OrgaoAusenteError';
    this.modelo = modelo;
    this.operacao = operacao;
  }
}

function normalizarId(orgaoId: string | Types.ObjectId): string {
  const texto = String(orgaoId);
  if (!Types.ObjectId.isValid(texto) || texto.length !== 24) {
    throw new Error('comOrgao recebeu um id de órgão inválido.');
  }
  return texto.toLowerCase();
}

/**
 * O que `comOrgao` e `semOrgao` devolvem: uma `Query` ou `Aggregate` do
 * Mongoose (que só executa no `await`) vira a `Promise` do resultado, já
 * executada dentro do escopo; o resto volta como veio.
 */
export type ResultadoNoEscopo<T> =
  T extends Promise<unknown> ? T : T extends PromiseLike<infer U> ? Promise<U> : T;

function rodarNoEscopo<T>(escopo: Escopo, fn: () => T): ResultadoNoEscopo<T> {
  return armazenamento.run(escopo, () => {
    const resultado = fn();
    // `() => Model.find()` devolve uma Query preguiçosa: sem isto ela rodaria
    // no `await` de quem chamou, já fora do escopo, e cairia sem órgão.
    if (
      resultado &&
      !(resultado instanceof Promise) &&
      typeof (resultado as { then?: unknown }).then === 'function'
    ) {
      const lazy = resultado as unknown as PromiseLike<unknown>;
      return new Promise((resolve, reject) => {
        lazy.then(resolve, reject);
      });
    }
    return resultado;
  }) as ResultadoNoEscopo<T>;
}

/**
 * Roda `fn` dentro do órgão informado. Usado fora da requisição (cron, login,
 * scripts) e pelos disparos tardios. Dentro de outro `comOrgao` com órgão
 * diferente, lança erro: um trecho de código nunca troca de órgão no meio.
 */
export function comOrgao<T>(orgaoId: string | Types.ObjectId, fn: () => T): ResultadoNoEscopo<T> {
  const id = normalizarId(orgaoId);
  const atual = armazenamento.getStore();
  if (atual?.tipo === 'orgao' && atual.orgaoId !== id) {
    throw new Error('comOrgao dentro de outro comOrgao com órgão diferente.');
  }
  return rodarNoEscopo({ tipo: 'orgao', orgaoId: id }, fn);
}

/**
 * Roda `fn` sem filtro nem carimbo de órgão. Só para os casos da lista de
 * permitidos, cada um com o motivo escrito (AC-7).
 */
export function semOrgao<T>(motivo: string, fn: () => T): ResultadoNoEscopo<T> {
  if (!motivo.trim()) throw new Error('semOrgao exige um motivo.');
  return rodarNoEscopo({ tipo: 'sem', motivo }, fn);
}

type SessaoComOrgao = { user?: { orgaoId?: unknown } } | null;

/**
 * Lê a sessão da requisição por `auth()`. O `import` é dinâmico porque
 * `auth.ts` importa o `User`, que importa o plugin, que importa este arquivo.
 */
async function lerSessaoDoNextAuth(): Promise<SessaoComOrgao> {
  const { auth } = await import('@/auth');
  return (await auth()) as SessaoComOrgao;
}

let lerSessao: () => Promise<SessaoComOrgao> = lerSessaoDoNextAuth;

/**
 * Só para testes: troca a leitura da sessão (`null` volta ao `auth()`). Os
 * testes de banco usam uma sessão simulada do órgão 1 (`tests/setup-db-orgao.ts`),
 * porque o `auth.ts` de verdade não carrega fora do Next. A varredura de APIs
 * recusa o uso fora dos testes.
 */
export function definirLeitorDeSessaoParaTeste(
  leitor: (() => Promise<SessaoComOrgao>) | null,
): void {
  lerSessao = leitor ?? lerSessaoDoNextAuth;
}

/**
 * O órgão do JWT, memoizado por requisição pelo `cache` do React. Só lê o
 * cookie por `auth()`: nunca vai ao banco e nunca passa pelo `verifySession`.
 * Fora de uma requisição o `auth()` lança, e isso vale como "sem contexto".
 */
const orgaoDaSessao = cache(async (): Promise<string | null> => {
  try {
    const sessao = await lerSessao();
    const id = sessao?.user?.orgaoId;
    return typeof id === 'string' && Types.ObjectId.isValid(id) && id.length === 24
      ? id.toLowerCase()
      : null;
  } catch {
    return null;
  }
});

/** O escopo explícito (`comOrgao`/`semOrgao`) em volta da chamada, se houver. */
export function escopoExplicito(): Escopo | undefined {
  return armazenamento.getStore();
}

/** O contexto de órgão da operação em curso, ou `null` sem órgão conhecido. */
export async function contextoAtual(): Promise<Contexto | null> {
  const escopo = armazenamento.getStore();
  if (escopo?.tipo === 'sem') return escopo;
  if (escopo?.tipo === 'orgao') return { ...escopo, origem: 'explicito' };
  const orgaoId = await orgaoDaSessao();
  return orgaoId ? { tipo: 'orgao', orgaoId, origem: 'sessao' } : null;
}

/**
 * Roda `fn` no contexto já capturado (spec 0025, AC-13). Sem contexto, roda
 * como veio: o plugin decide (falha em `estrito`, órgão 1 em `observacao`).
 */
export function noContexto<T>(contexto: Contexto | null, fn: () => Promise<T>): Promise<T> {
  if (!contexto) return fn();
  if (contexto.tipo === 'sem') return semOrgao(contexto.motivo, fn);
  return comOrgao(contexto.orgaoId, fn);
}

/**
 * Para disparos sem `await` que tocam o banco depois da resposta (AC-13): a
 * leitura do contexto começa na hora da chamada, ainda dentro da requisição,
 * e tudo o que `fn` grava fica no órgão de quem disparou, sem ler o JWT de
 * novo quando a resposta já saiu.
 */
export async function noOrgaoCapturado<T>(fn: () => Promise<T>): Promise<T> {
  return noContexto(await contextoAtual(), fn);
}

let modoEmCache: ModoIsolamento | null = null;

/**
 * `ORGAO_ISOLAMENTO`, lido uma vez por processo (AC-3). Ausente, vazio ou
 * inválido vale `estrito`; o inválido gera um `console.error` na primeira
 * leitura, porque esconder os dados antigos por erro de digitação precisa
 * aparecer no log.
 */
export function modoIsolamento(): ModoIsolamento {
  if (modoEmCache) return modoEmCache;
  const bruto = (process.env.ORGAO_ISOLAMENTO ?? '').trim();
  if (bruto && !(MODOS_ISOLAMENTO as readonly string[]).includes(bruto)) {
    console.error(
      `[Orgao] ORGAO_ISOLAMENTO com valor inválido; valendo "estrito". Use "observacao" ou "estrito".`,
    );
  }
  modoEmCache = (MODOS_ISOLAMENTO as readonly string[]).includes(bruto)
    ? (bruto as ModoIsolamento)
    : 'estrito';
  return modoEmCache;
}

/** Só para testes: faz a próxima chamada de `modoIsolamento` ler a variável de novo. */
export function reiniciarModoIsolamentoParaTeste(): void {
  modoEmCache = null;
}
