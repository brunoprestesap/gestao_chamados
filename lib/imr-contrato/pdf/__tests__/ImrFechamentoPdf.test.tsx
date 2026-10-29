import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';

import type { FechamentoLido, LinhaI3, LinhaI4 } from '@/shared/imr-contrato/imr-contrato.types';

import { ImrFechamentoPdf } from '../ImrFechamentoPdf';

/**
 * O PDF do fechamento renderizado de verdade (spec 0023, AC-13, AC-17): A4
 * paisagem, resumo e as duas tabelas em páginas próprias, a página das
 * marcações fora da base só quando há alguma, e a tabela grande quebrando em
 * várias páginas. O texto vem comprimido: o teste confere tamanho e páginas.
 *
 * covers: AC-13, AC-16, AC-17
 */

const d = (iso: string) => new Date(iso);

function linhaI3(i: number): LinhaI3 {
  return {
    chamadoId: String(i),
    ticketNumber: `CHM-2026-${String(i).padStart(5, '0')}`,
    solicitanteNome: 'Maria Souza',
    setor: 'Secretaria',
    solicitadoEm: d('2026-10-05T12:00:00.000Z'),
    descricao: 'Troca de lâmpada no corredor',
    iniciadoEm: i % 2 ? null : d('2026-10-07T12:00:00.000Z'),
    tempoAteInicioMin: i % 2 ? null : 2880,
    prazo: d('2026-10-06T21:00:00.000Z'),
    atraso: true,
    situacao: i === 1 ? 'desconsiderada' : 'atraso',
    marcacao:
      i === 1
        ? {
            motivo: 'Chamado duplicado.',
            porNome: 'Fiscal',
            papel: 'fiscal',
            em: d('2026-11-01T12:00:00.000Z'),
          }
        : null,
    desconsideracao: null,
    naoAtendimento: null,
  };
}

function linhaI4(i: number): LinhaI4 {
  return {
    cotacaoId: String(i),
    numero: `COT-2026-${i}`,
    chamadoTicketNumber: 'CHM-2026-00009',
    autorizadoEm: d('2026-10-01T12:00:00.000Z'),
    prazo: d('2026-10-08T21:00:00.000Z'),
    prazoEstimado: i === 0,
    executadoEm: null,
    atraso: true,
    situacao: 'atraso',
    marcacao: null,
    desconsideracao: null,
    naoAtendimento: null,
  };
}

const contagens = { noPrazo: 3, aguardandoPrazo: 0, desconsideradas: 1, zeradoPorMarcacao: false };

function foto(qtdI3: number, extra: Partial<FechamentoLido> = {}): FechamentoLido {
  return {
    id: 'f1',
    contratoId: 'c1',
    competencia: '2026-10',
    versao: 1,
    i1: { pontos: 40, observacao: null },
    i2: { pontos: 18, observacao: 'Faltou um uniforme.' },
    i3: {
      ...contagens,
      pontos: 0,
      ocorrencias: Math.max(qtdI3 - 1, 0),
      base: qtdI3 + 3,
      semRegistroDeInicio: 1,
      linhas: Array.from({ length: qtdI3 }, (_, i) => linhaI3(i)),
    },
    i4: {
      ...contagens,
      pontos: 15,
      ocorrencias: 1,
      base: 4,
      prazosEstimados: 1,
      linhas: [linhaI4(0)],
    },
    marcacoesForaDaBase: [],
    total: 73,
    faixa: { fator: 0.97, percentual: 97 },
    reincidenciaZero: [3],
    reincidenciaAvaliada: true,
    parametros: {
      prazoFornecimentoDiasUteis: 5,
      expediente: { dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00', fuso: 'America/Belem' },
      feriados: ['2026-10-12'],
      tiposServico: ['Manutenção Predial'],
      vigencia: { inicio: '2026-01-01', fim: '2027-02-28' },
    },
    contratoNumero: '12/2025',
    fechadoPorNome: 'Fiscal Teste',
    papel: 'fiscal',
    fechadoEm: d('2026-11-03T13:00:00.000Z'),
    ...extra,
  };
}

async function pdf(f: FechamentoLido) {
  const bytes = await renderToBuffer(
    <ImrFechamentoPdf
      foto={f}
      reincidencia={{ avaliada: true, zerados: [3] }}
      emissaoId={'e'.repeat(24)}
      geradoEm="04/11/2026 09:00"
      geradoPorNome="Admin"
    />,
  );
  const texto = bytes.toString('latin1');
  return { texto, paginas: (texto.match(/\/Type \/Page\b/g) ?? []).length };
}

describe('ImrFechamentoPdf', () => {
  it('é um PDF A4 paisagem com título nos metadados', async () => {
    const { texto } = await pdf(foto(2));
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect(texto).toMatch(/\/MediaBox \[0 0 841\.89\d* 595\.28\d*\]/);
    expect(texto).toMatch(/\/Title/);
  });

  it('resumo, indicador 3 e indicador 4 em três páginas, mesmo sem ocorrência', async () => {
    expect((await pdf(foto(0))).paginas).toBe(3);
    expect((await pdf(foto(3))).paginas).toBe(3);
  });

  it('as marcações fora da base ganham uma página própria', async () => {
    const f = foto(2, {
      marcacoesForaDaBase: [
        {
          indicador: 3,
          alvoId: 'x',
          alvoNumero: 'CHM-2026-00099',
          tipo: 'nao_atendimento',
          motivo: 'O técnico não compareceu.',
          porNome: 'Gestor',
          papel: 'gestor',
          em: d('2026-11-01T12:00:00.000Z'),
        },
      ],
    });
    expect((await pdf(f)).paginas).toBe(4);
  });

  it('com muitas ocorrências, a tabela do indicador 3 quebra em várias páginas', async () => {
    expect((await pdf(foto(80))).paginas).toBeGreaterThan(4);
  });
}, 60000);
