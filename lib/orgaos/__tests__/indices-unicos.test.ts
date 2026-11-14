import { readdirSync } from 'node:fs';
import path from 'node:path';

import mongoose, { type SchemaType } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';

import { usaPluginOrgao } from '@/lib/orgaos/plugin';

/**
 * Índices únicos por órgão (spec 0025, AC-11). Todo índice único de um modelo
 * de órgão começa por `orgaoId`, salvo os da lista abaixo, cuja chave já é um
 * id de documento de órgão ou um identificador aleatório (tabela "Os outros
 * índices únicos" da spec). Índice único novo sem órgão quebra este teste.
 */

const PASTA_MODELOS = path.resolve(__dirname, '../../../models');

/** `Modelo:campo1,campo2`, na ordem do índice. Cada um com o motivo na spec. */
const UNICOS_QUE_JA_ISOLAM = new Set([
  'ServiceSubType:typeId,name',
  'DocumentoAtivo:tipo,ativoId',
  'DocumentoAtivo:tipo,localizacaoId',
  'DecisaoIa:chamadoId,campo',
  'Conversa:chamadoId',
  'Chamado:conversaId',
  'Cotacao:pauseLogId',
  'Cotacao:chamadoId',
  'CotacaoMaterial:chamadoId',
  'ChamadoInteressado:chamadoId,userId',
  'SlaEscalation:chamadoId,type',
  'ConferenciaVistoria:campanhaId,ativoId',
  'ConferenciaVistoria:clientOpId',
  'Ativo:origemOpId',
]);

/** Os modelos de `ImrFechamento`, `ImrReabertura`, `AnexoVItem` e `AnexoVVigencia` isolam pelo `contratoId`. */
const MODELOS_POR_CONTRATO = new Set([
  'ImrFechamento',
  'ImrReabertura',
  'AnexoVItem',
  'AnexoVVigencia',
]);

/** Os índices alvo da spec: `Modelo:campos depois de orgaoId`. */
const INDICES_ALVO = [
  'Chamado:ticket_number',
  'User:username',
  'Contrato:numeroNormalizado',
  'Ativo:codigo',
  'CotacaoMaterial:numero',
  'Empenho:numero',
  'ServiceType:name',
  'ServiceCatalog:code',
  'SlaConfig:priority',
  'Holiday:date,scope',
  'Localizacao:parentId,nome',
  'TipoDocumento:chave',
  'TipoDocumento:nome',
  'CategoriaAtivo:chave',
  'CategoriaAtivo:nome',
  'MaterialConfig:chave',
  'IaAutonomiaConfig:chave',
  'SinapiReferencia:referencia',
  'SinapiInsumo:referencia,codigo',
  'CampanhaVistoria:status',
  'ImportacaoPatrimonial:emAberto',
  'ImportacaoMaterial:tipo',
];

type Indice = [Record<string, unknown>, Record<string, unknown> | undefined];

function unicos(nome: string): string[][] {
  return (mongoose.model(nome).schema.indexes() as unknown as Indice[])
    .filter(([, opcoes]) => opcoes?.unique === true)
    .map(([campos]) => Object.keys(campos));
}

describe('índices únicos por órgão (AC-11)', () => {
  beforeAll(async () => {
    const arquivos = readdirSync(PASTA_MODELOS).filter(
      (f) => f.endsWith('.ts') && !f.startsWith('_') && !f.endsWith('.test.ts'),
    );
    for (const arquivo of arquivos) await import(path.join(PASTA_MODELOS, arquivo));
  });

  it('cada índice alvo da spec existe com orgaoId na frente', () => {
    // Arrange
    const faltando: string[] = [];

    // Act
    for (const alvo of INDICES_ALVO) {
      const [modelo, campos] = alvo.split(':');
      const existe = unicos(modelo).some((c) => c.join(',') === `orgaoId,${campos}`);
      if (!existe) faltando.push(alvo);
    }

    // Assert
    expect(faltando).toEqual([]);
  });

  it('nenhum índice único de modelo de órgão fica sem orgaoId, fora da lista que já isola', () => {
    // Arrange
    const semOrgao: string[] = [];

    // Act
    for (const nome of mongoose.modelNames()) {
      if (!usaPluginOrgao(mongoose.model(nome).schema)) continue;
      for (const campos of unicos(nome)) {
        if (campos[0] === 'orgaoId') continue;
        if (MODELOS_POR_CONTRATO.has(nome) && campos.includes('contratoId')) continue;
        const chave = `${nome}:${campos.join(',')}`;
        if (!UNICOS_QUE_JA_ISOLAM.has(chave)) semOrgao.push(chave);
      }
    }

    // Assert
    expect(semOrgao, `únicos sem orgaoId: ${semOrgao.join('; ')}`).toEqual([]);
  });

  it('nenhum campo de modelo de órgão declara unique no próprio path', () => {
    // Arrange: `unique: true` no campo cria um índice só daquele campo, sem órgão.
    const comUnique: string[] = [];

    // Act
    for (const nome of mongoose.modelNames()) {
      const schema = mongoose.model(nome).schema;
      if (!usaPluginOrgao(schema)) continue;
      schema.eachPath((caminho: string, tipo: SchemaType) => {
        if ((tipo.options as { unique?: unknown }).unique) comUnique.push(`${nome}.${caminho}`);
      });
    }

    // Assert
    expect(comUnique).toEqual([]);
  });

  it('a importação de material troca o nome do índice para não colidir com o antigo', () => {
    // Arrange / Act
    const indice = (
      mongoose.model('ImportacaoMaterial').schema.indexes() as unknown as Indice[]
    ).find(([campos]) => Object.keys(campos).join(',') === 'orgaoId,tipo');

    // Assert: o antigo `uma_aberta_por_tipo` segue no banco até a spec 39.
    expect(indice?.[1]).toMatchObject({
      unique: true,
      name: 'uma_aberta_por_tipo_por_orgao',
      partialFilterExpression: { emAberto: true },
    });
  });
});
