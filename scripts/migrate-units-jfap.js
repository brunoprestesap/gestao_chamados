/**
 * Migração: adiciona unidades reais da Justiça Federal do Amapá (SJAP/TRF1).
 * NÃO remove unidades existentes — apenas insere as novas.
 *
 * Executar via mongosh dentro do container MongoDB:
 *   docker exec -i severino-mongodb-1 mongosh manutencao < scripts/migrate-units-jfap.js
 */

var now = new Date();

// 1. Remove registros corrompidos (inseridos como string em vez de objeto)
var corrupted = db.units.deleteMany({ name: { $exists: false } });
print('Registros corrompidos removidos: ' + corrupted.deletedCount);

// 2. Nomes das unidades existentes (para evitar duplicatas)
var existingNames = [];
db.units.find({}, { name: 1 }).forEach(function (u) {
  existingNames.push(u.name.toLowerCase());
});

// 3. Unidades a inserir
var docs = [];

var names = [
  '1ª Vara Federal - Cível',
  '2ª Vara Federal - Cível',
  '3ª Vara Federal - Juizado Especial Federal',
  '4ª Vara Federal - JEF Criminal',
  '5ª Vara Federal - Juizado Especial Federal',
  '6ª Vara Federal - Cível',
  'Subseção Judiciária de Oiapoque',
  'Vara Única de Oiapoque',
  'Subseção Judiciária de Laranjal do Jari',
  'Vara Única de Laranjal do Jari',
  'Diretoria do Foro',
  'Secretaria Administrativa',
  'Secretaria Única das Turmas Recursais',
  'Núcleo de Apoio à Coordenação do JEF-AP (Nucod)',
  'Núcleo de Gestão de Pessoas',
  'Núcleo Judiciário',
  'Núcleo de Tecnologia da Informação',
  'Centro Judiciário de Conciliação (CEJUC)',
  'Central de Perícias',
  'Central de Videoconferência',
  'Central de Mandados',
  'Centro Especializado de Atenção às Vítimas de Crimes (CEAV)',
  'Biblioteca Central',
];

for (var i = 0; i < names.length; i++) {
  if (existingNames.indexOf(names[i].toLowerCase()) === -1) {
    docs.push({
      name: names[i],
      floor: '',
      responsibleName: '',
      responsibleEmail: '',
      responsiblePhone: '',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// 4. Inserir
if (docs.length === 0) {
  print('Nenhuma unidade nova para inserir — todas já existem.');
} else {
  print('Inserindo ' + docs.length + ' unidade(s) nova(s)...');
  var result = db.units.insertMany(docs, { ordered: false });
  print('Unidade(s) inserida(s) com sucesso: ' + Object.keys(result.insertedIds).length);
  printjson(result.insertedIds);
}

print('--- Migração de unidades JFAP concluída ---');
