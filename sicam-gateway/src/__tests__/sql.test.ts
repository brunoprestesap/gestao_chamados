import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { paraMaterial } from '../oracle.js';
import { consultaCandidatos, consultaLote, consultaMateriais, paraBusca } from '../sql.js';

const INJECAO = "X' OR 1=1 --";

describe('as consultas só usam bind (AC-29)', () => {
  it('o texto de fora nunca entra no SQL', () => {
    for (const c of [
      consultaCandidatos([INJECAO], 10),
      consultaMateriais(INJECAO, 25),
      consultaLote([INJECAO]),
    ]) {
      assert.equal(c.sql.includes('1=1'), false);
      assert.ok(Object.values(c.binds).join(' ').includes('1=1'));
    }
  });

  it('lê só as duas tabelas permitidas', () => {
    for (const c of [
      consultaCandidatos(['torneira'], 10),
      consultaMateriais('torneira', 25),
      consultaLote(['1']),
      consultaLote([]),
    ]) {
      const tabelas = [...c.sql.matchAll(/SICAM\.(\w+)/g)].map((m) => m[1]);
      assert.ok(tabelas.length > 0);
      assert.ok(tabelas.every((t) => t === 'MATERIAL' || t === 'ALMOXARIFADO_MATERIAL'));
    }
  });

  it('um bind e um CASE por palavra, só com disponível acima de zero', () => {
    const c = consultaCandidatos(['torneira', 'lavatório'], 10);
    assert.equal(c.binds.p0, 'TORNEIRA');
    assert.equal(c.binds.p1, 'LAVATORIO');
    assert.equal(c.sql.match(/CASE WHEN/g)?.length, 2);
    assert.match(c.sql, /FG_DESUSO IS NULL/);
    assert.match(c.sql, /> 0/);
    assert.match(c.sql, /ORDER BY ACERTOS DESC, m\.CO_MAT/);
  });

  it('a busca manual inclui saldo zero e aceita o código', () => {
    const texto = consultaMateriais('torneira', 25);
    assert.equal(texto.sql.includes('> 0'), false);
    assert.equal(texto.binds.codigo, undefined);
    const codigo = consultaMateriais('3024', 25);
    assert.equal(codigo.binds.codigo, '3024');
  });

  it('escapa os curingas do LIKE e tira o acento', () => {
    assert.equal(paraBusca('50%_ação\\'), '50\\%\\_ACAO\\\\');
  });
});

describe('paraMaterial', () => {
  it('o disponível nunca fica negativo, e o valor bruto passa sem conta', () => {
    const m = paraMaterial({
      CO_MAT: '7',
      DE_MAT: 'CABO',
      CO_UNID_MEDIDA: 'RL',
      QT_SALDO_ATU: 2,
      VL_ATU: 30,
      RESERVADO: 5,
    });
    assert.equal(m.disponivel, 0);
    assert.equal(m.valorTotal, 30);
    assert.equal(m.reservado, 5);
  });
});
