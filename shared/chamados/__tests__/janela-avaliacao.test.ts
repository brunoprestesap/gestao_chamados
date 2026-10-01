import { describe, expect, it } from 'vitest';

import {
  calcularPrazoAvaliacao,
  camposJanelaDTO,
  erroForaDaJanela,
  filtroJanelaAberta,
  formatarPrazoAvaliacao,
  frasePrazoAvaliacao,
  janelaAberta,
  MSG_CHAMADO_JA_ENCERRADO,
  MSG_ENCERRADO_DEFINITIVO,
  MSG_PRAZO_AVALIACAO_VENCIDO,
  normalizarPrazoAvaliacaoHoras,
} from '../janela-avaliacao';

const agora = new Date('2026-10-01T12:00:00.000Z');

describe('calcularPrazoAvaliacao', () => {
  it('soma as horas corridas à conclusão', () => {
    expect(calcularPrazoAvaliacao(agora, 48).toISOString()).toBe('2026-10-03T12:00:00.000Z');
    expect(calcularPrazoAvaliacao(agora, 24).toISOString()).toBe('2026-10-02T12:00:00.000Z');
  });

  it('usa 48 horas quando o valor está fora da faixa', () => {
    expect(calcularPrazoAvaliacao(agora, 0).toISOString()).toBe('2026-10-03T12:00:00.000Z');
    expect(calcularPrazoAvaliacao(agora, 721).toISOString()).toBe('2026-10-03T12:00:00.000Z');
  });
});

describe('normalizarPrazoAvaliacaoHoras', () => {
  it.each([
    [1, 1],
    [720, 720],
    [undefined, 48],
    [null, 48],
    [1.5, 48],
    ['24', 48],
  ])('%s vira %s', (entrada, saida) => {
    expect(normalizarPrazoAvaliacaoHoras(entrada)).toBe(saida);
  });
});

describe('janelaAberta', () => {
  it('abre com o prazo no futuro', () => {
    expect(janelaAberta('concluído', new Date('2026-10-01T12:00:01Z'), agora)).toBe(true);
  });

  it('fecha no instante exato do prazo e depois dele', () => {
    expect(janelaAberta('concluído', agora, agora)).toBe(false);
    expect(janelaAberta('concluído', '2026-09-30T00:00:00Z', agora)).toBe(false);
  });

  it('conta prazo ausente como aberto (legado)', () => {
    expect(janelaAberta('concluído', null, agora)).toBe(true);
    expect(janelaAberta('concluído', undefined, agora)).toBe(true);
  });

  it('nunca abre fora do concluído', () => {
    expect(janelaAberta('encerrado', null, agora)).toBe(false);
    expect(janelaAberta('em atendimento', '2027-01-01T00:00:00Z', agora)).toBe(false);
  });
});

describe('filtroJanelaAberta', () => {
  it('exige concluído e prazo futuro ou ausente', () => {
    expect(filtroJanelaAberta(agora)).toEqual({
      status: 'concluído',
      $or: [{ prazoAvaliacaoAte: { $gt: agora } }, { prazoAvaliacaoAte: null }],
    });
  });
});

describe('erroForaDaJanela', () => {
  it('encerrado vem primeiro', () => {
    expect(erroForaDaJanela('encerrado', null, agora)).toBe(MSG_CHAMADO_JA_ENCERRADO);
    expect(erroForaDaJanela('encerrado', null, agora, MSG_ENCERRADO_DEFINITIVO)).toBe(
      MSG_ENCERRADO_DEFINITIVO,
    );
  });

  it('prazo vencido no concluído', () => {
    expect(erroForaDaJanela('concluído', '2026-09-30T00:00:00Z', agora)).toBe(
      MSG_PRAZO_AVALIACAO_VENCIDO,
    );
  });

  it('devolve null para os outros casos', () => {
    expect(erroForaDaJanela('concluído', null, agora)).toBeNull();
    expect(erroForaDaJanela('em atendimento', null, agora)).toBeNull();
  });
});

describe('formatarPrazoAvaliacao', () => {
  it('formata no fuso de Belém (UTC−3)', () => {
    expect(formatarPrazoAvaliacao('2026-10-03T12:05:00Z')).toBe('03/10 às 09:05');
  });

  it('respeita outro fuso', () => {
    expect(formatarPrazoAvaliacao('2026-10-03T12:05:00Z', 'America/Manaus')).toBe('03/10 às 08:05');
  });

  it('cruza a meia noite pelo fuso, não pelo UTC', () => {
    expect(formatarPrazoAvaliacao('2026-10-04T01:30:00Z')).toBe('03/10 às 22:30');
  });

  it('devolve vazio sem data', () => {
    expect(formatarPrazoAvaliacao(null)).toBe('');
    expect(frasePrazoAvaliacao(null)).toBe('');
  });

  it('monta a frase do aviso', () => {
    expect(frasePrazoAvaliacao('2026-10-03T12:05:00Z')).toBe(
      'Avalie ou recuse o serviço até 03/10 às 09:05',
    );
  });
});

// covers: AC-10 (a janela vem calculada pela rota, com a hora do servidor)
describe('camposJanelaDTO', () => {
  it('devolve o prazo em ISO e a janela aberta quando o prazo é futuro', () => {
    // Arrange
    const prazo = new Date('2026-10-03T12:00:00.000Z');

    // Act
    const dto = camposJanelaDTO({ status: 'concluído', prazoAvaliacaoAte: prazo }, agora);

    // Assert
    expect(dto).toEqual({
      prazoAvaliacaoAte: '2026-10-03T12:00:00.000Z',
      janelaAvaliacaoAberta: true,
      chamadoAnteriorId: null,
    });
  });

  it('fecha a janela com o prazo vencido, mesmo com o status ainda concluído', () => {
    expect(
      camposJanelaDTO({ status: 'concluído', prazoAvaliacaoAte: '2026-09-30T00:00:00Z' }, agora)
        .janelaAvaliacaoAberta,
    ).toBe(false);
  });

  it('trata o concluído sem prazo (legado) como janela aberta, com prazo nulo', () => {
    expect(camposJanelaDTO({ status: 'concluído' }, agora)).toEqual({
      prazoAvaliacaoAte: null,
      janelaAvaliacaoAberta: true,
      chamadoAnteriorId: null,
    });
  });

  it('nunca abre a janela no encerrado', () => {
    expect(
      camposJanelaDTO({ status: 'encerrado', prazoAvaliacaoAte: '2027-01-01T00:00:00Z' }, agora)
        .janelaAvaliacaoAberta,
    ).toBe(false);
  });

  it('converte o chamadoAnteriorId em texto', () => {
    // Arrange
    const id = { toString: () => '6abe641090e4552e50b996bc' };

    // Act / Assert
    expect(
      camposJanelaDTO({ status: 'aberto', chamadoAnteriorId: id }, agora).chamadoAnteriorId,
    ).toBe('6abe641090e4552e50b996bc');
  });

  it('ignora prazo com valor que não é data', () => {
    expect(
      camposJanelaDTO({ status: 'concluído', prazoAvaliacaoAte: 123 }, agora).prazoAvaliacaoAte,
    ).toBeNull();
    expect(
      camposJanelaDTO({ status: 'concluído', prazoAvaliacaoAte: 'não é data' }, agora)
        .prazoAvaliacaoAte,
    ).toBeNull();
  });
});
