import { describe, expect, it } from 'vitest';

import { MAX_ERROS_LISTADOS } from '@/shared/material/material.constants';

import {
  decodificarCsv,
  lerCsvAnexoV,
  lerCsvSinapi,
  lerRegistros,
  normalizarNomeColuna,
} from '../csv';

/**
 * A leitura do CSV do Anexo V e do SINAPI (spec 0019, fatia 3, _Leitura do
 * CSV_): layout próprio e fixo, `;` como separador, aspas, cabeçalho
 * procurado nas 20 primeiras linhas, UTF-8 ou Windows-1252, e qualquer linha
 * inválida recusa o arquivo inteiro.
 *
 * covers: AC-24, AC-25
 */

const utf8 = (t: string) => new TextEncoder().encode(t);
/** Windows-1252: os acentos do português cabem num byte (Latin-1). */
const cp1252 = (t: string) => Uint8Array.from(t, (c) => c.charCodeAt(0));

const CAB_ANEXO = 'ITEM;DESCRICAO;UNIDADE;QUANTIDADE;PRECO;CODIGO_SINAPI';
const CAB_SINAPI = 'CODIGO;DESCRICAO;UNIDADE;PRECO';

function anexo(...linhas: string[]) {
  return lerCsvAnexoV(utf8([CAB_ANEXO, ...linhas].join('\n')));
}
function sinapi(...linhas: string[]) {
  return lerCsvSinapi(utf8([CAB_SINAPI, ...linhas].join('\n')));
}

describe('decodificarCsv', () => {
  it('lê UTF-8 e tira o BOM', () => {
    expect(decodificarCsv(utf8('﻿Lâmpada'))).toBe('Lâmpada');
  });

  it('cai para Windows-1252 quando o arquivo não é UTF-8 válido', () => {
    expect(decodificarCsv(cp1252('Lâmpada; flexível'))).toBe('Lâmpada; flexível');
  });
});

describe('lerRegistros', () => {
  it('divide por ; e por quebra de linha, com \\r\\n ou \\n', () => {
    expect(lerRegistros('a;b\r\nc;d\ne;f')).toEqual([
      { linha: 1, campos: ['a', 'b'] },
      { linha: 2, campos: ['c', 'd'] },
      { linha: 3, campos: ['e', 'f'] },
    ]);
  });

  it('mantém ; e aspas dobradas dentro de campo entre aspas', () => {
    expect(lerRegistros('"Cabo; 2,5 ""mm""";m')).toEqual([
      { linha: 1, campos: ['Cabo; 2,5 "mm"', 'm'] },
    ]);
  });

  it('aceita quebra de linha dentro das aspas e conta a linha onde o registro começa', () => {
    const r = lerRegistros('x;"linha1\nlinha2"\ny;z');
    expect(r).toEqual([
      { linha: 1, campos: ['x', 'linha1\nlinha2'] },
      { linha: 3, campos: ['y', 'z'] },
    ]);
  });

  it('trata aspa no meio do campo como texto comum', () => {
    expect(lerRegistros('Tubo 3/4";un')).toEqual([{ linha: 1, campos: ['Tubo 3/4"', 'un'] }]);
  });
});

describe('normalizarNomeColuna', () => {
  it('ignora maiúscula, acento e espaços nas pontas', () => {
    expect(normalizarNomeColuna('  Descrição ')).toBe('DESCRICAO');
    expect(normalizarNomeColuna('código')).toBe('CODIGO');
  });
});

