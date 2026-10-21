import { describe, expect, it } from 'vitest';

import { hrefFila } from '@/app/(dashboard)/cotacoes/_components/fila/endereco';

import { ETAPAS_JORNADA, posicaoNaJornada } from '../jornada';
import { SITUACOES_COTACAO } from '../material.constants';
import { textoNaEtapaHa, textoPaginaFila, textoQuantidadeItens } from '../mensagens';
import { quemAgeAgora } from '../quem-age';

/**
 * As funções puras da fila repaginada (spec 0021, fatia 1): a jornada, quem
 * age agora, os textos da linha e o endereço com os filtros.
 *
 * covers: AC-3, AC-4, AC-5
 */

describe('posicaoNaJornada', () => {
  it('cada etapa do caminho normal fica no próprio índice, sem desvio', () => {
    ETAPAS_JORNADA.forEach((etapa, i) => {
      expect(posicaoNaJornada(etapa)).toEqual({ indice: i, desvio: null });
    });
  });

  it('o desvio fica na etapa de onde a cotação saiu', () => {
    expect(posicaoNaJornada('devolvida', 'em_aprovacao')).toEqual({
      indice: 3,
      desvio: 'devolvida',
    });
    expect(posicaoNaJornada('reprovada', 'em_analise')).toEqual({
      indice: 2,
      desvio: 'reprovada',
    });
    expect(posicaoNaJornada('cancelada', 'autorizada')).toEqual({
      indice: 4,
      desvio: 'cancelada',
    });
  });

  it('sem a origem, a devolvida cai na análise e o resto no começo', () => {
    expect(posicaoNaJornada('devolvida')).toEqual({ indice: 2, desvio: 'devolvida' });
    expect(posicaoNaJornada('cancelada', 'devolvida')).toEqual({ indice: 2, desvio: 'cancelada' });
    expect(posicaoNaJornada('cancelada', null)).toEqual({ indice: 0, desvio: 'cancelada' });
  });
});

describe('quemAgeAgora', () => {
  it('cobre as 10 situações sem lançar', () => {
    for (const s of SITUACOES_COTACAO) {
      expect(() => quemAgeAgora(s, { fiscalAssumiu: false })).not.toThrow();
    }
  });

  it('em análise, a vez é do fiscal que assumiu quando há um', () => {
    expect(quemAgeAgora('em_analise', { fiscalAssumiu: true })).toEqual({
      papel: 'fiscal',
      doFiscalQueAssumiu: true,
    });
    expect(quemAgeAgora('enviada', { fiscalAssumiu: true })?.doFiscalQueAssumiu).toBe(false);
  });

  it('segue o mapa fixo por situação', () => {
    const papel = (s: (typeof SITUACOES_COTACAO)[number], nf = false) =>
      quemAgeAgora(s, { fiscalAssumiu: false, notaFiscalPendente: nf })?.papel ?? null;
    expect(papel('rascunho')).toBe('responsavel_tecnico');
    expect(papel('devolvida')).toBe('responsavel_tecnico');
    expect(papel('em_aprovacao')).toBe('aprovador');
    expect(papel('autorizada')).toBe('tecnico');
    expect(papel('executada')).toBe('gestor');
    expect(papel('atestada', true)).toBe('responsavel_tecnico');
    expect(papel('atestada')).toBeNull();
    expect(papel('reprovada')).toBeNull();
    expect(papel('cancelada')).toBeNull();
  });
});

describe('textos da fila', () => {
  it('"na etapa há" em dias corridos', () => {
    expect(textoNaEtapaHa(0)).toBe('hoje');
    expect(textoNaEtapaHa(1)).toBe('1 dia');
    expect(textoNaEtapaHa(6)).toBe('6 dias');
  });

  it('quantidade de itens no singular e no plural', () => {
    expect(textoQuantidadeItens(1)).toBe('1 item');
    expect(textoQuantidadeItens(3)).toBe('3 itens');
  });

  it('o rodapé mostra o intervalo da página', () => {
    expect(textoPaginaFila({ pagina: 2, porPagina: 25, total: 27 })).toBe('Mostrando 26–27 de 27');
    expect(textoPaginaFila({ pagina: 1, porPagina: 25, total: 0 })).toBe('Nenhuma cotação');
  });
});

describe('hrefFila', () => {
  it('guarda aba, busca, urgente e página no endereço', () => {
    expect(hrefFila({ aba: 'analise', q: '2291 a', urgente: true, pagina: 3 })).toBe(
      '/cotacoes?aba=analise&q=2291+a&urgente=1&pagina=3',
    );
  });

  it('deixa de fora a página 1 e os filtros vazios', () => {
    expect(hrefFila({ aba: 'todas', q: '', urgente: false, pagina: 1 })).toBe(
      '/cotacoes?aba=todas',
    );
  });
});
