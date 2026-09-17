import mongoose from 'mongoose';

/**
 * Apoio dos testes que precisam do MongoDB de verdade (spec 0002, AC-16).
 *
 * Índice único, índice TTL e corrida entre duas gravações não aparecem com
 * mock: ou o banco está lá, ou o teste não prova nada. Sem `MONGO_TEST_URI`
 * esses testes são pulados, no mesmo padrão de `LLM_SMOKE=1` da spec 0001.
 *
 * Para subir um em container:
 *   docker run -d --name severino-mongo-test -p 27018:27017 mongo:7
 *   MONGO_TEST_URI=mongodb://localhost:27018/severino_test npm test
 */

export const MONGO_TEST_URI = process.env.MONGO_TEST_URI ?? '';

/** Verdadeiro quando há banco para os testes de banco rodarem. */
export const temMongoDeTeste = MONGO_TEST_URI.length > 0;

// `lib/db.ts` exige `MONGODB_URI` já na importação e o `dbConnect()` do código
// sob teste tem que cair no banco de teste, nunca no de desenvolvimento.
if (temMongoDeTeste) {
  process.env.MONGODB_URI = MONGO_TEST_URI;
}

/**
 * O mínimo que estes utilitários usam de um model. Estrutural de propósito: os
 * models têm tipos diferentes entre si e não caberiam num array tipado.
 */
export type ModelDeTeste = {
  createIndexes(): PromiseLike<unknown>;
  deleteMany(filtro: Record<string, unknown>): PromiseLike<unknown>;
  collection: { indexes(): Promise<unknown> };
};

/**
 * Conecta e garante que os índices declarados nos models existem no banco.
 *
 * O `banco` separa um arquivo de teste do outro: o Vitest roda arquivos em
 * paralelo, e dois deles limpando as mesmas coleções derrubam um ao outro.
 */
export async function conectarMongoDeTeste(models: ModelDeTeste[], banco?: string): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_TEST_URI, banco ? { dbName: banco } : undefined);
  }
  // `autoIndex` cria em segundo plano; aqui esperamos, senão o teste do índice
  // único corre antes de o índice existir e passa por engano.
  await Promise.all(models.map((model) => model.createIndexes()));
}

export async function desconectarMongoDeTeste(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/** Esvazia as coleções entre testes, mantendo os índices. */
export async function limparColecoes(models: ModelDeTeste[]): Promise<void> {
  await Promise.all(models.map((model) => model.deleteMany({})));
}

/** Os índices existentes da coleção. */
export async function indicesDe(model: ModelDeTeste): Promise<Record<string, unknown>[]> {
  return (await model.collection.indexes()) as unknown as Record<string, unknown>[];
}
