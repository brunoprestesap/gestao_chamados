import { describe, expect, it } from 'vitest';

import { classificar } from '../classificacao';

/** Classificação portada do `docs/specs/0011-gestao-ativos/extrair.py` (spec 0012, AC-19). */
describe('classificar', () => {
  it('picape com ar condicionado de série vai para veículo (tier D), não climatização', () => {
    expect(classificar('PICAPE CABINE DUPLA 4X4, AR CONDICIONADO, DIREÇÃO HIDRÁULICA')).toEqual({
      tier: 'D',
      categoria: 'veiculo',
    });
  });

  it('acessório é ruído e fica de fora', () => {
    expect(classificar('SUPORTE PARA SPLIT 12000 BTUS')).toBeNull();
    expect(classificar('  controle remoto para ar condicionado')).toBeNull();
  });

  it('bebedouro é tier B (copa)', () => {
    expect(classificar('BEBEDOURO ELÉTRICO DE COLUNA')).toEqual({
      tier: 'B',
      categoria: 'copa_refrigeracao',
    });
  });

  it('split é climatização (tier A), sem diferenciar maiúsculas', () => {
    expect(classificar('condicionador de ar split 18000 btus')).toEqual({
      tier: 'A',
      categoria: 'climatizacao',
    });
  });

  it('bomba odontológica não é bomba hidráulica', () => {
    expect(classificar('BOMBA A VÁCUO ODONTOLÓGICA')).toBeNull();
    expect(classificar('MOTOBOMBA CENTRÍFUGA 2CV')).toEqual({
      tier: 'A',
      categoria: 'hidraulica_bomba',
    });
  });

  it('a primeira regra que casa vence; o que nenhuma casa fica sem classe', () => {
    expect(classificar('SWITCH 24 PORTAS')).toEqual({ tier: 'C', categoria: 'ti_rede' });
    expect(classificar('MESA DE ESCRITÓRIO')).toBeNull();
  });
});
