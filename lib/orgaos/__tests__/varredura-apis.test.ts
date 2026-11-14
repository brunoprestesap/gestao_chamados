import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Varredura das APIs que escapam do plugin de órgão (spec 0025, AC-7 e AC-14).
 *
 * O plugin só protege o que passa pelos ganchos do Mongoose. Acesso direto à
 * coleção, estágios de agregação que leem outra coleção sem filtro, cache entre
 * requisições e os próprios `comOrgao`/`semOrgao` furam essa proteção. Cada uso
 * aqui precisa estar na lista de permitidos, com o motivo escrito; uso novo
 * quebra o teste até alguém decidir, de propósito, que ele é seguro.
 */

const RAIZ = path.resolve(__dirname, '../../..');

/** Onde a varredura procura. Testes ficam de fora. */
const ALVOS = ['app', 'lib', 'models', 'auth.ts'];

const PADROES: Record<string, RegExp> = {
  '.collection.': /\.collection\./,
  'connection.db': /connection\.db\b/,
  estimatedDocumentCount: /\bestimatedDocumentCount\b/,
  $unionWith: /\$unionWith\b/,
  $graphLookup: /\$graphLookup\b/,
  $out: /\$out\b/,
  $merge: /\$merge\b/,
  "'use cache'": /['"]use cache['"]/,
  unstable_cache: /\bunstable_cache\b/,
  'comOrgao(': /\bcomOrgao\(/,
  'semOrgao(': /\bsemOrgao\(/,
  // O gancho dos testes de banco troca a leitura da sessão: fora dos testes,
  // seria um jeito de inventar o órgão da requisição.
  definirLeitorDeSessaoParaTeste: /\bdefinirLeitorDeSessaoParaTeste\b/,
};

type Permitido = { arquivo: string; padrao: keyof typeof PADROES; motivo: string };

/**
 * A lista de permitidos. Entrar aqui é decisão de revisão: diga por que o uso
 * não deixa um órgão ver ou gravar dado de outro.
 */
const PERMITIDOS: Permitido[] = [
  // O próprio plugin nomeia o que recusa.
  ...(['$unionWith', '$graphLookup', '$out', '$merge', 'estimatedDocumentCount'] as const).map(
    (padrao) => ({
      arquivo: 'lib/orgaos/plugin.ts',
      padrao,
      motivo: 'o plugin lista os estágios e a operação que ele recusa',
    }),
  ),
  // O módulo do contexto define e reaplica os escopos.
  {
    arquivo: 'lib/orgaos/contexto.ts',
    padrao: 'comOrgao(',
    motivo: 'noContexto reaplica o órgão capturado antes de um disparo tardio (AC-13)',
  },
  {
    arquivo: 'lib/orgaos/contexto.ts',
    padrao: 'semOrgao(',
    motivo: 'noContexto reaplica o escopo sem órgão capturado antes de um disparo tardio',
  },
  {
    arquivo: 'lib/orgaos/contexto.ts',
    padrao: 'definirLeitorDeSessaoParaTeste',
    motivo: 'a definição do gancho; só tests/setup-db-orgao.ts e tests/orgao-test-env.ts o chamam',
  },
  {
    arquivo: 'lib/orgaos/cron.ts',
    padrao: 'comOrgao(',
    motivo: 'paraCadaOrgaoAtivo roda cada volta do cron no órgão da volta (AC-13)',
  },
  {
    arquivo: 'lib/orgaos/sessao.ts',
    padrao: 'semOrgao(',
    motivo: 'completar o JWT antigo lê o User pelo id antes de saber o órgão (AC-10)',
  },
  {
    arquivo: 'auth.ts',
    padrao: 'comOrgao(',
    motivo: 'o login roda no órgão 1 até a spec 41 decidir a descoberta do órgão (AC-9)',
  },
  {
    arquivo: 'lib/material/relatorio.ts',
    padrao: '.collection.',
    motivo:
      'só lê o nome da coleção para o $lookup, que junta por _id e passa pela checagem do plugin',
  },
];

function listarArquivos(alvo: string): string[] {
  const caminho = path.join(RAIZ, alvo);
  if (statSync(caminho).isFile()) return [alvo];
  const saida: string[] = [];
  for (const entrada of readdirSync(caminho, { withFileTypes: true })) {
    const relativo = path.join(alvo, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === '__tests__' || entrada.name === 'node_modules') continue;
      saida.push(...listarArquivos(relativo));
    } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      saida.push(relativo);
    }
  }
  return saida;
}

function arquivosVarridos(): string[] {
  return ALVOS.flatMap(listarArquivos)
    .map((f) => f.split(path.sep).join('/'))
    .sort();
}

type Achado = { arquivo: string; padrao: string; linha: number };

function achados(): Achado[] {
  const lista: Achado[] = [];
  for (const arquivo of arquivosVarridos()) {
    const linhas = readFileSync(path.join(RAIZ, arquivo), 'utf8').split('\n');
    linhas.forEach((texto, i) => {
      for (const [padrao, regex] of Object.entries(PADROES)) {
        if (regex.test(texto)) lista.push({ arquivo, padrao, linha: i + 1 });
      }
    });
  }
  return lista;
}

function permitido(a: { arquivo: string; padrao: string }): boolean {
  return PERMITIDOS.some((p) => p.arquivo === a.arquivo && p.padrao === a.padrao);
}

describe('varredura das APIs que escapam do plugin de órgão (AC-7, AC-14)', () => {
  it('varre os arquivos de app/, lib/, models/ e auth.ts', () => {
    // Arrange / Act
    const arquivos = arquivosVarridos();

    // Assert: uma pasta vazia por engano faria a varredura passar sem ler nada.
    expect(arquivos).toContain('auth.ts');
    expect(arquivos.some((f) => f.startsWith('app/'))).toBe(true);
    expect(arquivos.some((f) => f.startsWith('models/'))).toBe(true);
    expect(arquivos.some((f) => f.includes('__tests__/'))).toBe(false);
  });

  it('nenhum uso fora da lista de permitidos', () => {
    // Arrange / Act
    const fora = achados().filter((a) => !permitido(a));

    // Assert
    expect(
      fora.map((a) => `${a.arquivo}:${a.linha} usa ${a.padrao}`),
      'uso novo de API que escapa do plugin de órgão: confira o isolamento e, se for seguro, ' +
        'acrescente em PERMITIDOS com o motivo',
    ).toEqual([]);
  });

  it('toda entrada da lista de permitidos tem motivo e ainda é usada', () => {
    // Arrange
    const usados = achados();

    // Act
    const semMotivo = PERMITIDOS.filter((p) => !p.motivo.trim());
    const sobrando = PERMITIDOS.filter(
      (p) => !usados.some((a) => a.arquivo === p.arquivo && a.padrao === p.padrao),
    );

    // Assert: entrada velha na lista libera um uso futuro sem revisão.
    expect(semMotivo).toEqual([]);
    expect(sobrando.map((p) => `${p.arquivo} ${p.padrao}`)).toEqual([]);
  });

  it('reconhece cada padrão e não confunde $mergeObjects com $merge', () => {
    // Arrange
    const exemplos: Record<string, string> = {
      '.collection.': 'Model.collection.insertOne(x)',
      'connection.db': 'mongoose.connection.db',
      estimatedDocumentCount: 'Model.estimatedDocumentCount()',
      $unionWith: "{ $unionWith: 'x' }",
      $graphLookup: '{ $graphLookup: {} }',
      $out: "{ $out: 'x' }",
      $merge: "{ $merge: 'x' }",
      "'use cache'": "'use cache';",
      unstable_cache: 'unstable_cache(fn)',
      'comOrgao(': 'comOrgao(id, fn)',
      'semOrgao(': "semOrgao('motivo', fn)",
      definirLeitorDeSessaoParaTeste: 'definirLeitorDeSessaoParaTeste(null)',
    };

    // Act / Assert
    for (const [padrao, texto] of Object.entries(exemplos)) {
      expect(PADROES[padrao].test(texto), padrao).toBe(true);
    }
    expect(PADROES.$merge.test('{ $mergeObjects: [a, b] }')).toBe(false);
  });
});
