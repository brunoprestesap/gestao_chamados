import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

import {
  anosCompletos,
  hojeEmBelem,
  somarAnos,
  somarMeses,
} from '@/lib/ativos/documentos/situacao';
import {
  formatarDia,
  NOTA_IDADE_NAO_AVALIADA,
  textoDoMotivo,
  textoDosCriterios,
} from '@/shared/ativos/substituicao.constants';

import {
  avaliarSubstituicao,
  type EntradaAvaliacao,
  type LinhaCandidato,
  ordenarCandidatos,
} from '../substituicao';

/**
 * A regra dos candidatos à substituição, sem banco (spec 0015): quem entra,
 * as bordas de data em Belém, os limites da categoria, a combinação e a
 * dispensa vigente.
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-12
 */

const HOJE = '2026-10-06';

function entrada(extra: {
  ativo?: Partial<EntradaAvaliacao['ativo']>;
  categoria?: Partial<EntradaAvaliacao['categoria']>;
  corretivos12m?: number;
  corretivos90d?: number;
  hoje?: string;
}): EntradaAvaliacao {
  return {
    ativo: {
      tierManutencao: 'A',
      status: 'em_operacao',
      dataInstalacao: null,
      dataTombo: null,
      dispensa: null,
      ...extra.ativo,
    },
    categoria: {
      vidaUtilAnos: 10,
      limiteCorretivos12m: null,
      limiteReincidencia90d: null,
      ...extra.categoria,
    },
    corretivos12m: extra.corretivos12m ?? 0,
    corretivos90d: extra.corretivos90d ?? 0,
    hoje: extra.hoje ?? HOJE,
  };
}

/** Meio dia em Belém do dia, como o formulário grava `dataInstalacao`. */
const dia = (ymd: string) => new Date(`${ymd}T12:00:00.000Z`);

describe('datas de calendário', () => {
  it('formatarDia escreve o dia sem passar por fuso', () => {
    expect(formatarDia('2027-04-06')).toBe('06/04/2027');
    expect(formatarDia('2028-02-29')).toBe('29/02/2028');
  });

  it('somarMeses cai no último dia do mês quando o dia não existe', () => {
    expect(somarMeses('2026-08-30', 6)).toBe('2027-02-28');
    expect(somarMeses('2027-08-31', 6)).toBe('2028-02-29');
    expect(somarMeses('2026-04-06', 6)).toBe('2026-10-06');
    expect(somarMeses('2026-10-06', 6)).toBe('2027-04-06');
  });

  it('somarAnos leva 29/02 para 28/02 no ano que não é bissexto', () => {
    expect(somarAnos('2016-02-29', 10)).toBe('2026-02-28');
    expect(somarAnos('2016-02-29', 12)).toBe('2028-02-29');
  });

  it('anosCompletos usa a mesma conta de somarAnos', () => {
    expect(anosCompletos('2012-10-06', '2026-10-06')).toBe(14);
    expect(anosCompletos('2012-10-07', '2026-10-06')).toBe(13);
    expect(anosCompletos('2016-02-29', '2026-02-28')).toBe(10);
    expect(anosCompletos('2026-10-07', '2026-10-06')).toBe(0);
  });

  it('data gravada às 21:00 de Belém conta no dia dela', () => {
    // 00:00 UTC de 07/10 é 21:00 de 06/10 em Belém.
    expect(hojeEmBelem(new Date('2026-10-07T00:00:00.000Z'))).toBe('2026-10-06');
  });
});

describe('avaliarSubstituicao: quem pode ser candidato (AC-1)', () => {
  const quebraMuito = { corretivos12m: 9, corretivos90d: 9 };

  it.each(['em_operacao', 'em_manutencao', 'inoperante'] as const)('%s entra', (status) => {
    expect(avaliarSubstituicao(entrada({ ...quebraMuito, ativo: { status } })).situacao).toBe(
      'candidato',
    );
  });

  it.each(['baixado', 'aguardando_baixa'] as const)('%s nunca aparece', (status) => {
    const r = avaliarSubstituicao(
      entrada({
        ...quebraMuito,
        ativo: {
          status,
          dispensa: {
            ate: dia('2027-01-01'),
            em: new Date(),
            motivosNaDispensa: ['corretivos'],
          },
        },
      }),
    );
    expect(r).toEqual({
      situacao: 'fora',
      motivos: [],
      idadeNaoAvaliada: null,
      dispensaVigente: false,
      dispensaGravadaAte: null,
    });
  });

  it.each(['C', 'D'] as const)('Tier %s nunca aparece', (tierManutencao) => {
    expect(
      avaliarSubstituicao(entrada({ ...quebraMuito, ativo: { tierManutencao } })).situacao,
    ).toBe('fora');
  });
});

