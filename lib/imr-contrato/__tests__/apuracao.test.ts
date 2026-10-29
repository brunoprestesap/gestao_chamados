import { describe, expect, it } from 'vitest';

import { faixaDoTotal, pontosDaEscala } from '@/shared/imr-contrato/imr-contrato.constants';

import {
  apurarMes,
  type ChamadoLidoI3,
  type CotacaoLidaI4,
  type EntradaApuracao,
  prazoDeFornecimento,
} from '../apuracao';
import {
  type CalendarioImr,
  diaEmBelem,
  limitesDoMesEmBelem,
  prazoDeResposta,
  prazoEmDiasUteis,
} from '../prazo';

/** Prazo, escala e apuração do indicador 3 (spec 0023). covers: AC-2, AC-3, AC-4, AC-16 */

const cal = (feriados: string[] = []): CalendarioImr => ({
  weekdays: [1, 2, 3, 4, 5],
  workdayEnd: '18:00',
  feriados: new Set(feriados),
});

/** `YYYY-MM-DDTHH:mm` em Belém. */
const b = (s: string) => new Date(`${s}:00.000-03:00`);

let n = 0;
function chamado(extra: Partial<ChamadoLidoI3> = {}): ChamadoLidoI3 {
  n += 1;
  return {
    id: `c${n}`,
    ticketNumber: String(1000 + n),
    solicitanteNome: 'Fulana',
    setor: 'Secad',
    titulo: 'Lâmpada queimada',
    createdAt: b('2026-09-08T10:00'),
    responseStartedAt: null,
    status: 'aberto',
    preventiva: false,
    encerradoEm: null,
    ...extra,
  };
}

function entrada(chamados: ChamadoLidoI3[], extra: Partial<EntradaApuracao> = {}): EntradaApuracao {
  return {
    competencia: '2026-09',
    agora: b('2026-10-05T12:00'),
    calendario: cal(),
    chamados,
    cotacoes: [],
    ...extra,
  };
}

function cotacao(extra: Partial<CotacaoLidaI4> = {}): CotacaoLidaI4 {
  n += 1;
  return {
    id: `q${n}`,
    numero: `MAT-2026-${String(n).padStart(4, '0')}`,
    chamadoTicketNumber: String(2000 + n),
    situacao: 'autorizada',
    // Quinta 10/09; com N = 5 vence na quinta 17/09 às 18h.
    autorizadoEm: b('2026-09-10T09:00'),
    fornecimentoAte: b('2026-09-17T18:00'),
    executadoEm: null,
    encerradoEm: null,
    ...extra,
  };
}

const i4De = (cotacoes: CotacaoLidaI4[], extra: Partial<EntradaApuracao> = {}) =>
  apurarMes(entrada([], { cotacoes, ...extra })).i4;

describe('prazo de resposta (AC-2)', () => {
  it('sexta às 20h com segunda feriado vence na terça às 18h', () => {
    // 2026-09-04 é sexta; 2026-09-07 é segunda.
    const prazo = prazoDeResposta(b('2026-09-04T20:00'), cal(['2026-09-07']));
    expect(prazo).toEqual(b('2026-09-08T18:00'));
  });

  it('sábado vence na segunda às 18h', () => {
    expect(prazoDeResposta(b('2026-09-05T09:00'), cal())).toEqual(b('2026-09-07T18:00'));
  });

  it('usa o dia de Belém, não o de UTC', () => {
    // 23h de segunda em Belém já é terça em UTC.
    const criado = b('2026-09-07T23:00');
    expect(diaEmBelem(criado)).toBe('2026-09-07');
    expect(prazoDeResposta(criado, cal())).toEqual(b('2026-09-08T18:00'));
  });

  it('N dias úteis: quinta com N = 5 vence na quinta seguinte às 18h', () => {
    expect(prazoEmDiasUteis(b('2026-09-10T09:00'), 5, cal())).toEqual(b('2026-09-17T18:00'));
  });

  it('sem dia útil na semana devolve null', () => {
    expect(prazoDeResposta(b('2026-09-10T09:00'), { ...cal(), weekdays: [] })).toBeNull();
  });

  it('limites do mês em Belém', () => {
    const { inicio, fim } = limitesDoMesEmBelem('2026-12');
    expect(inicio).toEqual(b('2026-12-01T00:00'));
    expect(fim).toEqual(b('2027-01-01T00:00'));
  });
});

describe('escala e faixas', () => {
  it('0, 1, 2, 3, 4 e 7 ocorrências dão 20, 15, 10, 5, 0 e 0 (AC-4)', () => {
    expect([0, 1, 2, 3, 4, 7].map(pontosDaEscala)).toEqual([20, 15, 10, 5, 0, 0]);
  });

  it('faixas nos limites', () => {
    expect([100, 80, 79, 70, 69, 60, 59, 50, 49, 0].map((t) => faixaDoTotal(t).fator)).toEqual([
      1, 1, 0.97, 0.97, 0.95, 0.95, 0.93, 0.93, 0.9, 0.9,
    ]);
  });
});

