import { readdirSync } from 'node:fs';
import path from 'node:path';

import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';

import { ehPlataforma, usaPluginOrgao } from '@/lib/orgaos/plugin';

/**
 * Varredura dos modelos (spec 0025, AC-14): todo modelo de `models/` usa o
 * `pluginOrgao` ou está marcado como de plataforma (`marcarPlataforma`).
 * Modelo novo sem um dos dois quebra este teste antes de virar vazamento.
 */

const PASTA_MODELOS = path.resolve(__dirname, '../../../models');

/** Hoje só `Orgao`. A spec 40 acrescenta a trilha do Gestor da plataforma. */
const PLATAFORMA_ESPERADA = ['Orgao'];

function arquivosDeModelo(): string[] {
  return readdirSync(PASTA_MODELOS)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_') && !f.endsWith('.test.ts'))
    .sort();
}

describe('varredura dos modelos de órgão (AC-14)', () => {
  beforeAll(async () => {
    for (const arquivo of arquivosDeModelo()) {
      await import(path.join(PASTA_MODELOS, arquivo));
    }
  });

  it('todo arquivo de models/ registra pelo menos um modelo', () => {
    // Arrange / Act
    const nomes = mongoose.modelNames();

    // Assert: um arquivo que não registra modelo não é coberto pela varredura.
    expect(nomes.length).toBeGreaterThanOrEqual(arquivosDeModelo().length);
  });

  it('todo modelo usa pluginOrgao ou é de plataforma', () => {
    // Arrange
    const semMarca: string[] = [];

    // Act
    for (const nome of mongoose.modelNames()) {
      const schema = mongoose.model(nome).schema;
      if (!usaPluginOrgao(schema) && !ehPlataforma(schema)) semMarca.push(nome);
    }

    // Assert
    expect(
      semMarca,
      `modelos sem pluginOrgao nem marcarPlataforma: ${semMarca.join(', ')}`,
    ).toEqual([]);
  });

  it('só os modelos esperados são de plataforma, e nenhum tem os dois', () => {
    // Arrange / Act
    const plataforma = mongoose.modelNames().filter((n) => ehPlataforma(mongoose.model(n).schema));
    const ambos = mongoose
      .modelNames()
      .filter(
        (n) => ehPlataforma(mongoose.model(n).schema) && usaPluginOrgao(mongoose.model(n).schema),
      );

    // Assert
    expect(plataforma.sort()).toEqual(PLATAFORMA_ESPERADA);
    expect(ambos).toEqual([]);
  });

  it('todo modelo de órgão tem o campo orgaoId com índice', () => {
    // Arrange
    const problemas: string[] = [];

    // Act
    for (const nome of mongoose.modelNames()) {
      const schema = mongoose.model(nome).schema;
      if (!usaPluginOrgao(schema)) continue;
      const temCampo = schema.path('orgaoId') !== undefined;
      const temIndice = schema
        .indexes()
        .some(
          ([campos]: [Record<string, unknown>, unknown]) => Object.keys(campos)[0] === 'orgaoId',
        );
      if (!temCampo || !temIndice) problemas.push(nome);
    }

    // Assert
    expect(problemas).toEqual([]);
  });
});