describe('avaliarSubstituicao: idade (AC-2)', () => {
  it('aniversário da vida útil exatamente hoje bate; ontem ainda não', () => {
    const hoje = avaliarSubstituicao(entrada({ ativo: { dataInstalacao: dia('2016-10-06') } }));
    expect(hoje.motivos).toEqual([{ criterio: 'idade', anos: 10, vidaUtilAnos: 10 }]);
    expect(textoDoMotivo(hoje.motivos[0]!)).toBe('10 anos, vida útil 10');

    const amanha = avaliarSubstituicao(entrada({ ativo: { dataInstalacao: dia('2016-10-07') } }));
    expect(amanha.situacao).toBe('fora');
  });

  it('usa a data do tombo quando falta a de instalação, e prefere a de instalação', () => {
    expect(
      avaliarSubstituicao(entrada({ ativo: { dataTombo: dia('2012-01-10') } })).motivos[0],
    ).toEqual({ criterio: 'idade', anos: 14, vidaUtilAnos: 10 });
    expect(
      avaliarSubstituicao(
        entrada({ ativo: { dataTombo: dia('2012-01-10'), dataInstalacao: dia('2020-01-10') } }),
      ).situacao,
    ).toBe('fora');
  });

  it('tombo gravado à meia noite UTC conta no dia de Belém', () => {
    // 2016-10-07T00:00Z é 06/10 às 21:00 em Belém: vida útil vence hoje.
    const r = avaliarSubstituicao(
      entrada({ ativo: { dataTombo: new Date('2016-10-07T00:00:00.000Z') } }),
    );
    expect(r.situacao).toBe('candidato');
  });

  it('29/02 somado vence em 28/02', () => {
    const r = avaliarSubstituicao(
      entrada({ ativo: { dataInstalacao: dia('2016-02-29') }, hoje: '2026-02-28' }),
    );
    expect(r.motivos).toEqual([{ criterio: 'idade', anos: 10, vidaUtilAnos: 10 }]);
  });

  it('1 ano no singular', () => {
    const r = avaliarSubstituicao(
      entrada({ ativo: { dataInstalacao: dia('2025-10-06') }, categoria: { vidaUtilAnos: 1 } }),
    );
    expect(textoDoMotivo(r.motivos[0]!)).toBe('1 ano, vida útil 1');
  });

  it('sem vida útil ou sem data não bate e diz o que falta', () => {
    const semVida = avaliarSubstituicao(
      entrada({ ativo: { dataInstalacao: dia('2000-01-01') }, categoria: { vidaUtilAnos: null } }),
    );
    expect(semVida.situacao).toBe('fora');
    expect(semVida.idadeNaoAvaliada).toBe('sem_vida_util');
    expect(NOTA_IDADE_NAO_AVALIADA.sem_vida_util).toBe(
      'Idade não avaliada: a categoria não tem vida útil',
    );

    const semData = avaliarSubstituicao(entrada({ corretivos12m: 4 }));
    expect(semData.situacao).toBe('candidato');
    expect(semData.idadeNaoAvaliada).toBe('sem_data');
  });
});

describe('avaliarSubstituicao: corretivos, reincidência e limites (AC-3, AC-4, AC-6)', () => {
  it('limite padrão: 4 corretivos em 12 meses e 3 em 90 dias', () => {
    expect(avaliarSubstituicao(entrada({ corretivos12m: 3, corretivos90d: 2 })).situacao).toBe(
      'fora',
    );
    expect(avaliarSubstituicao(entrada({ corretivos12m: 4 })).motivos).toEqual([
      { criterio: 'corretivos', quantidade: 4, limite: 4 },
    ]);
    expect(avaliarSubstituicao(entrada({ corretivos90d: 3 })).motivos).toEqual([
      { criterio: 'reincidencia', quantidade: 3, limite: 3 },
    ]);
  });

  it('limite da categoria 2 bate onde o padrão 4 não bate', () => {
    expect(
      avaliarSubstituicao(entrada({ corretivos12m: 2, categoria: { limiteCorretivos12m: 2 } }))
        .situacao,
    ).toBe('candidato');
    expect(
      avaliarSubstituicao(entrada({ corretivos90d: 2, categoria: { limiteReincidencia90d: 2 } }))
        .motivos[0],
    ).toEqual({ criterio: 'reincidencia', quantidade: 2, limite: 2 });
  });

  it('1 corretivo no singular', () => {
    expect(textoDoMotivo({ criterio: 'corretivos', quantidade: 1, limite: 1 })).toBe(
      '1 corretivo em 12 meses, limite 1',
    );
  });
});

