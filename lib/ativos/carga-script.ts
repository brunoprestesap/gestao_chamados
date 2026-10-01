/**
 * Escreve o script mongosh da carga do Tier A (spec 0011, AC-8 e AC-9).
 *
 * O mongosh não aplica timestamps nem defaults do Mongoose, então todo campo
 * com padrão vai explícito no `$setOnInsert`. Tudo é upsert com
 * `$setOnInsert` (categoria por `chave`, ativo por `codigo`, histórico por
 * `{ ativoId, acao: 'cadastro' }`): rodar de novo não cria nem altera nada, e
 * uma execução que caiu no meio é completada pela seguinte.
 */
import {
  COLECOES_ATIVOS,
  CONTADOR_ATIVO_MNT,
  type Criticidade,
} from '../../shared/ativos/ativo.constants';
import { type AtivoCarga, CATEGORIAS_CARGA } from './carga';

const CAMPOS_DATA = ['dataTombo', 'garantiaInicio', 'garantiaFim'] as const;

/** Datas viram texto ISO; o script converte de volta com `new Date`. */
function serializarAtivo(a: AtivoCarga) {
  const campos: Record<string, unknown> = { ...a.camposPatrimoniais };
  for (const k of CAMPOS_DATA) {
    const v = a.camposPatrimoniais[k];
    if (v) campos[k] = v.toISOString();
  }
  return { ...a, camposPatrimoniais: campos };
}

export function gerarScriptCarga(
  ativos: readonly AtivoCarga[],
  categorias: readonly {
    chave: string;
    nome: string;
    criticidadePadrao: Criticidade;
  }[] = CATEGORIAS_CARGA,
  geradoEm: Date = new Date(),
): string {
  const c = COLECOES_ATIVOS;
  return `// Carga do Tier A (spec 0011). Gerado por scripts/gerar-carga-ativos.ts em ${geradoEm.toISOString()}.
// NÃO VERSIONAR: tem nome e matrícula de responsáveis (LGPD).
// Uso: docker exec -i severino-mongodb-1 mongosh manutencao < scripts/carga-ativos.generated.js
const agora = new Date();
const CATEGORIAS = ${JSON.stringify(categorias, null, 2)};
const ATIVOS = ${JSON.stringify(ativos.map(serializarAtivo))};
const CAMPOS_DATA = ${JSON.stringify(CAMPOS_DATA)};

let categoriasCriadas = 0;
for (const cat of CATEGORIAS) {
  const r = db.getCollection('${c.categorias}').updateOne(
    { chave: cat.chave },
    {
      $setOnInsert: {
        chave: cat.chave,
        nome: cat.nome,
        criticidadePadrao: cat.criticidadePadrao,
        serviceSubTypeId: null,
        periodicidadePreventivaDias: null,
        exigeDocumento: [],
        vidaUtilAnos: null,
        isActive: true,
        createdAt: agora,
        updatedAt: agora,
      },
    },
    { upsert: true },
  );
  if (r.upsertedCount) categoriasCriadas++;
}

// Lê do banco depois do upsert: categoria que já existia mantém o que o Admin ajustou.
const categoriaPorChave = {};
for (const cat of CATEGORIAS) {
  categoriaPorChave[cat.chave] = db
    .getCollection('${c.categorias}')
    .findOne({ chave: cat.chave }, { _id: 1, criticidadePadrao: 1 });
}

const rc = db.getCollection('${c.contadores}').updateOne(
  { _id: '${CONTADOR_ATIVO_MNT}' },
  { $setOnInsert: { seq: 0 } },
  { upsert: true },
);
const contadorCriado = rc.upsertedCount;

let ativosCriados = 0;
let historicosCriados = 0;
for (const a of ATIVOS) {
  const cat = categoriaPorChave[a.categoriaChave];
  const patrimoniais = Object.assign({}, a.camposPatrimoniais, { importadoEm: agora });
  for (const k of CAMPOS_DATA) {
    if (patrimoniais[k]) patrimoniais[k] = new Date(patrimoniais[k]);
  }
  const r = db.getCollection('${c.ativos}').updateOne(
    { codigo: a.codigo },
    {
      $setOnInsert: {
        codigo: a.codigo,
        origemCodigo: a.origemCodigo,
        tombamento: a.tombamento,
        descricao: a.descricao,
        categoriaId: cat._id,
        localizacaoId: null,
        fabricante: null,
        modelo: null,
        numeroSerie: a.numeroSerie || null,
        dataInstalacao: null,
        criticidade: cat.criticidadePadrao,
        tierManutencao: a.tierManutencao,
        status: 'em_operacao',
        statusCadastro: 'importado',
        validadoPor: null,
        validadoEm: null,
        camposPatrimoniais: patrimoniais,
        createdAt: agora,
        updatedAt: agora,
      },
    },
    { upsert: true },
  );
  if (r.upsertedCount) ativosCriados++;

  const ativo = db.getCollection('${c.ativos}').findOne({ codigo: a.codigo }, { _id: 1 });
  const h = db.getCollection('${c.historico}').updateOne(
    { ativoId: ativo._id, acao: 'cadastro' },
    {
      $setOnInsert: {
        ativoId: ativo._id,
        acao: 'cadastro',
        actorType: 'sistema',
        autorId: null,
        de: null,
        para: null,
        observacao: 'Carga do Tier A vinda do SICAM',
        createdAt: agora,
      },
    },
    { upsert: true },
  );
  if (h.upsertedCount) historicosCriados++;
}

print('Categorias criadas: ' + categoriasCriadas + ' de ' + CATEGORIAS.length);
print('Contador ${CONTADOR_ATIVO_MNT} criado: ' + (contadorCriado ? 'sim' : 'não (já existia)'));
print('Ativos criados: ' + ativosCriados + ' de ' + ATIVOS.length);
print('Históricos de cadastro criados: ' + historicosCriados);
`;
}
