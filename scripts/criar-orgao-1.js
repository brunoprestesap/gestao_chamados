/**
 * Cria o órgão 1 (spec 0025, AC-1): SJAP, Seção Judiciária do Amapá, com o
 * `_id` fixo de `shared/orgaos/orgao.constants.ts` (ORGAO_1_ID).
 *
 * Idempotente: rodar de novo não duplica nem altera o que já existe
 * (`$setOnInsert`). Rodar antes do deploy da fatia 1, na VPS:
 *   sudo docker exec -i severino-mongodb-1 mongosh manutencao < scripts/criar-orgao-1.js
 *
 * Não tem dado pessoal.
 */
const ORGAO_1_ID = ObjectId('000000000000000000000001');

db.orgaos.createIndex({ sigla: 1 }, { unique: true });

const resultado = db.orgaos.updateOne(
  { _id: ORGAO_1_ID },
  {
    $setOnInsert: {
      sigla: 'SJAP',
      nome: 'Seção Judiciária do Amapá',
      ativo: true,
      criadoEm: new Date(),
    },
  },
  { upsert: true },
);

print(
  resultado.upsertedCount === 1
    ? 'Órgão 1 (SJAP) criado.'
    : 'Órgão 1 (SJAP) já existia; nada foi alterado.',
);
