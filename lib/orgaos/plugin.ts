import type { Aggregate, Document, Model, Query } from 'mongoose';
import { Schema, Types } from 'mongoose';

import { ORGAO_1_ID } from '@/shared/orgaos/orgao.constants';

import { contextoAtual, modoIsolamento, OrgaoAusenteError } from './contexto';

/**
 * O plugin de órgão (spec 0025). Põe o filtro do órgão em toda leitura e
 * carimba o órgão em toda gravação dos modelos de órgão, sem mexer nas
 * consultas que já existem.
 *
 * - `estrito`: filtra leitura, atualização e remoção por `$and: [{ orgaoId },
 *   filtroOriginal]`; sem órgão conhecido, lança `OrgaoAusenteError` antes
 *   de chegar ao banco.
 * - `observacao`: não filtra nada; carimba a gravação nova com o órgão do
 *   contexto (ou o órgão 1) e avisa uma vez por modelo e operação sem contexto.
 * - Dentro de `semOrgao`: não filtra, não carimba e não confere nada.
 *
 * Erros e avisos daqui levam modelo, operação e órgão, nunca filtro nem
 * documento (LGPD).
 */

const MARCA_ORGAO = Symbol.for('sigma.orgao.plugin');
const MARCA_PLATAFORMA = Symbol.for('sigma.orgao.plataforma');

type SchemaMarcado = Schema & { [MARCA_ORGAO]?: true; [MARCA_PLATAFORMA]?: true };

/** Verdadeiro quando o schema usa `pluginOrgao` (varredura do AC-14). */
export function usaPluginOrgao(schema: Schema): boolean {
  return (schema as SchemaMarcado)[MARCA_ORGAO] === true;
}

/** Verdadeiro quando o schema é de plataforma (sem órgão). */
export function ehPlataforma(schema: Schema): boolean {
  return (schema as SchemaMarcado)[MARCA_PLATAFORMA] === true;
}

/** Marca o modelo como de plataforma: sem `orgaoId` e fora do filtro. Hoje só `Orgao`. */
export function marcarPlataforma(schema: Schema): void {
  (schema as SchemaMarcado)[MARCA_PLATAFORMA] = true;
}

/** Erro de regra do plugin que não é falta de órgão (troca de órgão, estágio proibido). */
export class OrgaoRecusaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'OrgaoRecusaError';
  }
}

// ── Resolução ────────────────────────────────────────────────────────────────

type Resolucao =
  /** Dentro de `semOrgao`: nada a fazer. */
  | { tipo: 'sem' }
  /** Órgão conhecido (do `comOrgao` ou do JWT). */
  | { tipo: 'orgao'; orgaoId: string }
  /** Modo observação sem contexto: nada filtra, gravação vai para o órgão 1. */
  | { tipo: 'observacao_sem_contexto' };

const avisados = new Set<string>();

function avisarSemContexto(modelo: string, operacao: string) {
  const chave = `${modelo}.${operacao}`;
  if (avisados.has(chave)) return;
  avisados.add(chave);
  console.warn(`[Orgao:observacao] operação sem órgão: ${modelo}.${operacao}`);
}

async function resolver(modelo: string, operacao: string): Promise<Resolucao> {
  const contexto = await contextoAtual();
  if (contexto?.tipo === 'sem') return { tipo: 'sem' };
  if (contexto?.tipo === 'orgao') return { tipo: 'orgao', orgaoId: contexto.orgaoId };
  if (modoIsolamento() === 'estrito') throw new OrgaoAusenteError(modelo, operacao);
  avisarSemContexto(modelo, operacao);
  return { tipo: 'observacao_sem_contexto' };
}

/** O órgão de uma gravação nova: o do contexto, ou o órgão 1 na observação sem contexto. */
function orgaoDaGravacao(r: Resolucao): string | null {
  if (r.tipo === 'orgao') return r.orgaoId;
  if (r.tipo === 'observacao_sem_contexto') return ORGAO_1_ID;
  return null;
}

/** O órgão do filtro: só no estrito, e só com órgão conhecido. */
function orgaoDoFiltro(r: Resolucao): string | null {
  return r.tipo === 'orgao' && modoIsolamento() === 'estrito' ? r.orgaoId : null;
}

const oid = (id: string) => new Types.ObjectId(id);

function mesmoOrgao(valor: unknown, orgaoId: string): boolean {
  if (valor === null || valor === undefined) return false;
  return String(valor).toLowerCase() === orgaoId;
}

// ── Filtro e carimbo ─────────────────────────────────────────────────────────