describe('apurarMes, indicador 3 (AC-3)', () => {
  it('atribuição às 18h01 do prazo é atraso; às 18h00 não', () => {
    const atrasado = chamado({
      responseStartedAt: b('2026-09-09T18:01'),
      status: 'em atendimento',
    });
    const emDia = chamado({ responseStartedAt: b('2026-09-09T18:00'), status: 'em atendimento' });
    const { i3 } = apurarMes(entrada([atrasado, emDia]));
    expect(i3.base).toBe(2);
    expect(i3.noPrazo).toBe(1);
    expect(i3.ocorrencias).toBe(1);
    expect(i3.pontos).toBe(15);
    expect(i3.linhas[0]).toMatchObject({
      chamadoId: atrasado.id,
      iniciadoEm: atrasado.responseStartedAt,
      tempoAteInicioMin: 32 * 60 + 1,
      prazo: b('2026-09-09T18:00'),
      situacao: 'atraso',
    });
  });

  it('sem atribuição e prazo vencido é atraso; prazo por vencer aguarda', () => {
    const vencido = chamado({ status: 'validado' });
    const futuro = chamado({ createdAt: b('2026-09-29T10:00') });
    const { i3 } = apurarMes(entrada([vencido, futuro], { agora: b('2026-09-30T09:00') }));
    expect(i3.ocorrencias).toBe(1);
    expect(i3.aguardandoPrazo).toBe(1);
    expect(i3.linhas[0]).toMatchObject({ iniciadoEm: null, tempoAteInicioMin: null });
  });

  it('cancelado antes do prazo sai; cancelado depois do prazo sem início conta', () => {
    const antes = chamado({ status: 'cancelado', encerradoEm: b('2026-09-09T12:00') });
    const depois = chamado({ status: 'recusado', encerradoEm: b('2026-09-10T09:00') });
    const { i3 } = apurarMes(entrada([antes, depois]));
    expect(i3.base).toBe(1);
    expect(i3.linhas.map((l) => l.chamadoId)).toEqual([depois.id]);
  });

  it('chamado que avançou sem início não conta e vai para "sem registro de início"', () => {
    const { i3 } = apurarMes(entrada([chamado({ status: 'encerrado' })]));
    expect(i3).toMatchObject({ base: 0, ocorrencias: 0, semRegistroDeInicio: 1, pontos: 20 });
  });

  it('preventiva e prazo fora do mês ficam fora da base', () => {
    const preventiva = chamado({ preventiva: true });
    const agosto = chamado({ createdAt: b('2026-08-27T10:00') }); // prazo 28/08
    const viraMes = chamado({ createdAt: b('2026-08-31T19:00') }); // prazo 01/09, entra
    const outubro = chamado({ createdAt: b('2026-09-30T10:00') }); // prazo 01/10, sai
    const { i3 } = apurarMes(entrada([preventiva, agosto, viraMes, outubro]));
    expect(i3.linhas.map((l) => l.chamadoId)).toEqual([viraMes.id]);
    expect(i3.base).toBe(1);
  });

  it('início anterior à abertura nunca é atraso', () => {
    const torto = chamado({ responseStartedAt: b('2026-09-08T09:00'), status: 'em atendimento' });
    const { i3 } = apurarMes(entrada([torto]));
    expect(i3.ocorrencias).toBe(0);
    expect(i3.noPrazo).toBe(1);
  });

  it('quatro atrasos zeram; linhas por prazo', () => {
    const lista = [12, 9, 10, 11].map((dia) =>
      chamado({ createdAt: b(`2026-09-${String(dia).padStart(2, '0')}T10:00`) }),
    );
    const { i3 } = apurarMes(entrada(lista));
    expect(i3.pontos).toBe(0);
    expect(i3.linhas.map((l) => l.prazo.getTime())).toEqual(
      [...i3.linhas.map((l) => l.prazo.getTime())].sort((a, b2) => a - b2),
    );
  });

  it('apuradoEm e feriados usados entre a abertura mais antiga e o último prazo (AC-16)', () => {
    const r = apurarMes(
      entrada([chamado({ createdAt: b('2026-09-04T20:00') })], {
        calendario: cal(['2026-09-07', '2026-11-02']),
      }),
    );
    expect(r.apuradoEm).toEqual(b('2026-10-05T12:00'));
    expect(r.feriadosUsados).toEqual(['2026-09-07']);
  });
});