describe('combinação e ordem (AC-5)', () => {
  it('os critérios saem na ordem idade, corretivos, reincidência', () => {
    const r = avaliarSubstituicao(
      entrada({ ativo: { dataInstalacao: dia('2010-01-01') }, corretivos12m: 5, corretivos90d: 3 }),
    );
    expect(r.motivos.map((m) => m.criterio)).toEqual(['idade', 'corretivos', 'reincidencia']);
    expect(textoDosCriterios(r.motivos.map((m) => m.criterio))).toBe(
      'idade, corretivos, reincidência',
    );
  });

  it('ordena por quantidade de critérios, depois corretivos, depois código numérico', () => {
    const l = (codigo: string, n: number, corretivos12m: number): LinhaCandidato => ({
      ativoId: codigo,
      codigo,
      descricao: '',
      categoria: '',
      caminho: null,
      tipoServico: null,
      motivos: Array.from({ length: n }, () => ({
        criterio: 'idade' as const,
        anos: 1,
        vidaUtilAnos: 1,
      })),
      corretivos12m,
    });
    const ordem = ordenarCandidatos([
      l('10698', 1, 0),
      l('9003', 1, 0),
      l('500', 1, 7),
      l('MNT-0001', 2, 0),
    ]).map((x) => x.codigo);
    expect(ordem).toEqual(['MNT-0001', '500', '9003', '10698']);
  });
});

describe('dispensa vigente (AC-12)', () => {
  const dispensa = (ate: string, motivosNaDispensa: ('idade' | 'corretivos')[]) => ({
    ate: new Date(`${ate}T00:00:00.000Z`),
    em: new Date('2026-09-01T12:00:00.000Z'),
    motivosNaDispensa,
  });
  const velho = { dataInstalacao: dia('2010-01-01') };

  it('dentro do prazo e com os mesmos critérios, fica dispensado', () => {
    const r = avaliarSubstituicao(
      entrada({ ativo: { ...velho, dispensa: dispensa('2027-03-01', ['idade']) } }),
    );
    expect(r.situacao).toBe('dispensado');
    expect(r.dispensaVigente).toBe(true);
    expect(r.dispensaGravadaAte).toBe('2027-03-01');
  });

  it('um critério novo devolve o candidato no mesmo dia', () => {
    const r = avaliarSubstituicao(
      entrada({
        ativo: { ...velho, dispensa: dispensa('2027-03-01', ['idade']) },
        corretivos12m: 5,
      }),
    );
    expect(r.situacao).toBe('candidato');
    expect(r.dispensaVigente).toBe(false);
    expect(r.dispensaGravadaAte).toBe('2027-03-01');
  });

  it('mais corretivos no mesmo critério não devolvem', () => {
    const r = avaliarSubstituicao(
      entrada({ ativo: { dispensa: dispensa('2027-03-01', ['corretivos']) }, corretivos12m: 9 }),
    );
    expect(r.situacao).toBe('dispensado');
  });

  it('no dia de `ate` a dispensa já venceu', () => {
    const r = avaliarSubstituicao(
      entrada({ ativo: { ...velho, dispensa: dispensa(HOJE, ['idade']) } }),
    );
    expect(r.situacao).toBe('candidato');
  });

  it('sem critério nenhum, sai, mesmo com dispensa gravada', () => {
    const r = avaliarSubstituicao(
      entrada({ ativo: { dispensa: dispensa('2027-03-01', ['idade']) } }),
    );
    expect(r.situacao).toBe('fora');
    expect(r.dispensaVigente).toBe(false);
  });
});
