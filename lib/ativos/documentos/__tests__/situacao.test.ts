import { describe, expect, it } from 'vitest';

import { montarAviso, tituloDoAviso } from '../aviso';
import { casaFiltroSituacao } from '../painel';
import {
  dataSemHora,
  diasRestantes,
  hojeEmBelem,
  limitesAlcancados,
  rotuloSituacao,
  situacaoDoDocumento,
  somarDias,
} from '../situacao';

describe('datas sem hora (spec 0013)', () => {
  it('hoje é o dia de Belém, não o de UTC', () => {
    // 30/12 às 23:30 em Belém já é 31/12 em UTC.
    expect(hojeEmBelem(new Date('2026-12-31T02:30:00Z'))).toBe('2026-12-30');
  });

  it('validade 31/12 lida às 23:30 de 30/12 em Belém conta 1 dia (AC-11)', () => {
    const hoje = hojeEmBelem(new Date('2026-12-31T02:30:00Z'));
    expect(diasRestantes(dataSemHora('2026-12-31'), hoje)).toBe(1);
  });

  it('soma dias atravessando o ano', () => {
    expect(somarDias('2026-12-15', 90)).toBe('2027-03-15');
  });
});

describe('situacaoDoDocumento', () => {
  const hoje = '2026-10-03';
  it.each([
    [null, 'sem_validade', 'Sem validade'],
    ['2026-10-02', 'vencido', 'Vencido'],
    ['2026-10-03', 'vence_hoje', 'Vence hoje'],
    ['2026-10-04', 'vence_em', 'Vence em 1 dia'],
    ['2027-01-01', 'vence_em', 'Vence em 90 dias'],
    ['2027-01-02', 'em_dia', 'Em dia'],
  ])('validade %s → %s', (validade, tipo, rotulo) => {
    const s = situacaoDoDocumento(validade ? dataSemHora(validade) : null, hoje);
    expect(s.tipo).toBe(tipo);
    expect(rotuloSituacao(s)).toBe(rotulo);
  });
});

describe('limitesAlcancados', () => {
  const hoje = '2026-10-03';
  it('a 20 dias alcança 30, 60 e 90, nessa ordem de urgência (AC-11)', () => {
    expect(limitesAlcancados(dataSemHora('2026-10-23'), hoje)).toEqual(['30', '60', '90']);
  });
  it('vencido alcança todos, com vencido primeiro', () => {
    expect(limitesAlcancados(dataSemHora('2026-10-01'), hoje)).toEqual([
      'vencido',
      '30',
      '60',
      '90',
    ]);
  });
  it('no dia do vencimento ainda não é vencido', () => {
    expect(limitesAlcancados(dataSemHora('2026-10-03'), hoje)).not.toContain('vencido');
  });
  it('a 91 dias e sem validade não alcança nada (AC-14)', () => {
    expect(limitesAlcancados(dataSemHora('2027-01-02'), hoje)).toEqual([]);
    expect(limitesAlcancados(null, hoje)).toEqual([]);
  });
});

describe('casaFiltroSituacao (AC-9)', () => {
  it('"vence em até 30" inclui hoje e 30, não 31', () => {
    expect(casaFiltroSituacao({ tipo: 'vence_hoje' }, 'ate_30')).toBe(true);
    expect(casaFiltroSituacao({ tipo: 'vence_em', dias: 30 }, 'ate_30')).toBe(true);
    expect(casaFiltroSituacao({ tipo: 'vence_em', dias: 31 }, 'ate_30')).toBe(false);
    expect(casaFiltroSituacao({ tipo: 'vencido', dias: -1 }, 'ate_30')).toBe(false);
  });
});

describe('aviso de vencimento (AC-12)', () => {
  const doc = {
    id: 'd1',
    tipo: 'avcb',
    tipoNome: 'AVCB',
    numero: '123',
    emitidoPor: 'Bombeiros',
    validadeAte: dataSemHora('2026-11-02'),
  };
  const predio = {
    tipo: 'local' as const,
    localizacaoId: 'l1',
    nome: 'Prédio Sede',
    caminho: 'Prédio Sede',
    predioId: 'l1',
  };

  it('título com os dias reais e o nome do local', () => {
    expect(tituloDoAviso(doc, predio, '30', 30)).toBe('AVCB do Prédio Sede vence em 30 dias');
    expect(tituloDoAviso(doc, predio, '30', 0)).toBe('AVCB do Prédio Sede vence hoje');
  });

  it('vencido traz a data, e documento de ativo usa o código', () => {
    const ativo = {
      tipo: 'ativo' as const,
      ativoId: 'a1',
      codigo: 'MNT-0003',
      descricao: 'Split',
      predioId: null,
    };
    expect(tituloDoAviso({ ...doc, tipoNome: 'PMOC' }, ativo, 'vencido', -2)).toBe(
      'PMOC do MNT-0003 venceu em 02/11/2026',
    );
    const aviso = montarAviso(doc, ativo, '90', 60);
    expect(aviso.data).toEqual({ documentoId: 'd1', tipo: 'avcb', limite: '90', ativoId: 'a1' });
  });

  it('documento de local leva o prédio no data, para o link do painel', () => {
    const aviso = montarAviso(doc, predio, '30', 30);
    expect(aviso.data).toMatchObject({ localizacaoId: 'l1', predioId: 'l1' });
    expect(aviso.corpo).toContain('Número: 123');
    expect(aviso.corpo).toContain('Emitido por: Bombeiros');
  });
});