describe('apurarMes, indicador 4 (AC-5, AC-6)', () => {
  // covers: AC-5
  it('executada depois do prazo é atraso; no prazo, não', () => {
    const i4 = i4De([
      cotacao({ situacao: 'executada', executadoEm: b('2026-09-17T18:01') }),
      cotacao({ situacao: 'executada', executadoEm: b('2026-09-17T18:00') }),
    ]);
    expect(i4).toMatchObject({ base: 2, noPrazo: 1, ocorrencias: 1, pontos: 15 });
    expect(i4.linhas[0]).toMatchObject({ situacao: 'atraso', prazoEstimado: false });
  });

  // covers: AC-5
  it('sem execução: prazo vencido conta, prazo por vencer aguarda', () => {
    const agora = b('2026-09-20T12:00');
    const i4 = i4De([cotacao(), cotacao({ fornecimentoAte: b('2026-09-25T18:00') })], { agora });
    expect(i4).toMatchObject({ base: 2, ocorrencias: 1, aguardandoPrazo: 1 });
  });

  // covers: AC-5
  it('cancelada antes do prazo sai; cancelada ou reprovada depois do prazo vencido conta', () => {
    const i4 = i4De([
      cotacao({ situacao: 'cancelada', encerradoEm: b('2026-09-15T10:00') }),
      cotacao({ situacao: 'cancelada', encerradoEm: b('2026-09-18T10:00') }),
      cotacao({ situacao: 'reprovada', encerradoEm: b('2026-09-21T10:00') }),
    ]);
    expect(i4).toMatchObject({ base: 2, ocorrencias: 2, pontos: 10 });
  });

  // covers: AC-5
  it('executada a tempo e cancelada depois nunca é atraso', () => {
    const i4 = i4De([
      cotacao({
        situacao: 'cancelada',
        executadoEm: b('2026-09-16T10:00'),
        encerradoEm: b('2026-09-22T10:00'),
      }),
    ]);
    expect(i4).toMatchObject({ base: 1, noPrazo: 1, ocorrencias: 0, pontos: 20 });
  });

  // covers: AC-5
  it('prazo fora do mês e cotação sem prazo ficam fora da base', () => {
    const i4 = i4De([
      cotacao({ fornecimentoAte: b('2026-10-01T18:00') }),
      cotacao({ fornecimentoAte: b('2026-08-31T18:00') }),
      cotacao({ fornecimentoAte: null, autorizadoEm: null, situacao: 'devolvida' }),
    ]);
    expect(i4.base).toBe(0);
    expect(i4.pontos).toBe(20);
  });

  // covers: AC-6
  it('cotação antiga sem fornecimentoAte fica com N = 5 mesmo com outro N no parâmetro', () => {
    const antiga = cotacao({ fornecimentoAte: null, autorizadoEm: b('2026-09-10T09:00') });
    expect(prazoDeFornecimento(antiga, cal(), 10)).toEqual({
      prazo: b('2026-09-17T18:00'),
      estimado: true,
    });
  });

  // covers: AC-6
  it('cotação autorizada depois da spec 0023 e sem prazo (cálculo falhou) usa o N atual', () => {
    // Quinta, 05/11/2026, 09:00: com N = 10, o 10º dia útil é quinta, 19/11.
    const nova = cotacao({ fornecimentoAte: null, autorizadoEm: b('2026-11-05T09:00') });
    expect(prazoDeFornecimento(nova, cal(), 10)).toEqual({
      prazo: b('2026-11-19T18:00'),
      estimado: true,
    });
  });

  // covers: AC-6
  it('cotação antiga sem fornecimentoAte entra com N = 5 e prazo estimado', () => {
    const antiga = cotacao({ fornecimentoAte: null, autorizadoEm: b('2026-09-10T09:00') });
    expect(prazoDeFornecimento(antiga, cal())).toEqual({
      prazo: b('2026-09-17T18:00'),
      estimado: true,
    });
    const i4 = i4De([antiga]);
    expect(i4).toMatchObject({ base: 1, ocorrencias: 1, prazosEstimados: 1 });
    expect(i4.linhas[0]?.prazoEstimado).toBe(true);
  });

  // covers: AC-6
  it('prazo vencido mantido pelo alterar continua contando sem a data de autorização', () => {
    const i4 = i4De([cotacao({ situacao: 'devolvida', autorizadoEm: null })]);
    expect(i4).toMatchObject({ base: 1, ocorrencias: 1 });
    expect(i4.linhas[0]?.autorizadoEm).toBeNull();
  });

  // covers: AC-16
  it('os feriados usados incluem os dias do indicador 4', () => {
    const r = apurarMes(
      entrada([], { cotacoes: [cotacao()], calendario: cal(['2026-09-14', '2026-11-02']) }),
    );
    expect(r.feriadosUsados).toEqual(['2026-09-14']);
  });
});
