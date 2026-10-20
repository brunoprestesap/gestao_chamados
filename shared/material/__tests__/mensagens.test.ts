import { describe, expect, it } from 'vitest';

import {
  MOTIVOS_FIXOS,
  SITUACOES_COTACAO,
  TAXA_ADMINISTRACAO_MATERIAL,
} from '../material.constants';
import {
  CODIGOS_ADVERTENCIA_PRECO,
  CODIGOS_CONTROLE,
  CONTROLES,
  erroColunasFaltando,
  erroInsumoEquivaleAVarios,
  ROTULO_SITUACAO,
  TEXTO_MOTIVO_FIXO,
  textoDoMotivo,
  textoMarcaAnomalia,
  tituloAvisoCotacao,
} from '../mensagens';

/**
 * O mapa único de textos da cotação de material (spec 0019).
 *
 * covers: AC-15 (o que a contratada vê), AC-16 (aviso sem valor), AC-20 (taxa zero)
 */

describe('tituloAvisoCotacao (AC-16)', () => {
  it.each(SITUACOES_COTACAO)('o aviso de %s cita o número e nunca leva valor', (situacao) => {
    const titulo = tituloAvisoCotacao('COT-2026-0001', situacao);
    expect(titulo).toContain('COT-2026-0001');
    expect(titulo).not.toMatch(/R\$|\d+,\d{2}/);
  });
});

describe('textoDoMotivo', () => {
  it('código fixo vira frase', () => {
    expect(textoDoMotivo('chamado_cancelado')).toBe('O chamado foi cancelado');
  });

  it('texto livre volta como veio', () => {
    expect(textoDoMotivo('Preço fora do mercado')).toBe('Preço fora do mercado');
  });

  it('vazio vira null', () => {
    expect(textoDoMotivo(null)).toBeNull();
    expect(textoDoMotivo('')).toBeNull();
  });

  it('todo motivo fixo tem frase', () => {
    for (const m of MOTIVOS_FIXOS) expect(TEXTO_MOTIVO_FIXO[m]).toBeTruthy();
  });
});

describe('CONTROLES (AC-15)', () => {
  it('todo código tem tipo, quem vê e texto', () => {
    for (const c of CODIGOS_CONTROLE) {
      expect(CONTROLES[c].texto).toBeTruthy();
      expect(['impedimento', 'advertencia']).toContain(CONTROLES[c].tipo);
    }
  });

  it('saldo, competência e divergência ficam só com o lado TRF1', () => {
    for (const c of [
      'saldo_insuficiente',
      'competencia_insuficiente',
      'divergencia_execucao',
    ] as const) {
      expect(CONTROLES[c].ve).toBe('trf1');
    }
  });

  it('o impedimento "acima do autorizado" aparece para todos, sem valor', () => {
    expect(CONTROLES.execucao_acima_autorizado.ve).toBe('todos');
    expect(CONTROLES.execucao_acima_autorizado.texto).not.toMatch(/R\$|\d/);
  });
});

describe('constantes', () => {
  it('a taxa de administração sobre material é zero (AC-20)', () => {
    expect(TAXA_ADMINISTRACAO_MATERIAL).toBe(0);
  });

  it('toda situação tem rótulo', () => {
    for (const s of SITUACOES_COTACAO) expect(ROTULO_SITUACAO[s]).toBeTruthy();
  });
});

describe('textos da fatia 3 (AC-15, AC-26, AC-28, AC-29)', () => {
  it('as advertências de preço, a base e a conferência ficam só com o lado TRF1', () => {
    for (const c of [
      'base_nao_escolhida',
      'conferencia_pendente',
      'anexo_v_acima_sinapi',
      'sem_referencia_sinapi',
    ] as const) {
      expect(CONTROLES[c].ve).toBe('trf1');
    }
  });

  it('a classificação desatualizada aparece para a contratada, que é quem classifica', () => {
    expect(CONTROLES.classificacao_desatualizada).toMatchObject({
      tipo: 'impedimento',
      ve: 'todos',
    });
  });

  it('as advertências de preço são exatamente as recalculadas a cada transição', () => {
    expect([...CODIGOS_ADVERTENCIA_PRECO].sort()).toEqual([
      'anexo_v_acima_sinapi',
      'sem_referencia_sinapi',
    ]);
  });

  it('a recusa do insumo equivalente cita os números em ordem', () => {
    expect(erroInsumoEquivaleAVarios([5, 4])).toBe(
      'Este insumo equivale aos itens 4 e 5 do Anexo V; escolha um deles.',
    );
    expect(erroInsumoEquivaleAVarios([9, 2, 5])).toContain('itens 2, 5 e 9');
  });

  it('a recusa do cabeçalho diz a coluna no singular ou no plural', () => {
    expect(erroColunasFaltando(['PRECO'])).toBe('Falta a coluna PRECO no cabeçalho.');
    expect(erroColunasFaltando(['UNIDADE', 'PRECO'])).toBe(
      'Faltam as colunas UNIDADE, PRECO no cabeçalho.',
    );
  });

  it('a marca de anomalia diz de onde veio, e nada quando não há marca', () => {
    expect(textoMarcaAnomalia({ automatica: true, manual: false })).toBe(
      'acima do SINAPI além do percentual',
    );
    expect(textoMarcaAnomalia({ automatica: false, manual: true })).toBe('marcado pelo Admin');
    expect(textoMarcaAnomalia({ automatica: true, manual: true })).toBe(
      'acima do SINAPI e marcado pelo Admin',
    );
    expect(textoMarcaAnomalia({ automatica: false, manual: false })).toBeNull();
  });
});
