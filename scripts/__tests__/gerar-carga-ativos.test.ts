import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * O gerador da carga do Tier A como linha de comando (spec 0011, AC-8): com
 * CSV bom escreve o script e sai com 0; com categoria desconhecida sai com 1
 * sem escrever nada. Dados fictícios (o CSV real fica fora do git, LGPD).
 */

const CABECALHO =
  'codigo;origemCodigo;tombamento;descricao;tierManutencao;categoriaSugerida;codigoMaterial;numeroSerie;lotacao;setor;responsavelMatricula;responsavelNome;dataTombo;garantiaInicio;garantiaFim;valorHistorico;situacaoSicam;estadoConservacao;classificacaoSicam;fornecedor';
const linha = (codigo: string, tier: string, categoria: string) =>
  `${codigo};patrimonio;${codigo};"SPLIT; 12000";${tier};${categoria};;;LOT;SET;XX1;PESSOA FICTICIA;2020-01-01;;;100,5;;;;`;

const pasta = mkdtempSync(join(tmpdir(), 'carga-ativos-'));
const raiz = resolve(__dirname, '../..');

function rodar(csv: string, saida: string) {
  const entrada = join(pasta, `${Math.random().toString(36).slice(2)}.csv`);
  writeFileSync(entrada, csv, 'utf-8');
  try {
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/gerar-carga-ativos.ts', entrada, saida],
      { cwd: raiz, encoding: 'utf-8', stdio: 'pipe' },
    );
    return { codigo: 0, saida: out };
  } catch (e) {
    const err = e as { status: number; stderr: string };
    return { codigo: err.status, saida: err.stderr };
  }
}

afterAll(() => rmSync(pasta, { recursive: true, force: true }));

describe('scripts/gerar-carga-ativos.ts', () => {
  it('escreve o script só com o Tier A e sai com 0', { timeout: 30000 }, () => {
    const saida = join(pasta, 'ok.js');
    const r = rodar(
      [CABECALHO, linha('100', 'A', 'climatizacao'), linha('200', 'C', 'climatizacao')].join('\n'),
      saida,
    );
    expect(r.codigo).toBe(0);
    const script = readFileSync(saida, 'utf-8');
    expect(script).toContain('"codigo":"100"');
    expect(script).not.toContain('"codigo":"200"');
    expect(script).toContain('NÃO VERSIONAR');
  });

  it('com categoria desconhecida sai com 1 e não escreve o arquivo', { timeout: 30000 }, () => {
    const saida = join(pasta, 'ruim.js');
    const r = rodar([CABECALHO, linha('100', 'A', 'elevador')].join('\n'), saida);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('Carga recusada');
    expect(existsSync(saida)).toBe(false);
  });
});
