/**
 * Conferência do AC-16 da spec 0012 (a operação da vistoria), só de leitura.
 * Não grava nada. Mostra se existem as quatro categorias novas, a campanha
 * "Vistoria inicial" e os ativos MNT de elevador, QGBT, SPDA e hidrante com
 * local e conferidos na campanha.
 *
 * Na VPS (o usuário manutencao não está no grupo docker, por isso o sudo):
 *   scp scripts/conferir-ac16.js manutencao@172.18.3.48:~/
 *   sudo docker exec -i severino-mongodb-1 mongosh manutencao --quiet < ~/conferir-ac16.js
 *
 * Ativo MNT não tem dados patrimoniais, então a saída não traz nome nem
 * matrícula de ninguém.
 */

const NOME_CAMPANHA = 'Vistoria inicial';
const CATEGORIAS_NOVAS = ['elevador', 'spda', 'copa_refrigeracao', 'copa_coccao'];
const EQUIPAMENTOS = [
  { rotulo: 'Elevador', categoria: 'elevador' },
  { rotulo: 'QGBT', categoria: 'energia_transformador' },
  { rotulo: 'SPDA', categoria: 'spda' },
  { rotulo: 'Hidrante', categoria: 'combate_incendio' },
];

let pendencias = 0;
function linha(ok, texto) {
  if (!ok) pendencias += 1;
  print(`${ok ? '[ok]    ' : '[falta] '}${texto}`);
}

print('== Categorias novas ==');
const categorias = db.getCollection('categoriasativo');
for (const chave of CATEGORIAS_NOVAS) {
  const c = categorias.findOne({ chave });
  linha(
    !!c && c.isActive !== false,
    c
      ? `${chave}: "${c.nome}", criticidade ${c.criticidadePadrao}${c.isActive === false ? ' (DESATIVADA)' : ''}`
      : `${chave}: não existe`,
  );
}

print('');
print(`== Campanha "${NOME_CAMPANHA}" ==`);
// Sem diferenciar maiúsculas nem espaços nas pontas: "Vistoria Inicial" também vale.
const campanha = db
  .getCollection('campanhavistorias')
  .findOne({ nome: { $regex: `^\\s*${NOME_CAMPANHA}\\s*$`, $options: 'i' } });
linha(
  !!campanha,
  campanha
    ? `"${campanha.nome}", status ${campanha.status}, aberta em ${campanha.abertaEm.toISOString()}`
    : 'não existe',
);

print('');
print('== Ativos MNT com local e conferidos na campanha ==');
const ativos = db.getCollection('ativos');
const locais = db.getCollection('localizacoes');
const conferencias = db.getCollection('conferenciavistorias');
for (const e of EQUIPAMENTOS) {
  const cat = categorias.findOne({ chave: e.categoria });
  const lista = cat
    ? ativos
        .find({ origemCodigo: 'interno', categoriaId: cat._id, status: { $ne: 'baixado' } })
        .sort({ codigo: 1 })
        .toArray()
    : [];
  let completos = 0;
  for (const a of lista) {
    const local = a.localizacaoId ? locais.findOne({ _id: a.localizacaoId }) : null;
    const conferido = campanha
      ? !!conferencias.findOne({ campanhaId: campanha._id, ativoId: a._id })
      : false;
    if (local && conferido) completos += 1;
    print(
      `        ${a.codigo}  ${a.descricao}  | ${local ? local.caminho : 'SEM LOCAL'} | ${conferido ? 'conferido' : 'NÃO conferido'}`,
    );
  }
  linha(
    completos > 0,
    `${e.rotulo} (${e.categoria}): ${completos} de ${lista.length} com local e conferidos`,
  );
}

print('');
print(pendencias === 0 ? 'AC-16: tudo certo.' : `AC-16: ${pendencias} pendência(s) acima.`);
