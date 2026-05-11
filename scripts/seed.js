/**
 * Seed inicial para o Sigma.
 * Executar via mongosh dentro do container MongoDB:
 *   docker exec -i sigma-mongodb-1 mongosh manutencao < scripts/seed.js
 *
 * Cria: admin, unidades, usuários, tipos/subtipos de serviço,
 *       catálogo de serviços, SLA configs e calendário comercial.
 *
 * IMPORTANTE: O hash abaixo corresponde à senha "123456" (bcrypt 10 rounds).
 */

// Hash bcrypt para "123456"
const HASH_123456 = '$2b$10$.qN9tPuymsN/4izrZvM53OIfxAsBSI4MDxhX8vfEi/BlimF.8WRXK';

const now = new Date();

// -------------------------------------------------------
// 1. Unidades — Justiça Federal do Amapá (SJAP/TRF1)
// -------------------------------------------------------
print('--- Criando unidades ---');
const units = db.units.insertMany([
  // Varas (Macapá)
  {
    name: '1ª Vara Federal - Cível',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: '2ª Vara Federal - Cível',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: '3ª Vara Federal - Juizado Especial Federal',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: '4ª Vara Federal - JEF Criminal',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: '5ª Vara Federal - Juizado Especial Federal',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: '6ª Vara Federal - Cível',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Subseções e Varas do Interior
  {
    name: 'Subseção Judiciária de Oiapoque',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Vara Única de Oiapoque',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Subseção Judiciária de Laranjal do Jari',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Vara Única de Laranjal do Jari',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Diretorias e Secretarias
  {
    name: 'Diretoria do Foro',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Secretaria Administrativa',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Secretaria Única das Turmas Recursais',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Núcleos
  {
    name: 'Núcleo de Apoio à Coordenação do JEF-AP (Nucod)',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Núcleo de Gestão de Pessoas',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Núcleo Judiciário',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Núcleo de Tecnologia da Informação',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Centrais e Centros
  {
    name: 'Centro Judiciário de Conciliação (CEJUC)',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Central de Perícias',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Central de Videoconferência',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Central de Mandados',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Centro Especializado de Atenção às Vítimas de Crimes (CEAV)',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    name: 'Biblioteca Central',
    floor: '',
    responsibleName: '',
    responsibleEmail: '',
    responsiblePhone: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]);
printjson(units.insertedIds);

// Referências para usuários seed (índices das unidades acima)
const unitTI = units.insertedIds[16]; // Núcleo de Tecnologia da Informação
const unitDiretoria = units.insertedIds[10]; // Diretoria do Foro
const unitRH = units.insertedIds[14]; // Núcleo de Gestão de Pessoas

// -------------------------------------------------------
// 2. Tipos de Serviço
//    Devem corresponder ao formulário: "Manutenção Predial" e "Ar-Condicionado"
// -------------------------------------------------------
print('--- Criando tipos de serviço ---');
const types = db.servicetypes.insertMany([
  { name: 'Manutenção Predial', isActive: true, createdAt: now, updatedAt: now },
  { name: 'Ar-Condicionado', isActive: true, createdAt: now, updatedAt: now },
  { name: 'Elevador', isActive: true, createdAt: now, updatedAt: now },
]);
printjson(types.insertedIds);

const tPredial = types.insertedIds[0];
const tAC = types.insertedIds[1];
const tElevador = types.insertedIds[2];

// -------------------------------------------------------
// 3. Subtipos de Serviço
// -------------------------------------------------------
print('--- Criando subtipos de serviço ---');
const subtypes = db.servicesubtypes.insertMany([
  // Manutenção Predial
  { typeId: tPredial, name: 'Elétrica', isActive: true, createdAt: now, updatedAt: now },
  { typeId: tPredial, name: 'Hidráulica', isActive: true, createdAt: now, updatedAt: now },
  { typeId: tPredial, name: 'Civil', isActive: true, createdAt: now, updatedAt: now },
  { typeId: tPredial, name: 'Marcenaria', isActive: true, createdAt: now, updatedAt: now },
  { typeId: tPredial, name: 'TI e Infraestrutura', isActive: true, createdAt: now, updatedAt: now },
  // Ar-Condicionado
  { typeId: tAC, name: 'Manutenção Preventiva', isActive: true, createdAt: now, updatedAt: now },
  { typeId: tAC, name: 'Manutenção Corretiva', isActive: true, createdAt: now, updatedAt: now },
  { typeId: tAC, name: 'Instalação', isActive: true, createdAt: now, updatedAt: now },
  // Elevador
  {
    typeId: tElevador,
    name: 'Manutenção Preventiva',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    typeId: tElevador,
    name: 'Manutenção Corretiva',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  { typeId: tElevador, name: 'Modernização', isActive: true, createdAt: now, updatedAt: now },
  {
    typeId: tElevador,
    name: 'Instalação e Montagem',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]);
printjson(subtypes.insertedIds);

const stEletrica = subtypes.insertedIds[0];
const stHidraulica = subtypes.insertedIds[1];
const stCivil = subtypes.insertedIds[2];
const stMarcenaria = subtypes.insertedIds[3];
const stTI = subtypes.insertedIds[4];
const stPreventivaAC = subtypes.insertedIds[5];
const stCorretivaAC = subtypes.insertedIds[6];
const stInstalacaoAC = subtypes.insertedIds[7];
const stPreventivaElev = subtypes.insertedIds[8];
const stCorretivaElev = subtypes.insertedIds[9];
const stModernizacaoElev = subtypes.insertedIds[10];
const stInstalacaoElev = subtypes.insertedIds[11];

// -------------------------------------------------------
// 4. Catálogo de Serviços
// -------------------------------------------------------
print('--- Criando catálogo de serviços ---');
db.servicecatalogs.insertMany([
  // Manutenção Predial > Elétrica
  {
    code: 'ELET-0001',
    name: 'Troca de lâmpada',
    description: 'Substituição de lâmpadas queimadas ou com defeito',
    typeId: tPredial,
    subtypeId: stEletrica,
    priorityDefault: 'Baixa',
    estimatedHours: 1,
    materials: 'Lâmpada compatível',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELET-0002',
    name: 'Reparo de tomada',
    description: 'Conserto ou substituição de tomada elétrica',
    typeId: tPredial,
    subtypeId: stEletrica,
    priorityDefault: 'Normal',
    estimatedHours: 1,
    materials: 'Tomada, fios',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELET-0003',
    name: 'Reparo em quadro elétrico',
    description: 'Manutenção de disjuntores e quadro de distribuição',
    typeId: tPredial,
    subtypeId: stEletrica,
    priorityDefault: 'Alta',
    estimatedHours: 3,
    materials: 'Disjuntores, fios',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Manutenção Predial > Hidráulica
  {
    code: 'HIDR-0001',
    name: 'Reparo de vazamento',
    description: 'Identificação e correção de vazamentos',
    typeId: tPredial,
    subtypeId: stHidraulica,
    priorityDefault: 'Alta',
    estimatedHours: 2,
    materials: 'Vedantes, tubos',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'HIDR-0002',
    name: 'Desentupimento de ralo/vaso',
    description: 'Desobstrução de ralos, vasos sanitários e tubulações',
    typeId: tPredial,
    subtypeId: stHidraulica,
    priorityDefault: 'Normal',
    estimatedHours: 2,
    materials: 'Desentupidor, soda',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'HIDR-0003',
    name: 'Troca de torneira',
    description: 'Substituição de torneira com defeito',
    typeId: tPredial,
    subtypeId: stHidraulica,
    priorityDefault: 'Baixa',
    estimatedHours: 1,
    materials: 'Torneira, fita veda-rosca',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Manutenção Predial > Civil
  {
    code: 'CIVL-0001',
    name: 'Pintura de ambiente',
    description: 'Pintura de paredes e tetos',
    typeId: tPredial,
    subtypeId: stCivil,
    priorityDefault: 'Baixa',
    estimatedHours: 8,
    materials: 'Tinta, rolo, massa corrida',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'CIVL-0002',
    name: 'Reparo em alvenaria',
    description: 'Correção de trincas, buracos e danos em paredes',
    typeId: tPredial,
    subtypeId: stCivil,
    priorityDefault: 'Normal',
    estimatedHours: 4,
    materials: 'Cimento, argamassa',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'CIVL-0003',
    name: 'Reparo de piso',
    description: 'Substituição ou reparo de pisos danificados',
    typeId: tPredial,
    subtypeId: stCivil,
    priorityDefault: 'Normal',
    estimatedHours: 4,
    materials: 'Piso, argamassa, rejunte',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Manutenção Predial > Marcenaria
  {
    code: 'MARC-0001',
    name: 'Reparo de mobiliário',
    description: 'Conserto de mesas, cadeiras, armários e estantes',
    typeId: tPredial,
    subtypeId: stMarcenaria,
    priorityDefault: 'Baixa',
    estimatedHours: 3,
    materials: 'Parafusos, cola, dobradiças',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'MARC-0002',
    name: 'Confecção de móvel sob medida',
    description: 'Fabricação de móvel personalizado',
    typeId: tPredial,
    subtypeId: stMarcenaria,
    priorityDefault: 'Normal',
    estimatedHours: 16,
    materials: 'MDF, dobradiças, puxadores',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Manutenção Predial > TI e Infraestrutura
  {
    code: 'INFR-0001',
    name: 'Reparo de ponto de rede',
    description: 'Conectorização e teste de ponto de rede',
    typeId: tPredial,
    subtypeId: stTI,
    priorityDefault: 'Normal',
    estimatedHours: 2,
    materials: 'Conector RJ45, cabo CAT6',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'INFR-0002',
    name: 'Remanejamento de equipamento',
    description: 'Realocação de computadores, impressoras e periféricos',
    typeId: tPredial,
    subtypeId: stTI,
    priorityDefault: 'Baixa',
    estimatedHours: 2,
    materials: '',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Ar-Condicionado
  {
    code: 'CLIM-0001',
    name: 'Manutenção preventiva de ar-condicionado',
    description: 'Limpeza de filtros, verificação de gás e funcionamento geral',
    typeId: tAC,
    subtypeId: stPreventivaAC,
    priorityDefault: 'Baixa',
    estimatedHours: 2,
    materials: 'Filtro, produto de limpeza',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'CLIM-0002',
    name: 'Reparo de ar-condicionado',
    description: 'Conserto de equipamento com defeito',
    typeId: tAC,
    subtypeId: stCorretivaAC,
    priorityDefault: 'Alta',
    estimatedHours: 4,
    materials: 'Peças conforme diagnóstico',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'CLIM-0003',
    name: 'Instalação de ar-condicionado',
    description: 'Instalação de novo equipamento de climatização',
    typeId: tAC,
    subtypeId: stInstalacaoAC,
    priorityDefault: 'Normal',
    estimatedHours: 6,
    materials: 'Suporte, tubulação, dreno',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Elevador > Manutenção Preventiva
  {
    code: 'ELEV-0001',
    name: 'Inspeção geral do elevador',
    description: 'Verificação de cabos, polias, freios e sistema de segurança',
    typeId: tElevador,
    subtypeId: stPreventivaElev,
    priorityDefault: 'Normal',
    estimatedHours: 3,
    materials: 'Lubrificante, ferramentas de inspeção',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELEV-0002',
    name: 'Lubrificação de guias e componentes',
    description: 'Lubrificação periódica das guias, trilhos e partes móveis',
    typeId: tElevador,
    subtypeId: stPreventivaElev,
    priorityDefault: 'Baixa',
    estimatedHours: 2,
    materials: 'Óleo lubrificante, graxa',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELEV-0003',
    name: 'Verificação do sistema de segurança',
    description: 'Teste de freios de emergência, limitador de velocidade e para-quedas',
    typeId: tElevador,
    subtypeId: stPreventivaElev,
    priorityDefault: 'Alta',
    estimatedHours: 4,
    materials: 'Equipamento de teste',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Elevador > Manutenção Corretiva
  {
    code: 'ELEV-0004',
    name: 'Reparo de porta do elevador',
    description: 'Conserto de portas que não abrem, fecham ou travam',
    typeId: tElevador,
    subtypeId: stCorretivaElev,
    priorityDefault: 'Alta',
    estimatedHours: 3,
    materials: 'Rolamentos, sensores, trilhos',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELEV-0005',
    name: 'Reparo do sistema de tração',
    description: 'Correção de falhas no motor, cabos de aço ou polias',
    typeId: tElevador,
    subtypeId: stCorretivaElev,
    priorityDefault: 'Emergencial',
    estimatedHours: 8,
    materials: 'Cabos, polias, peças do motor',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELEV-0006',
    name: 'Reparo do painel de comando',
    description: 'Substituição ou reparo de botões, display e placa eletrônica',
    typeId: tElevador,
    subtypeId: stCorretivaElev,
    priorityDefault: 'Normal',
    estimatedHours: 4,
    materials: 'Botões, placa, display',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELEV-0007',
    name: 'Elevador parado / preso entre andares',
    description: 'Atendimento emergencial para elevador travado com ou sem passageiros',
    typeId: tElevador,
    subtypeId: stCorretivaElev,
    priorityDefault: 'Emergencial',
    estimatedHours: 2,
    materials: 'Conforme diagnóstico',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELEV-0008',
    name: 'Nivelamento irregular de cabine',
    description: 'Correção de desnivelamento entre cabine e andar',
    typeId: tElevador,
    subtypeId: stCorretivaElev,
    priorityDefault: 'Alta',
    estimatedHours: 3,
    materials: 'Sensores, encoder',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Elevador > Modernização
  {
    code: 'ELEV-0009',
    name: 'Modernização de painel de comando',
    description: 'Substituição do quadro de comando por tecnologia atualizada',
    typeId: tElevador,
    subtypeId: stModernizacaoElev,
    priorityDefault: 'Normal',
    estimatedHours: 16,
    materials: 'Quadro de comando, fiação',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    code: 'ELEV-0010',
    name: 'Substituição de cabos de aço',
    description: 'Troca completa dos cabos de tração do elevador',
    typeId: tElevador,
    subtypeId: stModernizacaoElev,
    priorityDefault: 'Alta',
    estimatedHours: 12,
    materials: 'Cabos de aço, grampos',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Elevador > Instalação e Montagem
  {
    code: 'ELEV-0011',
    name: 'Instalação de novo elevador',
    description: 'Montagem e instalação completa de elevador novo',
    typeId: tElevador,
    subtypeId: stInstalacaoElev,
    priorityDefault: 'Normal',
    estimatedHours: 160,
    materials: 'Elevador completo, materiais de fixação',
    procedure: '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]);

// -------------------------------------------------------
// 5. Usuários
// -------------------------------------------------------
print('--- Criando usuários ---');
db.users.insertMany([
  // Admin
  {
    username: 'admin',
    name: 'Administrador do Sistema',
    email: 'admin@empresa.gov.br',
    passwordHash: HASH_123456,
    role: 'Admin',
    unitId: unitTI,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Preposto (gestor)
  {
    username: 'preposto',
    name: 'Preposto',
    email: 'preposto@empresa.gov.br',
    passwordHash: HASH_123456,
    role: 'Preposto',
    unitId: unitDiretoria,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Técnicos
  {
    username: 'tecnico',
    name: 'Técnico 01',
    email: 'tecnico@empresa.gov.br',
    passwordHash: HASH_123456,
    role: 'Técnico',
    unitId: unitTI,
    specialties: [tPredial, tAC],
    maxAssignedTickets: 5,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  // Solicitantes
  {
    username: 'solicitante',
    name: 'Solicitante',
    email: 'solicitante@empresa.gov.br',
    passwordHash: HASH_123456,
    role: 'Solicitante',
    unitId: unitRH,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]);

// -------------------------------------------------------
// 6. SLA Configs
// -------------------------------------------------------
print('--- Criando configurações de SLA ---');
db.sla_configs.insertMany([
  {
    priority: 'BAIXA',
    responseTargetMinutes: 480,
    resolutionTargetMinutes: 2880,
    businessHoursOnly: true,
    isActive: true,
    version: '1.0',
    createdAt: now,
    updatedAt: now,
  },
  {
    priority: 'NORMAL',
    responseTargetMinutes: 240,
    resolutionTargetMinutes: 1440,
    businessHoursOnly: true,
    isActive: true,
    version: '1.0',
    createdAt: now,
    updatedAt: now,
  },
  {
    priority: 'ALTA',
    responseTargetMinutes: 120,
    resolutionTargetMinutes: 480,
    businessHoursOnly: true,
    isActive: true,
    version: '1.0',
    createdAt: now,
    updatedAt: now,
  },
  {
    priority: 'EMERGENCIAL',
    responseTargetMinutes: 30,
    resolutionTargetMinutes: 120,
    businessHoursOnly: false,
    isActive: true,
    version: '1.0',
    createdAt: now,
    updatedAt: now,
  },
]);

// -------------------------------------------------------
// 7. Calendário Comercial (Expediente)
// -------------------------------------------------------
print('--- Criando calendário comercial ---');
db.business_calendar.insertOne({
  timezone: 'America/Belem',
  workdayStart: '08:00',
  workdayEnd: '18:00',
  weekdays: [1, 2, 3, 4, 5],
  createdAt: now,
  updatedAt: now,
});

// -------------------------------------------------------
// 8. Feriados 2026
// -------------------------------------------------------
print('--- Criando feriados 2026 ---');
db.holidays.insertMany([
  {
    date: '2026-01-01',
    name: 'Confraternização Universal',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-02-16',
    name: 'Carnaval',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-02-17',
    name: 'Carnaval',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-04-03',
    name: 'Sexta-feira Santa',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-04-21',
    name: 'Tiradentes',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-05-01',
    name: 'Dia do Trabalho',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-06-04',
    name: 'Corpus Christi',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-09-07',
    name: 'Independência do Brasil',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-10-12',
    name: 'Nossa Senhora Aparecida',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-11-02',
    name: 'Finados',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-11-15',
    name: 'Proclamação da República',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    date: '2026-12-25',
    name: 'Natal',
    scope: 'NACIONAL',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
]);

print('');
print('=== SEED CONCLUÍDO ===');
print('');
print('Tipos de Serviço:');
print(
  '  Manutenção Predial — subtipos: Elétrica, Hidráulica, Civil, Marcenaria, TI e Infraestrutura',
);
print('  Ar-Condicionado    — subtipos: Manutenção Preventiva, Manutenção Corretiva, Instalação');
print(
  '  Elevador           — subtipos: Manutenção Preventiva, Manutenção Corretiva, Modernização, Instalação e Montagem',
);
print('');
print('Usuários criados (senha: 123456 para todos):');
print('  admin         - Admin');
print('  preposto01    - Preposto (gestor)');
print('  tecnico01     - Técnico (Predial + AC)');
print('  tecnico02     - Técnico (Predial)');
print('  tecnico03     - Técnico (Ar-Condicionado)');
print('  solicitante01 - Solicitante (RH)');
print('  solicitante02 - Solicitante (Financeiro)');
print('');