function filtrar(filtro: Record<string, unknown> | undefined, orgaoId: string) {
  return { $and: [{ orgaoId: oid(orgaoId) }, filtro ?? {}] };
}

/** Carimba um documento cru ou do Mongoose; recusa outro órgão informado. */
function carimbar(
  doc: Record<string, unknown> | null | undefined,
  orgaoId: string,
  modelo: string,
) {
  if (!doc || typeof doc !== 'object') return;
  const atual = (doc as { orgaoId?: unknown }).orgaoId;
  if (atual !== undefined && atual !== null && !mesmoOrgao(atual, orgaoId)) {
    throw new OrgaoRecusaError(`Gravação em ${modelo} com órgão diferente do contexto.`);
  }
  if (typeof (doc as Partial<Document>).set === 'function') {
    (doc as unknown as Document).set('orgaoId', oid(orgaoId));
  } else {
    doc.orgaoId = oid(orgaoId);
  }
}

const OPERADORES_QUE_GRAVAM_VALOR = new Set(['$set', '$setOnInsert']);

/**
 * Recusa a atualização que muda ou remove `orgaoId` (AC-5). Gravar o mesmo
 * órgão do contexto é aceito; qualquer outro operador sobre o campo, não.
 */
function conferirAtualizacao(update: unknown, orgaoEfetivo: string | null, modelo: string) {
  if (!update || typeof update !== 'object') return;
  const recusa = () =>
    new OrgaoRecusaError(`Atualização em ${modelo} tentou mudar ou remover o órgão.`);

  if (Array.isArray(update)) {
    // Atualização por pipeline: qualquer menção ao campo é recusada.
    if (JSON.stringify(update).includes('orgaoId')) throw recusa();
    return;
  }

  for (const [chave, valor] of Object.entries(update as Record<string, unknown>)) {
    if (chave === 'orgaoId') {
      // Chave solta: o Mongoose trata como `$set`.
      if (!orgaoEfetivo || !mesmoOrgao(valor, orgaoEfetivo)) throw recusa();
      continue;
    }
    if (!chave.startsWith('$') || !valor || typeof valor !== 'object') continue;
    const campos = valor as Record<string, unknown>;
    if (chave === '$rename' && Object.values(campos).includes('orgaoId')) throw recusa();
    if (!Object.hasOwn(campos, 'orgaoId')) continue;
    if (!OPERADORES_QUE_GRAVAM_VALOR.has(chave)) throw recusa();
    if (!orgaoEfetivo || !mesmoOrgao(campos.orgaoId, orgaoEfetivo)) throw recusa();
  }
}

/** No `upsert`, o documento novo nasce com o órgão por `$setOnInsert` (AC-12). */
function carimbarUpsert(update: Record<string, unknown>, orgaoId: string) {
  const set = (update.$set ?? {}) as Record<string, unknown>;
  if (Object.hasOwn(set, 'orgaoId') || Object.hasOwn(update, 'orgaoId')) return;
  const setOnInsert = (update.$setOnInsert ?? {}) as Record<string, unknown>;
  update.$setOnInsert = { ...setOnInsert, orgaoId: oid(orgaoId) };
}

// ── Aggregate ────────────────────────────────────────────────────────────────

const ESTAGIOS_PROIBIDOS = [
  '$unionWith',
  '$graphLookup',
  '$out',
  '$merge',
  '$geoNear',
  '$search',
  '$vectorSearch',
];

function primeiroMatchTemOrgao(pipeline: unknown[]): boolean {
  const primeiro = pipeline[0] as { $match?: unknown } | undefined;
  return !!primeiro?.$match && JSON.stringify(primeiro.$match).includes('"orgaoId"');
}

/** Confere o pipeline (inclusive dentro de `$facet` e de `$lookup`) contra o AC-6. */
function conferirPipeline(pipeline: unknown[], modelo: string) {
  for (const estagio of pipeline) {
    if (!estagio || typeof estagio !== 'object') continue;
    const [nome, corpo] = Object.entries(estagio as Record<string, unknown>)[0] ?? [];
    if (!nome) continue;
    if (ESTAGIOS_PROIBIDOS.includes(nome)) {
      throw new OrgaoRecusaError(`Aggregate em ${modelo} com estágio ${nome} recusado.`);
    }
    if (nome === '$facet' && corpo && typeof corpo === 'object') {
      for (const sub of Object.values(corpo as Record<string, unknown>)) {
        if (Array.isArray(sub)) conferirPipeline(sub, modelo);
      }
    }
    if (nome === '$lookup' && corpo && typeof corpo === 'object') {
      const lookup = corpo as { foreignField?: unknown; pipeline?: unknown };
      if (Array.isArray(lookup.pipeline)) {
        if (!primeiroMatchTemOrgao(lookup.pipeline)) {
          throw new OrgaoRecusaError(
            `Aggregate em ${modelo}: $lookup com pipeline precisa começar por $match com orgaoId.`,
          );
        }
        conferirPipeline(lookup.pipeline, modelo);
      } else if (lookup.foreignField !== '_id') {
        throw new OrgaoRecusaError(
          `Aggregate em ${modelo}: $lookup simples só pode juntar por _id.`,
        );
      }
    }
  }
}

