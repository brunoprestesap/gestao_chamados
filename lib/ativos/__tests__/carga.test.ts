import { describe, expect, it } from 'vitest';

import { CATEGORIAS_CARGA, ErroCarga, mapearLinha, montarCarga, parseCsv } from '../carga';
import { gerarScriptCarga } from '../carga-script';

/** Dados fictícios: o CSV de verdade tem nome e matrícula (LGPD) e fica fora do git. */
const CABECALHO =
  'codigo;origemCodigo;tombamento;descricao;tierManutencao;categoriaSugerida;codigoMaterial;numeroSerie;lotacao;setor;responsavelMatricula;responsavelNome;dataTombo;garantiaInicio;garantiaFim;valorHistorico;situacaoSicam;estadoConservacao;classificacaoSicam;fornecedor';

function linha(campos: Partial<Record<string, string>>): string {
  const base: Record<string, string> = {
    codigo: '100',
    origemCodigo: 'patrimonio',
    tombamento: '100',
    descricao: 'SPLIT 12000 BTUS',
    tierManutencao: 'A',
    categoriaSugerida: 'climatizacao',
    codigoMaterial: '',
    numeroSerie: '',
    lotacao: 'SECRETARIA FICTICIA',
    setor: 'SETOR X',
    responsavelMatricula: 'XX00001',
    responsavelNome: 'PESSOA FICTICIA',
    dataTombo: '2020-01-15',
    garantiaInicio: '',
    garantiaFim: '',
    valorHistorico: '',
    situacaoSicam: '',
    estadoConservacao: '',
    classificacaoSicam: '',
    fornecedor: '',
  };
  const v = { ...base, ...campos };
  return CABECALHO.split(';')
    .map((k) => v[k] ?? '')
    .join(';');
}

function csv(...linhas: string[]): string {
  return [CABECALHO, ...linhas].join('\r\n') + '\r\n';
}

describe('parseCsv', () => {
  it('não desalinha descrição com ";" entre aspas', () => {
    const [cab, l] = parseCsv('a;b;c\r\n1;"x; y; z";3\r\n');
    expect(cab).toEqual(['a', 'b', 'c']);
    expect(l).toEqual(['1', 'x; y; z', '3']);
  });

  it('entende aspas escapadas e quebra de linha dentro de aspas', () => {
    const [, l] = parseCsv('a;b\n"diz ""oi""";"linha 1\nlinha 2"\n');
    expect(l).toEqual(['diz "oi"', 'linha 1\nlinha 2']);
  });
});

describe('montarCarga (spec 0011, AC-8)', () => {
  it('pega só as linhas do Tier A', () => {
    const ativos = montarCarga(
      csv(
        linha({ codigo: '1', tombamento: '1' }),
        linha({ codigo: '2', tombamento: '2', tierManutencao: 'B' }),
        linha({ codigo: '3', tombamento: '3', tierManutencao: 'C' }),
      ),
    );
    expect(ativos.map((a) => a.codigo)).toEqual(['1']);
  });

  it('converte número com vírgula, data ISO e tira campo vazio', () => {
    const [a] = montarCarga(
      csv(linha({ valorHistorico: '8700,9', garantiaFim: '2023-12-29', fornecedor: '' })),
    );
    expect(a.camposPatrimoniais.valorHistorico).toBe(8700.9);
    expect(a.camposPatrimoniais.garantiaFim).toBeInstanceOf(Date);
    expect(a.camposPatrimoniais.garantiaFim?.toISOString()).toBe('2023-12-29T12:00:00.000Z');
    expect('fornecedor' in a.camposPatrimoniais).toBe(false);
    expect('garantiaInicio' in a.camposPatrimoniais).toBe(false);
  });

  it('copia o número de série para o Sigma e para os dados patrimoniais', () => {
    const [a] = montarCarga(csv(linha({ numeroSerie: 'SN-1' })));
    expect(a.numeroSerie).toBe('SN-1');
    expect(a.camposPatrimoniais.numeroSerie).toBe('SN-1');
  });

  it('normaliza o código (zeros à esquerda)', () => {
    const [a] = montarCarga(csv(linha({ codigo: '00100', tombamento: '100' })));
    expect(a.codigo).toBe('100');
    expect(a.tombamento).toBe('100');
  });

  it('falha em categoria fora das 9 conhecidas', () => {
    expect(() => montarCarga(csv(linha({ categoriaSugerida: 'elevador' })))).toThrow(ErroCarga);
  });

  it('falha quando código e tombamento não batem', () => {
    expect(() => montarCarga(csv(linha({ codigo: '100', tombamento: '101' })))).toThrow(
      /diferente do tombamento/,
    );
  });

  it('falha em linha com colunas a menos', () => {
    expect(() => montarCarga(`${CABECALHO}\r\n100;patrimonio\r\n`)).toThrow(/colunas/);
  });

  it('falha em código repetido no CSV', () => {
    expect(() => montarCarga(csv(linha({}), linha({})))).toThrow(/repetido/);
  });

  it('não olha a categoria de linha fora do Tier A', () => {
    expect(() =>
      montarCarga(csv(linha({ tierManutencao: 'C', categoriaSugerida: 'desconhecida' }))),
    ).not.toThrow();
  });
});

describe('mapearLinha', () => {
  it('recusa data fora do formato ISO', () => {
    const [, l] = parseCsv(csv(linha({ dataTombo: '15/01/2020' })));
    const registro = Object.fromEntries(CABECALHO.split(';').map((k, i) => [k, l[i]]));
    expect(() => mapearLinha(registro)).toThrow(/data inválida/);
  });
});

describe('gerarScriptCarga', () => {
  const ativos = montarCarga(csv(linha({ garantiaFim: '2023-12-29' })));
  const script = gerarScriptCarga(ativos, CATEGORIAS_CARGA, new Date('2026-10-01T00:00:00Z'));

  it('só cria: todo upsert usa $setOnInsert, nunca $set', () => {
    expect(script).toContain('$setOnInsert');
    expect(script).not.toMatch(/\$set[^O]/);
  });

  it('cria o histórico por { ativoId, acao: cadastro }, de autor sistema', () => {
    expect(script).toContain("{ ativoId: ativo._id, acao: 'cadastro' }");
    expect(script).toContain("actorType: 'sistema'");
  });

  it('põe os campos com padrão explícitos e o contador do MNT', () => {
    expect(script).toContain("statusCadastro: 'importado'");
    expect(script).toContain("status: 'em_operacao'");
    expect(script).toContain("_id: 'ativo_mnt'");
    expect(script).toContain('createdAt: agora');
  });

  it('é JavaScript válido', () => {
    expect(() => new Function('db', 'print', script)).not.toThrow();
  });
});
