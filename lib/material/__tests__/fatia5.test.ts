import { describe, expect, it } from 'vitest';

import {
  ParametrosMaterialSchema,
  PeriodoRelatorioMaterialSchema,
} from '@/shared/material/cotacao.schemas';
import { CODIGOS_ADVERTENCIA_DO_ATO, CONTROLES, textoProjecao } from '@/shared/material/mensagens';
import { chaveDoMesmoItem, jaccard, palavrasDe } from '@/shared/material/valores';

import {
  haReincidencia,
  itensComConsumoAcima,
  itensComFracionamento,
  pareceComAlguma,
} from '../controles';
import { calcularProjecao, consomeParcelaRelevante } from '../projecao';
import { intervaloDoPeriodo } from '../relatorio';

/**
 * As regras puras da fatia 5 da cotação de material (spec 0019): a chave do
 * "mesmo item", fracionamento, reincidência, consumo, item parecido, a
 * projeção e os schemas dos parâmetros e do período do relatório.
 *
 * covers: AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42
 */

const DIA = 86_400_000;

describe('chave do mesmo item', () => {
  const anexo = new Map([['a1', { contratoId: 'c1', numero: 7 }]]);

  it('usa contrato e número do Anexo V, depois o código SINAPI, depois a descrição', () => {
    expect(
      chaveDoMesmoItem({ anexoVItemId: 'a1', sinapiCodigo: '99', descricao: 'x' }, anexo),
    ).toBe('anexoV:c1:7');
    expect(chaveDoMesmoItem({ sinapiCodigo: '99', descricao: 'x' }, anexo)).toBe('sinapi:99');
    expect(chaveDoMesmoItem({ descricao: '  Disjuntor   BIPOLAR ' }, anexo)).toBe(
      'desc:disjuntor bipolar',
    );
  });

  it('um item do Anexo V nunca casa com uma descrição do caminho 3', () => {
    const doAnexo = chaveDoMesmoItem({ anexoVItemId: 'a1', descricao: 'Disjuntor' }, anexo);
    const doCaminho3 = chaveDoMesmoItem({ descricao: 'Disjuntor' }, anexo);
    expect(doAnexo).not.toBe(doCaminho3);
  });
});

describe('fracionamento (AC-36)', () => {
  const limite = [1000_00];

  it('avisa quando cada parcela fica abaixo da faixa e a soma a alcança', () => {
    const atuais = [{ itemId: 'i1', chave: 'desc:disjuntor', valorCentavos: 500_00 }];
    const outras = [[{ chave: 'desc:disjuntor', valorCentavos: 600_00 }]];
    expect(itensComFracionamento(atuais, outras, limite)).toEqual(['i1']);
  });

  it('não avisa com uma parcela só, com parcela que já alcança a faixa ou soma abaixo', () => {
    const atual = [{ itemId: 'i1', chave: 'k', valorCentavos: 500_00 }];
    expect(itensComFracionamento(atual, [], limite)).toEqual([]);
    expect(
      itensComFracionamento(atual, [[{ chave: 'k', valorCentavos: 1000_00 }]], limite),
    ).toEqual([]);
    expect(itensComFracionamento(atual, [[{ chave: 'k', valorCentavos: 400_00 }]], limite)).toEqual(
      [],
    );
    expect(
      itensComFracionamento(atual, [[{ chave: 'outra', valorCentavos: 900_00 }]], limite),
    ).toEqual([]);
  });

  it('dois itens iguais na mesma cotação somam numa parcela só', () => {
    const atuais = [
      { itemId: 'i1', chave: 'k', valorCentavos: 300_00 },
      { itemId: 'i2', chave: 'k', valorCentavos: 300_00 },
    ];
    // Parcela atual = 600; com a outra de 500, soma 1100 e as duas ficam abaixo de 1000.
    expect(
      itensComFracionamento(atuais, [[{ chave: 'k', valorCentavos: 500_00 }]], limite),
    ).toEqual(['i1', 'i2']);
    // Sem a outra cotação, os dois itens sozinhos não são fracionamento.
    expect(itensComFracionamento(atuais, [], limite)).toEqual([]);
  });

  it('basta uma faixa em que a regra vale; sem faixa ativa, nada', () => {
    const atuais = [{ itemId: 'i1', chave: 'k', valorCentavos: 500_00 }];
    const outras = [[{ chave: 'k', valorCentavos: 600_00 }]];
    expect(itensComFracionamento(atuais, outras, [100_00, 1000_00])).toEqual(['i1']);
    expect(itensComFracionamento(atuais, outras, [])).toEqual([]);
  });
});

