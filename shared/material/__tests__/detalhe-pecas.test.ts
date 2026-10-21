import { describe, expect, it } from 'vitest';

import { etapasDaTrilha, situacaoAnteriorDaTrilha } from '../jornada';
import {
  ACOES_DA_VEZ,
  CODIGOS_CONTROLE,
  CONTROLES,
  ROTULO_ACAO,
  TEXTO_ACAO_DA_VEZ,
  textoDoControleSemRotulo,
  TITULO_CONTROLE,
} from '../mensagens';

/**
 * As peças puras do detalhe (spec 0021, fatia 2): as datas da jornada pela
 * trilha, o desvio e os textos do painel "Sua vez".
 *
 * covers: AC-5, AC-6, AC-7, AC-27
 */

const ev = (de: string | null, para: string, dia: number) => ({
  de: de as never,
  para: para as never,
  em: new Date(Date.UTC(2026, 9, dia, 12)),
});
const iso = (dia: number) => new Date(Date.UTC(2026, 9, dia, 12)).toISOString();

describe('etapasDaTrilha', () => {
  it('data cada etapa pelo primeiro evento que leva a ela', () => {
    expect(
      etapasDaTrilha([
        ev(null, 'rascunho', 10),
        ev('rascunho', 'rascunho', 11),
        ev('rascunho', 'enviada', 12),
        ev('enviada', 'em_analise', 13),
      ]),
    ).toEqual([
      { situacao: 'rascunho', em: iso(10) },
      { situacao: 'enviada', em: iso(12) },
      { situacao: 'em_analise', em: iso(13) },
    ]);
  });

  it('ainda devolvida, guarda as datas da primeira passada', () => {
    const etapas = etapasDaTrilha([
      ev(null, 'rascunho', 10),
      ev('rascunho', 'enviada', 12),
      ev('enviada', 'em_analise', 13),
      ev('em_analise', 'devolvida', 14),
    ]);
    expect(etapas.map((e) => e.situacao)).toEqual(['rascunho', 'enviada', 'em_analise']);
  });

  it('depois do reenvio, conta a partir dele; o rascunho fica com a criação', () => {
    expect(
      etapasDaTrilha([
        ev(null, 'rascunho', 10),
        ev('rascunho', 'enviada', 12),
        ev('enviada', 'em_analise', 13),
        ev('em_analise', 'devolvida', 14),
        ev('devolvida', 'enviada', 16),
      ]),
    ).toEqual([
      { situacao: 'rascunho', em: iso(10) },
      { situacao: 'enviada', em: iso(16) },
    ]);
  });

  it('a conciliação, que não muda a situação, não conta', () => {
    expect(etapasDaTrilha([ev('autorizada', 'autorizada', 20)])).toEqual([]);
  });
});

describe('situacaoAnteriorDaTrilha', () => {
  it('é o `de` do último evento que mudou a situação', () => {
    expect(
      situacaoAnteriorDaTrilha([
        ev('enviada', 'em_analise', 13),
        ev('em_analise', 'reprovada', 14),
        ev('reprovada', 'reprovada', 15),
      ]),
    ).toBe('em_analise');
    expect(situacaoAnteriorDaTrilha([])).toBeNull();
  });
});

describe('textos do detalhe', () => {
  it('todo controle tem título curto para o painel', () => {
    for (const c of CODIGOS_CONTROLE) expect(TITULO_CONTROLE[c]).toBeTruthy();
  });

  it('o texto que vem depois do título não repete o rótulo que já traz', () => {
    expect(textoDoControleSemRotulo('reincidencia')).toMatch(/^Este equipamento já teve/);
    expect(textoDoControleSemRotulo('fracionamento')).toMatch(/^Somado ao mesmo item/);
    expect(textoDoControleSemRotulo('orcamento_vencido')).toBe('Confirme cada um para encaminhar.');
    // Sem rótulo antes dos dois pontos, o texto fica como está.
    expect(textoDoControleSemRotulo('cnpj_invalido')).toBe(CONTROLES.cnpj_invalido.texto);
    for (const c of CODIGOS_CONTROLE) {
      expect(textoDoControleSemRotulo(c).toLowerCase()).not.toMatch(
        new RegExp(`^${TITULO_CONTROLE[c].toLowerCase()}`),
      );
    }
  });

  it('toda ação da vez tem título e botão, e a conciliação tem rótulo na trilha', () => {
    for (const a of ACOES_DA_VEZ) {
      expect(TEXTO_ACAO_DA_VEZ[a].titulo).toBeTruthy();
      expect(TEXTO_ACAO_DA_VEZ[a].botao).toBeTruthy();
    }
    expect(ROTULO_ACAO.conciliar).toBe('Conciliação do saldo');
  });
});
