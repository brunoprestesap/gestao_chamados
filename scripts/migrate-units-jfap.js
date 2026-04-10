/**
 * Migração: adiciona unidades reais da Justiça Federal do Amapá (SJAP/TRF1).
 * NÃO remove unidades existentes — apenas insere as novas.
 *
 * Executar via mongosh dentro do container MongoDB:
 *   docker exec -i severino-mongodb-1 mongosh manutencao < scripts/migrate-units-jfap.js
 */

const now = new Date();

const newUnits = [
  // Varas (Macapá)
  "1ª Vara Federal - Cível",
  "2ª Vara Federal - Cível",
  "3ª Vara Federal - Juizado Especial Federal",
  "4ª Vara Federal - JEF Criminal",
  "5ª Vara Federal - Juizado Especial Federal",
  "6ª Vara Federal - Cível",
  // Subseções e Varas do Interior
  "Subseção Judiciária de Oiapoque",
  "Vara Única de Oiapoque",
  "Subseção Judiciária de Laranjal do Jari",
  "Vara Única de Laranjal do Jari",
  // Diretorias e Secretarias
  "Diretoria do Foro",
  "Secretaria Administrativa",
  "Secretaria Única das Turmas Recursais",
  // Núcleos
  "Núcleo de Apoio à Coordenação do JEF-AP (Nucod)",
  "Núcleo de Gestão de Pessoas",
  "Núcleo Judiciário",
  "Núcleo de Tecnologia da Informação",
  // Centrais e Centros
  "Centro Judiciário de Conciliação (CEJUC)",
  "Central de Perícias",
  "Central de Videoconferência",
  "Central de Mandados",
  "Centro Especializado de Atenção às Vítimas de Crimes (CEAV)",
  "Biblioteca Central",
];

// Filtra unidades que já existem pelo nome (case-insensitive)
const existing = db.units.find({}, { name: 1 }).toArray().map((u) => u.name.toLowerCase());
const toInsert = newUnits
  .filter((name) => !existing.includes(name.toLowerCase()))
  .map((name) => ({
    name,
    floor: "",
    responsibleName: "",
    responsibleEmail: "",
    responsiblePhone: "",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));

if (toInsert.length === 0) {
  print("Nenhuma unidade nova para inserir — todas já existem.");
} else {
  print(`Inserindo ${toInsert.length} unidade(s) nova(s)...`);
  const result = db.units.insertMany(toInsert, { ordered: false });
  print(`${result.insertedIds ? Object.keys(result.insertedIds).length : 0} unidade(s) inserida(s) com sucesso.`);
  printjson(result.insertedIds);
}

print("--- Migração de unidades JFAP concluída ---");