describe('reincidência (AC-37)', () => {
  it('avisa com duas outras cotações e não com uma', () => {
    expect(haReincidencia(2)).toBe(true);
    expect(haReincidencia(1)).toBe(false);
  });
});

describe('consumo acima do estimado (AC-39)', () => {
  const estimada = new Map([['anexoV:c:7', 10_000]]);

  it('soma o consumo das outras e o desta cotação e avisa antes de passar', () => {
    const consumo = new Map([['anexoV:c:7', 9_000]]);
    expect(
      itensComConsumoAcima(
        [{ itemId: 'i1', chave: 'anexoV:c:7', milesimos: 2_000 }],
        consumo,
        estimada,
      ),
    ).toEqual(['i1']);
    expect(
      itensComConsumoAcima(
        [{ itemId: 'i1', chave: 'anexoV:c:7', milesimos: 1_000 }],
        consumo,
        estimada,
      ),
    ).toEqual([]);
  });

  it('dois itens de mesma chave somam; sem estimativa vigente não avisa', () => {
    const atuais = [
      { itemId: 'i1', chave: 'anexoV:c:7', milesimos: 6_000 },
      { itemId: 'i2', chave: 'anexoV:c:7', milesimos: 5_000 },
    ];
    expect(itensComConsumoAcima(atuais, new Map(), estimada)).toEqual(['i1', 'i2']);
    expect(
      itensComConsumoAcima(
        [{ itemId: 'i1', chave: 'anexoV:c:8', milesimos: 99_000 }],
        new Map(),
        estimada,
      ),
    ).toEqual([]);
  });
});

