import { describe, expect, it } from 'vitest';

import { MAX_LINHAS_REVISAO_POR_GRUPO } from '@/shared/material/material.constants';

import { marcaAutomatica } from '../anomalia';
import type { LinhaAnexoV, LinhaSinapi } from '../csv';
import { codigoDaVersaoNova, revisarAnexoV, revisarSinapi } from '../revisao';

/**
 * A revisão antes de aplicar (AC-24, AC-25) e a marca automática da lista de
 * conferência (AC-29), as duas puras.
 *
 * covers: AC-24, AC-25, AC-29
 */

function linhaAnexo(numero: number, over: Partial<LinhaAnexoV> = {}): LinhaAnexoV {
  return {
    numero,
    descricao: `Item ${numero}`,
    unidade: 'un',
    quantidadeEstimada: 10,
    precoPactuadoCentavos: 1000,
    sinapiCodigo: null,
    ...over,
  };
}

function vigente(numero: number, over: Partial<LinhaAnexoV> = {}) {
  const l = linhaAnexo(numero, over);
  return {
    numero: l.numero,
    descricao: l.descricao,
    unidade: l.unidade,
    quantidadeEstimada: l.quantidadeEstimada,
    precoPactuadoCentavos: l.precoPactuadoCentavos,
    sinapiCodigo: l.sinapiCodigo,
  };
}

const insumo = (codigo: string, over: Partial<LinhaSinapi> = {}): LinhaSinapi => ({
  codigo,
  descricao: `Insumo ${codigo}`,
  unidade: 'un',
  precoCentavos: 500,
  ...over,
});

describe('codigoDaVersaoNova (decisão de 19/10)', () => {
  it('código vazio no CSV mantém o da versão anterior', () => {
    expect(codigoDaVersaoNova(null, '123')).toBe('123');
  });

  it('código preenchido no CSV vale, mesmo diferente do anterior', () => {
    expect(codigoDaVersaoNova('999', '123')).toBe('999');
  });

  it('sem código nos dois fica nulo', () => {
    expect(codigoDaVersaoNova(null, undefined)).toBeNull();
  });
});

describe('revisarAnexoV (AC-24)', () => {
  it('a primeira importação tem só novos', () => {
    const { resumo, revisao } = revisarAnexoV([linhaAnexo(2), linhaAnexo(1)], []);
    expect(resumo).toEqual({ total: 2, novos: 2, alterados: 0, removidos: 0 });
    expect(revisao.novos.map((l) => l.chave)).toEqual(['1', '2']);
  });

  it('separa novos, alterados e removidos por número', () => {
    const { resumo, revisao } = revisarAnexoV(
      [linhaAnexo(1, { precoPactuadoCentavos: 1200 }), linhaAnexo(3)],
      [vigente(1), vigente(2)],
    );
    expect(resumo).toEqual({ total: 2, novos: 1, alterados: 1, removidos: 1 });
    expect(revisao.alterados[0]).toMatchObject({
      chave: '1',
      mudancas: [{ campo: 'precoCentavos', antes: 1000, depois: 1200 }],
    });
    expect(revisao.removidos[0]).toMatchObject({ chave: '2' });
  });

  it('código vazio no CSV com código na versão anterior não conta como alteração', () => {
    const { resumo } = revisarAnexoV(
      [linhaAnexo(1, { sinapiCodigo: null })],
      [vigente(1, { sinapiCodigo: '123' })],
    );
    expect(resumo.alterados).toBe(0);
  });

  it('código diferente preenchido conta como alteração', () => {
    const { revisao } = revisarAnexoV(
      [linhaAnexo(1, { sinapiCodigo: '456' })],
      [vigente(1, { sinapiCodigo: '123' })],
    );
    expect(revisao.alterados[0]!.mudancas).toEqual([
      { campo: 'sinapiCodigo', antes: '123', depois: '456' },
    ]);
  });

  it('item igual não aparece em grupo nenhum', () => {
    const { resumo } = revisarAnexoV([linhaAnexo(1)], [vigente(1)]);
    expect(resumo).toEqual({ total: 1, novos: 0, alterados: 0, removidos: 0 });
  });
});

describe('revisarSinapi (AC-25)', () => {
  it('compara com o mês mais recente por código', () => {
    const { resumo, revisao } = revisarSinapi(
      [insumo('1', { precoCentavos: 600 }), insumo('3')],
      [insumo('1'), insumo('2')],
    );
    expect(resumo).toEqual({ total: 2, novos: 1, alterados: 1, removidos: 1 });
    expect(revisao.alterados[0]!.mudancas).toEqual([
      { campo: 'precoCentavos', antes: 500, depois: 600 },
    ]);
  });

  it('guarda até 500 linhas por grupo, mas conta todas', () => {
    const linhas = Array.from({ length: MAX_LINHAS_REVISAO_POR_GRUPO + 10 }, (_, i) =>
      insumo(String(i + 1)),
    );
    const { resumo, revisao } = revisarSinapi(linhas, []);
    expect(resumo.novos).toBe(MAX_LINHAS_REVISAO_POR_GRUPO + 10);
    expect(revisao.novos).toHaveLength(MAX_LINHAS_REVISAO_POR_GRUPO);
  });
});

describe('marcaAutomatica (AC-29)', () => {
  it('marca quando o Anexo V passa do SINAPI além do percentual', () => {
    expect(marcaAutomatica(15000, 10000, 10)).toBe(true);
  });

  it('não marca exatamente no limite, porque a regra é "além do percentual"', () => {
    expect(marcaAutomatica(1100, 1000, 10)).toBe(false);
    expect(marcaAutomatica(1101, 1000, 10)).toBe(true);
  });

  it('não marca sem preço SINAPI (sem código ou código fora do mês mais recente)', () => {
    expect(marcaAutomatica(99999, null, 10)).toBe(false);
    expect(marcaAutomatica(99999, undefined, 10)).toBe(false);
  });

  it('não marca preço abaixo do SINAPI', () => {
    expect(marcaAutomatica(800, 1000, 10)).toBe(false);
  });
});