// ── bulkWrite ────────────────────────────────────────────────────────────────

type OperacaoBulk = Record<string, Record<string, unknown> | undefined>;

function prepararBulk(ops: OperacaoBulk[], r: Resolucao, modelo: string) {
  const gravacao = orgaoDaGravacao(r);
  const filtro = orgaoDoFiltro(r);
  for (const op of ops) {
    if (op.insertOne) {
      const doc = op.insertOne.document as Record<string, unknown> | undefined;
      if (gravacao) carimbar(doc, gravacao, modelo);
      continue;
    }
    const [tipo, corpo] = Object.entries(op)[0] ?? [];
    if (!tipo || !corpo) continue;
    if (tipo === 'replaceOne') {
      if (gravacao) carimbar(corpo.replacement as Record<string, unknown>, gravacao, modelo);
    }
    if (tipo === 'updateOne' || tipo === 'updateMany') {
      conferirAtualizacao(corpo.update, gravacao, modelo);
      if (corpo.upsert && gravacao && corpo.update && !Array.isArray(corpo.update)) {
        carimbarUpsert(corpo.update as Record<string, unknown>, gravacao);
      }
    }
    if (filtro) corpo.filter = filtrar(corpo.filter as Record<string, unknown>, filtro);
  }
}

// ── O plugin ─────────────────────────────────────────────────────────────────

const OPERACOES_DE_LEITURA = ['find', 'findOne', 'countDocuments', 'distinct'] as const;
const OPERACOES_DE_ATUALIZACAO = ['updateOne', 'updateMany', 'findOneAndUpdate'] as const;
const OPERACOES_DE_REMOCAO = ['deleteOne', 'deleteMany', 'findOneAndDelete'] as const;
const OPERACOES_DE_SUBSTITUICAO = ['replaceOne', 'findOneAndReplace'] as const;

type QueryQualquer = Query<unknown, unknown> & { op?: string };

/**
 * Acrescenta `orgaoId` (ObjectId, `ref: 'Orgao'`, com índice) e os ganchos.
 * O campo não é `required` no schema: quem garante a presença na gravação é
 * o gancho (carimba ou lança), e assim documentos antigos seguem legíveis e
 * `validateSync` de teste não muda. Aplicar depois dos outros ganchos do schema.
 */
