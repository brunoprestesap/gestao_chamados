import mongoose from 'mongoose';

import { definirLeitorDeSessaoParaTeste } from '@/lib/orgaos/contexto';

import { orgaoDaSessaoDeTeste, sessaoDeTeste } from './sessao-de-teste';

/**
 * Setup do projeto `db` do Vitest (spec 0025, AC-16).
 *
 * 1. A leitura da sessão devolve a sessão simulada de `tests/sessao-de-teste.ts`,
 *    de um usuário do órgão 1, como numa requisição de verdade.
 * 2. Os testes montam cenário com `Model.collection.insertOne/insertMany`, que
 *    passam por fora do plugin. Aqui esses inserts recebem o `orgaoId` da sessão
 *    simulada quando o documento não diz nenhum, como se o app os tivesse
 *    gravado. Documento com `orgaoId` (até `null`) fica como veio, a coleção
 *    `orgaos` (de plataforma) nunca é tocada, e com a sessão desligada
 *    (`definirOrgaoDaSessaoDeTeste(null)`) nada é carimbado: os testes de órgão
 *    gravam os documentos antigos, sem órgão, do jeito que precisam. O driver
 *    puro (`connection.db.collection(...)`) também fica de fora.
 */
definirLeitorDeSessaoParaTeste(async () => sessaoDeTeste());

type Doc = Record<string, unknown>;

function carimbar(colecao: string, doc: Doc): Doc {
  const orgaoId = orgaoDaSessaoDeTeste();
  if (!orgaoId || colecao === 'orgaos' || 'orgaoId' in doc) return doc;
  return { ...doc, orgaoId: new mongoose.Types.ObjectId(orgaoId) };
}

const proto = mongoose.Collection.prototype as unknown as {
  collectionName: string;
  insertOne: (doc: Doc, ...resto: unknown[]) => unknown;
  insertMany: (docs: Doc[], ...resto: unknown[]) => unknown;
};
const insertOne = proto.insertOne;
const insertMany = proto.insertMany;
proto.insertOne = function (this: typeof proto, doc, ...resto) {
  return insertOne.call(this, carimbar(this.collectionName, doc), ...resto);
};
proto.insertMany = function (this: typeof proto, docs, ...resto) {
  return insertMany.call(
    this,
    docs.map((d) => carimbar(this.collectionName, d)),
    ...resto,
  );
};
