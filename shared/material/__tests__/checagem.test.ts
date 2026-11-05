import { describe, expect, it } from 'vitest';

import {
  almoxarifadoDoChamadoCentavos,
  disponivelDe,
  itensNaoChecados,
  mesmaUnidade,
  palavrasDaBusca,
  precoMedioCentavos,
  restanteDoItem,
  ultimaEntradaPorItem,
} from '../checagem';
import { etapasDaJornada, etapasDaTrilha, posicaoNaJornada } from '../jornada';
import { quemAgeAgora } from '../quem-age';

/**
 * As regras puras da checagem do almoxarifado (spec 0024).
 *
 * covers: AC-2, AC-8, AC-9, AC-15, AC-17, AC-21, AC-23, AC-27
 */

describe('palavrasDaBusca (AC-2)', () => {
  it('tira acento e caixa e descarta palavra vazia e curta', () => {
    expect(palavrasDaBusca('Torneira para Lavatório de PIA')).toEqual(['torneira', 'lavatorio']);
  });

  it('fica com o que tem dígito, mesmo curto', () => {
    expect(palavrasDaBusca('Cano 3/4" 20mm')).toEqual(['cano', '3/4', '20mm']);
  });

  it('no máximo 8, sem repetir', () => {
    const texto = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii aaaa';
    expect(palavrasDaBusca(texto)).toHaveLength(8);
    expect(palavrasDaBusca('fita fita FITA')).toEqual(['fita']);
  });

  it('cada palavra cabe nos 40 caracteres do serviço', () => {
    expect(palavrasDaBusca('x'.repeat(60))[0]).toHaveLength(40);
  });

  it('descrição só de palavras curtas não gera busca', () => {
    expect(palavrasDaBusca('fio de cu')).toEqual([]);
  });
});

describe('contas (AC-9, AC-23)', () => {
  it('disponível nunca fica negativo', () => {
    expect(disponivelDe(5, 2)).toBe(3);
    expect(disponivelDe(2, 5)).toBe(0);
    expect(disponivelDe(null, null)).toBe(0);
  });

  it('preço médio arredonda uma vez, e sem saldo ou valor não tem preço', () => {
    expect(precoMedioCentavos(100, 3)).toBe(3333);
    expect(precoMedioCentavos(0, 3)).toBeNull();
    expect(precoMedioCentavos(100, 0)).toBeNull();
    expect(precoMedioCentavos(null, 3)).toBeNull();
  });

  it('restante em milésimos, sem sobra de ponto flutuante', () => {
    expect(restanteDoItem(0.3, 0.1)).toBe(0.2);
    expect(restanteDoItem(1, 2)).toBe(0);
  });
});

describe('mesmaUnidade (AC-8)', () => {
  it('ignora caixa e espaços', () => {
    expect(mesmaUnidade('UN', ' un ')).toBe(true);
    expect(mesmaUnidade('M L', 'ml')).toBe(true);
    expect(mesmaUnidade('m', 'RL')).toBe(false);
  });
});

describe('itensNaoChecados (AC-17)', () => {
  const idDe = (i: { id: string }) => i.id;
  const e = (itemId: string, quantidadeLiberada: number) => ({ itemId, quantidadeLiberada });

  it('sem entrada, ou acima da liberada pela última', () => {
    const itens = [
      { id: 'a', quantidade: 5 },
      { id: 'b', quantidade: 5 },
      { id: 'c', quantidade: 5 },
    ];
    const entradas = [e('a', 5), e('b', 10), e('b', 3)];
    expect(itensNaoChecados(itens, entradas, idDe).map(idDe)).toEqual(['b', 'c']);
  });

  it('quantidade igual ou menor não reabre', () => {
    expect(itensNaoChecados([{ id: 'a', quantidade: 4 }], [e('a', 4)], idDe)).toEqual([]);
    expect(itensNaoChecados([{ id: 'a', quantidade: 3 }], [e('a', 4)], idDe)).toEqual([]);
  });

  it('a última entrada é a que vale', () => {
    expect(ultimaEntradaPorItem([e('a', 1), e('a', 2)]).get('a')?.quantidadeLiberada).toBe(2);
  });
});

describe('almoxarifadoDoChamadoCentavos (AC-21)', () => {
  const entradas = [
    { resultado: 'usar', valorCentavos: 100 },
    { resultado: 'cotar_mesmo_assim', valorCentavos: null },
    // Item rechecado depois: conta toda entrada `usar`, não só a última.
    { resultado: 'usar', valorCentavos: 50 },
  ];
  it('soma toda entrada usar, só em chamado concluído ou encerrado', () => {
    expect(almoxarifadoDoChamadoCentavos('concluído', entradas)).toBe(150);
    expect(almoxarifadoDoChamadoCentavos('encerrado', entradas)).toBe(150);
    for (const s of ['em atendimento', 'cancelado', 'recusado', undefined]) {
      expect(almoxarifadoDoChamadoCentavos(s, entradas)).toBe(0);
    }
  });
});

describe('jornada (AC-27)', () => {
  it('a etapa de checagem só aparece em cotação que passou por ela', () => {
    expect(etapasDaJornada(false)).toHaveLength(7);
    expect(etapasDaJornada(true)).toHaveLength(8);
    expect(etapasDaJornada(true)[0]).toBe('em_checagem');
  });

  it('atendida é desvio na etapa de checagem', () => {
    expect(posicaoNaJornada('atendida_almoxarifado', 'em_checagem', true)).toEqual({
      indice: 0,
      desvio: 'atendida_almoxarifado',
    });
    expect(posicaoNaJornada('rascunho', null, true).indice).toBe(1);
    expect(posicaoNaJornada('rascunho', null, false).indice).toBe(0);
  });

  it('cotação antiga continua com a devolvida na análise', () => {
    expect(posicaoNaJornada('devolvida', null, false).indice).toBe(2);
    expect(posicaoNaJornada('devolvida', null, true).indice).toBe(3);
  });

  it('a data da checagem sai da trilha', () => {
    const etapas = etapasDaTrilha(
      [
        { de: null, para: 'em_checagem', em: '2026-11-01T10:00:00.000Z' },
        { de: 'em_checagem', para: 'rascunho', em: '2026-11-02T10:00:00.000Z' },
      ],
      true,
    );
    expect(etapas.map((e) => e.situacao)).toEqual(['em_checagem', 'rascunho']);
  });
});

describe('quem age (AC-15)', () => {
  it('a checagem é do almoxarifado; sem ele, dos fiscais', () => {
    expect(quemAgeAgora('em_checagem', { fiscalAssumiu: false })?.papel).toBe('almoxarifado');
    expect(
      quemAgeAgora('em_checagem', { fiscalAssumiu: false, semAlmoxarifado: true })?.papel,
    ).toBe('fiscal');
    expect(quemAgeAgora('atendida_almoxarifado', { fiscalAssumiu: false })).toBeNull();
  });
});