describe('lerCsvAnexoV (AC-24)', () => {
  it('lê as linhas válidas com preço em centavos e código normalizado', () => {
    const r = anexo('1;Cabo flexível;m;1.000,5;R$ 1.234,56;00.123', '2;Disjuntor;un;10;52;');
    expect(r).toEqual({
      ok: true,
      linhas: [
        {
          numero: 1,
          descricao: 'Cabo flexível',
          unidade: 'm',
          quantidadeEstimada: 1000.5,
          precoPactuadoCentavos: 123456,
          sinapiCodigo: '123',
        },
        {
          numero: 2,
          descricao: 'Disjuntor',
          unidade: 'un',
          quantidadeEstimada: 10,
          precoPactuadoCentavos: 5200,
          sinapiCodigo: null,
        },
      ],
    });
  });

  it('aceita o arquivo sem a coluna opcional CODIGO_SINAPI', () => {
    const r = lerCsvAnexoV(utf8('ITEM;DESCRICAO;UNIDADE;QUANTIDADE;PRECO\n1;x;un;1;1,00'));
    expect(r).toMatchObject({ ok: true, linhas: [{ numero: 1, sinapiCodigo: null }] });
  });

  it('acha o cabeçalho depois de linhas de título e ignora colunas a mais', () => {
    const texto = [
      'Anexo V do contrato;;',
      '',
      `OBS;${CAB_ANEXO};SOBRA`,
      'x;1;Cabo;m;1;2,00;;y',
    ].join('\n');
    expect(lerCsvAnexoV(utf8(texto))).toMatchObject({
      ok: true,
      linhas: [{ numero: 1, descricao: 'Cabo', precoPactuadoCentavos: 200 }],
    });
  });

  it('não acha cabeçalho depois da linha 20', () => {
    const texto = [...Array<string>(20).fill('lixo;lixo'), CAB_ANEXO, '1;x;un;1;1,00'].join('\n');
    expect(lerCsvAnexoV(utf8(texto))).toMatchObject({ ok: false });
  });

  it('recusa sem cabeçalho e diz a coluna que faltou, contada na linha mais parecida', () => {
    const r = lerCsvAnexoV(utf8('ITEM;DESCRICAO;UNIDADE;QUANTIDADE\n1;x;un;1'));
    expect(r).toEqual({
      ok: false,
      error: 'Falta a coluna PRECO no cabeçalho.',
      colunasFaltando: ['PRECO'],
    });
  });

  it('pula linhas vazias depois do cabeçalho', () => {
    const r = anexo('', '1;x;un;1;1,00', ';;;;;', '');
    expect(r).toMatchObject({ ok: true, linhas: [{ numero: 1 }] });
  });

  it.each([
    ['ITEM repetido', ['1;a;un;1;1,00;', '1;b;un;1;1,00;'], 'ITEM 1 repetido no arquivo'],
    ['ITEM fora de 1 a 200', ['201;a;un;1;1,00;'], 'ITEM fora de 1 a 200 (201)'],
    ['ITEM não numérico', ['A1;a;un;1;1,00;'], 'ITEM inválido (A1)'],
    ['preço com 3 casas', ['1;a;un;1;1,234;'], 'preço com mais de 2 casas decimais (1,234)'],
    ['preço zero', ['1;a;un;1;0,00;'], 'preço precisa ser maior que zero'],
    ['preço com texto', ['1;a;un;1;abc;'], 'preço inválido (abc)'],
    ['descrição vazia', ['1; ;un;1;1,00;'], 'descrição vazia'],
    [
      'unidade longa demais',
      [`1;a;${'u'.repeat(21)};1;1,00;`],
      'unidade com mais de 20 caracteres',
    ],
    [
      'quantidade com 4 casas',
      ['1;a;un;1,2345;1,00;'],
      'quantidade inválida ou com mais de 3 casas',
    ],
    ['código com letra', ['1;a;un;1;1,00;12A'], 'CODIGO_SINAPI inválido (12A)'],
  ])('recusa o arquivo inteiro por %s, com o número da linha', (_caso, linhas, motivo) => {
    const r = anexo(...linhas);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const ultima = r.linhas!.at(-1)!;
    expect(ultima.linha).toBe(linhas.length + 1);
    expect(ultima.motivo).toContain(motivo);
  });

  it('lista no máximo 20 linhas inválidas, mas conta todas na mensagem', () => {
    const ruins = Array.from({ length: 25 }, (_, i) => `${i + 1};a;un;1;0,00;`);
    const r = anexo(...ruins);
    expect(r).toMatchObject({
      ok: false,
      error: '25 linhas do arquivo são inválidas; nada foi gravado.',
    });
    if (!r.ok) expect(r.linhas).toHaveLength(MAX_ERROS_LISTADOS);
  });

  it('recusa o arquivo vazio e o que só tem cabeçalho', () => {
    expect(lerCsvAnexoV(utf8(' \n\n'))).toEqual({ ok: false, error: 'O arquivo está vazio.' });
    expect(anexo()).toEqual({
      ok: false,
      error: 'O arquivo não tem nenhuma linha depois do cabeçalho.',
    });
  });
});

describe('lerCsvSinapi (AC-25)', () => {
  it('lê a planilha convertida em Windows-1252 com cabeçalho na linha 3', () => {
    const texto = [
      'Planilha da Caixa;;',
      '',
      'Código;Descrição;Unidade;PRECO;SOBRA',
      '00100;"Cabo; flexível";m;100,00;x',
    ].join('\r\n');
    expect(lerCsvSinapi(cp1252(texto))).toEqual({
      ok: true,
      linhas: [{ codigo: '100', descricao: 'Cabo; flexível', unidade: 'm', precoCentavos: 10000 }],
    });
  });

  it('recusa CODIGO repetido depois de normalizado', () => {
    const r = sinapi('100;a;un;1,00', '0100;b;un;1,00');
    expect(r).toMatchObject({
      ok: false,
      linhas: [{ linha: 3, motivo: 'CODIGO 100 repetido no arquivo' }],
    });
  });

  it('recusa CODIGO vazio ou só com zeros', () => {
    expect(sinapi(';a;un;1,00')).toMatchObject({
      ok: false,
      linhas: [{ motivo: 'CODIGO inválido (vazio)' }],
    });
    expect(sinapi('000;a;un;1,00')).toMatchObject({
      ok: false,
      linhas: [{ motivo: 'CODIGO inválido (000)' }],
    });
  });

  it('diz todas as colunas obrigatórias que faltam', () => {
    expect(lerCsvSinapi(utf8('CODIGO;DESCRICAO\n1;a'))).toMatchObject({
      ok: false,
      colunasFaltando: ['UNIDADE', 'PRECO'],
      error: 'Faltam as colunas UNIDADE, PRECO no cabeçalho.',
    });
  });

  it('recusa o arquivo acima de 20.000 linhas', () => {
    const linhas = Array.from({ length: 20_001 }, (_, i) => `${i + 1};a;un;1,00`);
    expect(sinapi(...linhas)).toEqual({ ok: false, error: 'O arquivo passa de 20.000 linhas.' });
  });

  it('aceita exatamente 20.000 linhas', () => {
    const linhas = Array.from({ length: 20_000 }, (_, i) => `${i + 1};a;un;1,00`);
    const r = sinapi(...linhas);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.linhas).toHaveLength(20_000);
  });
});
