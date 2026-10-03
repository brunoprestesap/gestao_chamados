// Carga dos tipos de documento do ativo (spec 0013, AC-1). Idempotente: cria
// PMOC, AVCB, ART, laudo de SPDA e garantia só se a chave ainda não existir, e
// nunca muda nome nem situação de um tipo que o Admin já editou.
//
// Produção:
//   sudo docker exec -i severino-mongodb-1 mongosh manutencao < scripts/carga-tipos-documento.js
//
// A lista é a mesma de TIPOS_DOCUMENTO_INICIAIS (shared/ativos/documento.constants.ts)
// e do bloco de tipos em scripts/seed.js; um teste confere que as três batem.

const TIPOS_DOCUMENTO = [
  { chave: 'pmoc', nome: 'PMOC' },
  { chave: 'avcb', nome: 'AVCB' },
  { chave: 'art', nome: 'ART' },
  { chave: 'laudo_spda', nome: 'Laudo de SPDA' },
  { chave: 'garantia', nome: 'Garantia' },
];

let criados = 0;
for (const t of TIPOS_DOCUMENTO) {
  const agora = new Date();
  const r = db.tiposdocumento.updateOne(
    { chave: t.chave },
    {
      $setOnInsert: {
        chave: t.chave,
        nome: t.nome,
        isActive: true,
        createdAt: agora,
        updatedAt: agora,
      },
    },
    { upsert: true },
  );
  if (r.upsertedCount === 1) criados += 1;
}
print('Tipos de documento criados: ' + criados + ' (de ' + TIPOS_DOCUMENTO.length + ')');