export function pluginOrgao(schema: Schema): void {
  if (ehPlataforma(schema)) throw new Error('Modelo de plataforma não usa pluginOrgao.');
  (schema as SchemaMarcado)[MARCA_ORGAO] = true;

  schema.add({ orgaoId: { type: Schema.Types.ObjectId, ref: 'Orgao' } });
  schema.index({ orgaoId: 1 });

  // Leituras: find, findOne (findById, exists e populate passam por aqui),
  // countDocuments e distinct.
  schema.pre(
    [...OPERACOES_DE_LEITURA],
    { document: false, query: true },
    async function (this: QueryQualquer) {
      const r = await resolver(this.model.modelName, this.op ?? 'query');
      const orgaoId = orgaoDoFiltro(r);
      if (orgaoId) this.setQuery(filtrar(this.getFilter(), orgaoId));
    },
  );

  // Atualizações: confere a troca de órgão, carimba o upsert e filtra.
  schema.pre(
    [...OPERACOES_DE_ATUALIZACAO],
    { document: false, query: true },
    async function (this: QueryQualquer) {
      const modelo = this.model.modelName;
      const r = await resolver(modelo, this.op ?? 'update');
      if (r.tipo === 'sem') return;
      const gravacao = orgaoDaGravacao(r);
      const update = this.getUpdate();
      conferirAtualizacao(update, gravacao, modelo);
      if (this.getOptions().upsert && gravacao && update && !Array.isArray(update)) {
        carimbarUpsert(update as Record<string, unknown>, gravacao);
        this.setUpdate(update);
      }
      const orgaoId = orgaoDoFiltro(r);
      if (orgaoId) this.setQuery(filtrar(this.getFilter(), orgaoId));
    },
  );

  // Substituições: o documento novo sai com o órgão do contexto.
  schema.pre(
    [...OPERACOES_DE_SUBSTITUICAO],
    { document: false, query: true },
    async function (this: QueryQualquer) {
      const modelo = this.model.modelName;
      const r = await resolver(modelo, this.op ?? 'replace');
      if (r.tipo === 'sem') return;
      const gravacao = orgaoDaGravacao(r);
      const substituto = this.getUpdate() as Record<string, unknown> | null;
      if (gravacao && substituto) {
        carimbar(substituto, gravacao, modelo);
        this.setUpdate(substituto);
      }
      const orgaoId = orgaoDoFiltro(r);
      if (orgaoId) this.setQuery(filtrar(this.getFilter(), orgaoId));
    },
  );

  // Remoções por consulta.
  schema.pre(
    [...OPERACOES_DE_REMOCAO],
    { document: false, query: true },
    async function (this: QueryQualquer) {
      const r = await resolver(this.model.modelName, this.op ?? 'delete');
      const orgaoId = orgaoDoFiltro(r);
      if (orgaoId) this.setQuery(filtrar(this.getFilter(), orgaoId));
    },
  );

  // Sem filtro possível: recusado sempre (AC-6).
  schema.pre('estimatedDocumentCount', function (this: QueryQualquer) {
    throw new OrgaoRecusaError(
      `estimatedDocumentCount em ${this.model.modelName} é recusado; use countDocuments.`,
    );
  });

  // Aggregate: confere os estágios e põe o $match do órgão na frente.
  schema.pre('aggregate', async function (this: Aggregate<unknown>) {
    const modelo = (this.model() as Model<unknown>).modelName;
    const r = await resolver(modelo, 'aggregate');
    if (r.tipo === 'sem') return;
    conferirPipeline(this.pipeline(), modelo);
    const orgaoId = orgaoDoFiltro(r);
    if (orgaoId) this.pipeline().unshift({ $match: { orgaoId: oid(orgaoId) } });
  });

  // Documento novo: carimba. Documento existente: nunca troca de órgão e,
  // no estrito, só grava se for do órgão do contexto.
  schema.pre('save', async function (this: Document & { orgaoId?: unknown }) {
    const modelo = (this.constructor as Model<unknown>).modelName;
    const r = await resolver(modelo, 'save');
    if (r.tipo === 'sem') return;
    if (this.isNew) {
      const gravacao = orgaoDaGravacao(r);
      if (gravacao) carimbar(this as unknown as Record<string, unknown>, gravacao, modelo);
      return;
    }
    if (this.isModified('orgaoId')) {
      throw new OrgaoRecusaError(`save em ${modelo} tentou mudar o órgão.`);
    }
    conferirDocumentoExistente(this, r, modelo, 'save');
  });

  // `doc.updateOne()` já passa pelo gancho de consulta acima; `doc.deleteOne()`
  // não, então ganha um gancho de documento.
  schema.pre(
    'deleteOne',
    { document: true, query: false },
    async function (this: Document & { orgaoId?: unknown }) {
      const modelo = (this.constructor as Model<unknown>).modelName;
      const r = await resolver(modelo, 'deleteOne');
      conferirDocumentoExistente(this, r, modelo, 'deleteOne');
    },
  );

  schema.pre('insertMany', async function (this: Model<unknown>, docs: unknown) {
    const modelo = this.modelName;
    const r = await resolver(modelo, 'insertMany');
    const gravacao = orgaoDaGravacao(r);
    if (!gravacao) return;
    const lista = Array.isArray(docs) ? docs : [docs];
    for (const doc of lista) carimbar(doc as Record<string, unknown>, gravacao, modelo);
  });

  schema.pre('bulkWrite', async function (this: Model<unknown>, ops: unknown) {
    const modelo = this.modelName;
    const r = await resolver(modelo, 'bulkWrite');
    if (r.tipo === 'sem' || !Array.isArray(ops)) return;
    prepararBulk(ops as OperacaoBulk[], r, modelo);
  });
}

function conferirDocumentoExistente(
  doc: { orgaoId?: unknown },
  r: Resolucao,
  modelo: string,
  operacao: string,
) {
  const orgaoId = orgaoDoFiltro(r);
  if (orgaoId && !mesmoOrgao(doc.orgaoId, orgaoId)) {
    throw new OrgaoRecusaError(`${operacao} em ${modelo} de documento de outro órgão.`);
  }
}