describe('item parecido (AC-40)', () => {
  it('Jaccard sobre palavras normalizadas, sem as de até 2 letras', () => {
    expect([...palavrasDe('Cabo de cobre 2,5 mm')]).toEqual(['cabo', 'cobre']);
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it('avisa a partir de 0,6 e não abaixo', () => {
    // {disjuntor, termomagnetico, bipolar} contra {disjuntor, termomagnetico, bipolar, 40a}: 3/4.
    expect(
      pareceComAlguma('Disjuntor termomagnético bipolar', ['DISJUNTOR TERMOMAGNETICO BIPOLAR 40A']),
    ).toBe(true);
    // {lampada, led} contra {lampada, fluorescente, tubular}: 1/4.
    expect(pareceComAlguma('Lâmpada LED', ['Lâmpada fluorescente tubular'])).toBe(false);
    expect(pareceComAlguma('de', ['de'])).toBe(false);
  });
});

describe('projeção de esgotamento (AC-38)', () => {
  const agora = new Date('2026-10-20T15:00:00.000Z');

  it('com menos de 30 dias de histórico diz "histórico insuficiente"', () => {
    expect(
      calcularProjecao({ primeiroEventoEm: null, eventos: [], saldoCentavos: 1000_00, agora })
        .situacao,
    ).toBe('historico_insuficiente');
    const recente = new Date(agora.getTime() - 20 * DIA);
    expect(
      calcularProjecao({
        primeiroEventoEm: recente,
        eventos: [{ em: recente, valorCentavos: 500_00 }],
        saldoCentavos: 1000_00,
        agora,
      }).situacao,
    ).toBe('historico_insuficiente');
  });

  it('média diária pelo consumo líquido do período e data estimada pelo saldo', () => {
    const inicio = new Date(agora.getTime() - 40 * DIA);
    const p = calcularProjecao({
      primeiroEventoEm: inicio,
      eventos: [
        { em: inicio, valorCentavos: 600_00 },
        { em: new Date(agora.getTime() - 10 * DIA), valorCentavos: -200_00 },
      ],
      saldoCentavos: 1000_00,
      agora,
    });
    // 400 em 40 dias = 10 por dia; 1000 de saldo dura 100 dias.
    expect(p).toEqual({
      mediaDiariaCentavos: 10_00,
      dataEstimada: '2027-01-28',
      situacao: 'estimada',
    });
  });

  it('olha no máximo 90 dias para trás e diz "sem consumo" com média zero ou negativa', () => {
    const antigo = new Date(agora.getTime() - 200 * DIA);
    const p = calcularProjecao({
      primeiroEventoEm: antigo,
      eventos: [
        { em: antigo, valorCentavos: 900_00 },
        { em: new Date(agora.getTime() - 30 * DIA), valorCentavos: -100_00 },
      ],
      saldoCentavos: 1000_00,
      agora,
    });
    expect(p.situacao).toBe('sem_consumo');
  });

  it('a parcela relevante compara em inteiros, com o próprio limite incluído', () => {
    expect(consomeParcelaRelevante(200_00, 1000_00, 20)).toBe(true);
    expect(consomeParcelaRelevante(199_99, 1000_00, 20)).toBe(false);
    expect(consomeParcelaRelevante(1, 0, 20)).toBe(true);
  });

  it('o texto da projeção sai em reais e com a data em dd/mm/aaaa', () => {
    expect(
      textoProjecao({
        saldoCentavos: 1000_00,
        mediaDiariaCentavos: 10_00,
        dataEstimada: '2027-01-28',
        situacao: 'estimada',
      }),
    ).toMatch(/28\/01\/2027/);
    expect(
      textoProjecao({
        saldoCentavos: 0,
        mediaDiariaCentavos: null,
        dataEstimada: null,
        situacao: 'historico_insuficiente',
      }),
    ).toMatch(/histórico insuficiente/);
  });
});

describe('visibilidade dos códigos novos (AC-15)', () => {
  it('as cinco advertências da fatia 5 são só do lado TRF1 e nunca travam', () => {
    for (const c of [...CODIGOS_ADVERTENCIA_DO_ATO, 'projecao_esgotamento' as const]) {
      expect(CONTROLES[c]).toMatchObject({ tipo: 'advertencia', ve: 'trf1' });
    }
  });
});

describe('schemas da fatia 5', () => {
  const validos = {
    percentualSinapi: 10,
    janelaDias: 90,
    parcelaRelevantePercentual: 20,
    raizCnpjContratada: '03543374',
  };

  it('recusa parâmetro fora do limite (AC-42)', () => {
    expect(ParametrosMaterialSchema.safeParse(validos).success).toBe(true);
    for (const errado of [
      { percentualSinapi: 101 },
      { percentualSinapi: -1 },
      { janelaDias: 0 },
      { janelaDias: 366 },
      { parcelaRelevantePercentual: 0 },
      { parcelaRelevantePercentual: 101 },
      { raizCnpjContratada: '1234567' },
      { janelaDias: 1.5 },
    ]) {
      expect(ParametrosMaterialSchema.safeParse({ ...validos, ...errado }).success).toBe(false);
    }
  });

  it('o período do relatório vai até 366 dias, com o fim depois do início (AC-41)', () => {
    expect(
      PeriodoRelatorioMaterialSchema.safeParse({ inicio: '2026-01-01', fim: '2027-01-01' }).success,
    ).toBe(true);
    expect(
      PeriodoRelatorioMaterialSchema.safeParse({ inicio: '2026-01-01', fim: '2027-01-02' }).success,
    ).toBe(false);
    expect(
      PeriodoRelatorioMaterialSchema.safeParse({ inicio: '2026-02-01', fim: '2026-01-31' }).success,
    ).toBe(false);
    expect(
      PeriodoRelatorioMaterialSchema.safeParse({ inicio: '2026-02-31', fim: '2026-03-01' }).success,
    ).toBe(false);
  });
});

describe('período do relatório em instantes (AC-41)', () => {
  it('vai da meia noite de Belém do início à meia noite de Belém do dia seguinte ao fim', () => {
    const { de, ate } = intervaloDoPeriodo({ inicio: '2026-10-01', fim: '2026-10-31' });

    expect(de.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(ate.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('um dia só cobre as 24 horas daquele dia em Belém', () => {
    const { de, ate } = intervaloDoPeriodo({ inicio: '2026-12-31', fim: '2026-12-31' });

    expect(ate.getTime() - de.getTime()).toBe(DIA);
    expect(ate.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
});
