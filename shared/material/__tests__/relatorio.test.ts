import { describe, expect, it } from 'vitest';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';

import { TEXTO_RELATORIO } from '../mensagens';
import { atalhoDoPeriodo, periodosDosAtalhos } from '../relatorio';

/**
 * Os atalhos de período do relatório de material (spec 0021, fatia 8): do
 * primeiro dia do mês, do trimestre ou do ano corrente até hoje.
 *
 * covers: AC-23
 */

describe('periodosDosAtalhos', () => {
  it('mês, trimestre e ano vão do primeiro dia do período corrente até hoje', () => {
    expect(periodosDosAtalhos('2026-11-14')).toEqual({
      mes: { inicio: '2026-11-01', fim: '2026-11-14' },
      trimestre: { inicio: '2026-10-01', fim: '2026-11-14' },
      ano: { inicio: '2026-01-01', fim: '2026-11-14' },
    });
  });

  it('o trimestre começa em janeiro, abril, julho e outubro', () => {
    expect(periodosDosAtalhos('2026-03-31').trimestre.inicio).toBe('2026-01-01');
    expect(periodosDosAtalhos('2026-04-01').trimestre.inicio).toBe('2026-04-01');
    expect(periodosDosAtalhos('2026-09-15').trimestre.inicio).toBe('2026-07-01');
  });

  it('em 1º de janeiro, os três atalhos são o próprio dia', () => {
    const p = periodosDosAtalhos('2027-01-01');
    expect(p.mes).toEqual({ inicio: '2027-01-01', fim: '2027-01-01' });
    expect(p.ano).toEqual(p.mes);
  });
});

describe('atalhoDoPeriodo', () => {
  it('reconhece o atalho só quando início e fim batem', () => {
    expect(atalhoDoPeriodo({ inicio: '2026-10-01', fim: '2026-11-14' }, '2026-11-14')).toBe(
      'trimestre',
    );
    expect(atalhoDoPeriodo({ inicio: '2026-11-01', fim: '2026-11-30' }, '2026-11-14')).toBeNull();
  });

  it('no primeiro mês do trimestre, marca o atalho escolhido, não o primeiro com as mesmas datas', () => {
    const outubro = { inicio: '2026-10-01', fim: '2026-10-23' };
    expect(atalhoDoPeriodo(outubro, '2026-10-23', 'trimestre')).toBe('trimestre');
    expect(atalhoDoPeriodo(outubro, '2026-10-23', 'mes')).toBe('mes');
    expect(atalhoDoPeriodo(outubro, '2026-10-23')).toBe('mes');
  });

  it('o atalho escolhido só vale se as datas forem as dele', () => {
    const outubro = { inicio: '2026-10-01', fim: '2026-10-23' };
    expect(atalhoDoPeriodo(outubro, '2026-10-23', 'ano')).toBe('mes');
    expect(
      atalhoDoPeriodo({ inicio: '2026-05-01', fim: '2026-05-31' }, '2026-10-23', 'trimestre'),
    ).toBeNull();
  });
});

describe('o dia de hoje vem de Belém (como a página monta)', () => {
  it('às 21h30 de 31/10 em Belém, já 01/11 em UTC, "Mês atual" ainda é outubro', () => {
    const hoje = hojeEmBelem(new Date('2026-11-01T00:30:00Z'));
    expect(hoje).toBe('2026-10-31');
    expect(periodosDosAtalhos(hoje).mes).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
  });

  it('às 22h de 31/12 em Belém, "Ano atual" continua no ano que termina', () => {
    const hoje = hojeEmBelem(new Date('2027-01-01T01:00:00Z'));
    expect(periodosDosAtalhos(hoje).ano).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' });
  });
});

describe('textos do relatório', () => {
  it('nenhum texto cita regra pelo número (RN-36 e companhia)', () => {
    expect(JSON.stringify(TEXTO_RELATORIO)).not.toMatch(/RN-\d/);
  });
});
