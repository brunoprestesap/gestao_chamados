import { describe, expect, it } from 'vitest';

import { mesmoNumero, type TipoMarcacao } from '@/shared/imr-contrato/imr-contrato.constants';

import {
  apurarComBase,
  apurarMes,
  type ChamadoLidoI3,
  type CotacaoLidaI4,
  type EntradaApuracao,
  type MarcacaoLida,
} from '../apuracao';

/** Marcações do fiscal e do gestor na apuração (spec 0023). covers: AC-4, AC-7, AC-8, AC-9 */

const b = (s: string) => new Date(`${s}:00.000-03:00`);

// Abertos terça 08/09: prazo quarta 09/09 às 18h, vencido em 05/10.
let n = 0;
function chamado(extra: Partial<ChamadoLidoI3> = {}): ChamadoLidoI3 {
  n += 1;
  return {
    id: `c${n}`,
    ticketNumber: `CHM-2026-${String(n).padStart(5, '0')}`,
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

function cotacao(extra: Partial<CotacaoLidaI4> = {}): CotacaoLidaI4 {
  n += 1;
  return {
    id: `q${n}`,
    numero: `MAT-2026-${String(n).padStart(4, '0')}`,
    chamadoTicketNumber: 'CHM-2026-00001',
    situacao: 'autorizada',
    autorizadoEm: b('2026-09-10T09:00'),
    fornecimentoAte: b('2026-09-17T18:00'),
    executadoEm: b('2026-09-15T10:00'),
    encerradoEm: null,
    ...extra,
  };
}

let m = 0;
function marca(
  alvoId: string,
  tipo: TipoMarcacao,
  em: string,
  extra: Partial<MarcacaoLida> = {},
): MarcacaoLida {
  m += 1;
  return {
    id: String(m).padStart(24, '0'),
    indicador: 3,
    alvoId,
    alvoNumero: '',
    tipo,
    motivo: 'Motivo com mais de dez letras',
    porNome: 'Fiscal Um',
    papel: 'fiscal',
    em: b(em),
    ...extra,
  };
}

function entrada(extra: Partial<EntradaApuracao>): EntradaApuracao {
  return {
    competencia: '2026-09',
    agora: b('2026-10-05T12:00'),
    calendario: { weekdays: [1, 2, 3, 4, 5], workdayEnd: '18:00', feriados: new Set() },
    chamados: [],
    cotacoes: [],
    ...extra,
  };
}

describe('desconsiderar (AC-7)', () => {
  it('a ocorrência desconsiderada fica na lista e não conta', () => {
    const [a, c] = [chamado(), chamado()];
    const { i3 } = apurarMes(
      entrada({ chamados: [a, c], marcacoes: [marca(a.id, 'desconsiderar', '2026-10-01T09:00')] }),
    );
    expect(i3.ocorrencias).toBe(1);
    expect(i3.desconsideradas).toBe(1);
    expect(i3.pontos).toBe(15);
    const linha = i3.linhas.find((l) => l.chamadoId === a.id)!;
    expect(linha.situacao).toBe('desconsiderada');
    expect(linha.desconsideracao).toMatchObject({ porNome: 'Fiscal Um', papel: 'fiscal' });
  });

  it('desfazer devolve a ocorrência à escala', () => {
    const a = chamado();
    const { i3 } = apurarMes(
      entrada({
        chamados: [a],
        marcacoes: [
          marca(a.id, 'desconsiderar', '2026-10-01T09:00'),
          marca(a.id, 'desfazer_desconsiderar', '2026-10-02T09:00'),
        ],
      }),
    );
    expect(i3.pontos).toBe(15);
    expect(i3.linhas[0]).toMatchObject({ situacao: 'atraso', desconsideracao: null });
  });

  it('desconsiderar um chamado atendido no prazo não muda nada', () => {
    const a = chamado({ responseStartedAt: b('2026-09-08T11:00'), status: 'em atendimento' });
    const { i3 } = apurarMes(
      entrada({ chamados: [a], marcacoes: [marca(a.id, 'desconsiderar', '2026-10-01T09:00')] }),
    );
    expect(i3).toMatchObject({ pontos: 20, ocorrencias: 0, desconsideradas: 0, linhas: [] });
  });

  it('o empate de `em` decide pelo `_id`', () => {
    const a = chamado();
    const em = '2026-10-01T09:00';
    const { i3 } = apurarMes(
      entrada({
        chamados: [a],
        marcacoes: [
          marca(a.id, 'desfazer_desconsiderar', em, { id: 'b'.repeat(24) }),
          marca(a.id, 'desconsiderar', em, { id: 'a'.repeat(24) }),
        ],
      }),
    );
    expect(i3.linhas[0]!.situacao).toBe('atraso');
  });
});

describe('não atendimento e não fornecido (AC-4, AC-8)', () => {
  it('não atendimento com zero atrasos zera o indicador 3', () => {
    const a = chamado({ responseStartedAt: b('2026-09-08T11:00'), status: 'em atendimento' });
    const { i3 } = apurarMes(
      entrada({ chamados: [a], marcacoes: [marca(a.id, 'nao_atendimento', '2026-10-01T09:00')] }),
    );
    expect(i3).toMatchObject({ pontos: 0, ocorrencias: 0, zeradoPorMarcacao: true });
    expect(i3.linhas).toHaveLength(1);
    expect(i3.linhas[0]).toMatchObject({ atraso: false, situacao: 'nao_atendimento' });
  });

  it('desfazer o não atendimento volta a 20', () => {
    const a = chamado({ responseStartedAt: b('2026-09-08T11:00'), status: 'em atendimento' });
    const { i3 } = apurarMes(
      entrada({
        chamados: [a],
        marcacoes: [
          marca(a.id, 'nao_atendimento', '2026-10-01T09:00'),
          marca(a.id, 'desfazer_nao_atendimento', '2026-10-01T10:00'),
        ],
      }),
    );
    expect(i3).toMatchObject({ pontos: 20, zeradoPorMarcacao: false, linhas: [] });
  });

  it('não atendimento vence a desconsideração na situação, e as duas ficam visíveis', () => {
    const a = chamado();
    const { i3 } = apurarMes(
      entrada({
        chamados: [a],
        marcacoes: [
          marca(a.id, 'desconsiderar', '2026-10-01T09:00'),
          marca(a.id, 'nao_atendimento', '2026-10-01T10:00'),
        ],
      }),
    );
    const l = i3.linhas[0]!;
    expect(l.situacao).toBe('nao_atendimento');
    expect(l.desconsideracao).not.toBeNull();
    expect(l.marcacao).toBe(l.naoAtendimento);
    expect(i3.pontos).toBe(0);
  });

  it('não fornecido numa cotação entregue no prazo zera o indicador 4', () => {
    const q = cotacao();
    const { i4 } = apurarMes(
      entrada({
        cotacoes: [q],
        marcacoes: [marca(q.id, 'nao_atendimento', '2026-10-01T09:00', { indicador: 4 })],
      }),
    );
    expect(i4).toMatchObject({ pontos: 0, zeradoPorMarcacao: true });
  });

  it('a marcação do indicador 3 não atinge o mesmo id no indicador 4', () => {
    const q = cotacao();
    const { i4 } = apurarMes(
      entrada({ cotacoes: [q], marcacoes: [marca(q.id, 'nao_atendimento', '2026-10-01T09:00')] }),
    );
    expect(i4.pontos).toBe(20);
  });
});

describe('marcações ignoradas (AC-9)', () => {
  it('a marcação feita com o mês fechado é ignorada, mesmo depois da reabertura', () => {
    const a = chamado({ responseStartedAt: b('2026-09-08T11:00'), status: 'em atendimento' });
    const { i3 } = apurarMes(
      entrada({
        chamados: [a],
        marcacoes: [marca(a.id, 'nao_atendimento', '2026-10-02T09:00')],
        intervalosFechados: [{ de: b('2026-10-01T12:00'), ate: b('2026-10-03T12:00') }],
      }),
    );
    expect(i3.pontos).toBe(20);
  });

  it('marcação de alvo fora da base não conta e aparece em "fora da base"', () => {
    const r = apurarComBase(
      entrada({
        chamados: [],
        marcacoes: [
          marca('sumiu', 'nao_atendimento', '2026-10-01T09:00', { alvoNumero: 'CHM-2026-00999' }),
          marca('outro', 'desconsiderar', '2026-10-01T09:00'),
          marca('outro', 'desfazer_desconsiderar', '2026-10-01T10:00'),
        ],
      }),
    );
    expect(r.apuracao.i3.pontos).toBe(20);
    expect(r.apuracao.marcacoesForaDaBase).toEqual([
      expect.objectContaining({ alvoId: 'sumiu', alvoNumero: 'CHM-2026-00999' }),
    ]);
  });

  it('a base completa inclui o chamado atendido no prazo, para a ação conferir o alvo', () => {
    const a = chamado({ responseStartedAt: b('2026-09-08T11:00'), status: 'em atendimento' });
    const r = apurarComBase(entrada({ chamados: [a] }));
    expect(r.apuracao.i3.linhas).toEqual([]);
    expect(r.baseI3.get(a.id)).toMatchObject({ atraso: false });
  });
});

describe('busca pelo número (AC-8)', () => {
  it.each([
    ['CHM-2026-00123', true],
    ['chm-2026-00123', true],
    ['123', true],
    ['00123', true],
    ['12', false],
    ['CHM-2026-0012', false],
  ])('%s casa com CHM-2026-00123: %s', (digitado, esperado) => {
    expect(mesmoNumero('CHM-2026-00123', digitado)).toBe(esperado);
  });
});
