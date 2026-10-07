// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * O relatório na tela (spec 0016): cabeçalho do contrato, selos, resumo,
 * tabelas, vazios com "—" e a lista de emissões com o hash curto.
 *
 * covers: AC-4, AC-6, AC-8, AC-9, AC-11, AC-12, AC-14, AC-15, AC-19
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type {
  EmissaoRelatorioContrato,
  RelatorioContrato,
} from '@/shared/contratos/relatorio.types';

import { RelatorioContratoTela } from '../RelatorioContratoTela';

const H = 3600e3;
const sla = { dentro: 0, fora: 0, emAndamento: 0, semSla: 0 };

function dados(extra: Partial<RelatorioContrato> = {}): RelatorioContrato {
  return {
    contrato: {
      id: 'c1',
      numero: '12/2025',
      empresa: 'Refrigeração Amazônia',
      cnpjFormatado: '11.222.333/0001-81',
      processoSei: '0001234-56.2025',
      objeto: 'Manutenção de ar',
      fiscal: 'Fiscal Fulano',
      tiposServico: ['Ar-Condicionado'],
      vigenciaInicio: '2026-09-15',
      vigenciaFim: '2027-09-14',
      isActive: true,
    },
    janela: { inicio: '2026-09-15', fim: '2026-09-30', mes: '2026-09', parcial: false },
    geradoEm: '2026-10-07T15:04:00.000Z',
    geradoPorNome: 'Admin Teste',
    topo: {
      corretivosTotal: 3,
      corretivosSemAtivo: 1,
      corretivosComAtivo: 2,
      percentualComAtivo: 66.67,
      ativosAfetados: 1,
      mtbfMedioMs: 24 * H,
      mttrMedioMs: 4 * H,
      ativosReincidentes: 1,
      preventivasGeradas: 2,
      preventivasConcluidas: 1,
      sla: { dentro: 1, fora: 1, emAndamento: 0, semSla: 0, percentualDentro: 50 },
    },
    categorias: [
      {
        categoriaId: 'k',
        nome: 'Split',
        ativosNoEscopo: 12,
        ativosComChamado: 1,
        corretivos: 2,
        mttrMedioMs: 4 * H,
        reincidentes: 1,
        slaDentro: 1,
        slaFora: 1,
        preventivasGeradas: 2,
        preventivasConcluidas: 1,
      },
    ],
    ativos: [
      {
        ativoId: 'a1',
        codigo: '2001',
        descricao: 'Split 12k',
        categoriaId: 'k',
        categoria: 'Split',
        caminho: null,
        corretivos: 2,
        mtbfMs: 24 * H,
        mttrMs: 4 * H,
        corretivos90d: 3,
        reincidente: true,
        sla: { ...sla, dentro: 1, fora: 1 },
        preventivasGeradas: 2,
        preventivasConcluidas: 1,
      },
    ],
    ...extra,
  };
}

const HASH = 'ab12cd34ef56'.padEnd(64, '0');
const emissoes: EmissaoRelatorioContrato[] = [
  {
    id: 'e'.repeat(24),
    geradoEm: '2026-10-07T15:04:00.000Z',
    geradoPorNome: 'Admin Teste',
    hashSha256: HASH,
  },
];

describe('RelatorioContratoTela', () => {
  it('cabeçalho com intervalo real, CNPJ, fiscal e quem gerou em Belém (AC-6, AC-8)', () => {
    render(<RelatorioContratoTela dados={dados()} emissoes={[]} />);

    expect(screen.getByText('Período de 15/09/2026 a 30/09/2026')).toBeVisible();
    expect(screen.getByText('11.222.333/0001-81')).toBeVisible();
    expect(screen.getByText('Fiscal Fulano')).toBeVisible();
    expect(screen.getByText('07/10/2026 12:04 por Admin Teste')).toBeVisible();
    expect(screen.getByText('Indicadores informativos, sem efeito contratual')).toBeVisible();
    expect(screen.queryByText('Mês em andamento, números parciais')).not.toBeInTheDocument();
  });

  it('esconde objeto e fiscal vazios e marca o mês parcial e o contrato inativo (AC-4, AC-6)', () => {
    const d = dados();
    render(
      <RelatorioContratoTela
        dados={{
          ...d,
          contrato: { ...d.contrato, objeto: null, fiscal: null, isActive: false },
          janela: { ...d.janela, parcial: true },
        }}
        emissoes={[]}
      />,
    );

    expect(screen.queryByText('Fiscal')).not.toBeInTheDocument();
    expect(screen.queryByText('Objeto')).not.toBeInTheDocument();
    expect(screen.getByText('(inativo)')).toBeVisible();
    expect(screen.getByText('Mês em andamento, números parciais')).toBeVisible();
  });

  it('tabela por ativo liga o código à ficha e marca o reincidente (AC-12)', () => {
    render(<RelatorioContratoTela dados={dados()} emissoes={[]} />);

    expect(screen.getByRole('link', { name: '2001' })).toHaveAttribute('href', '/ativos/a1');
    const linha = screen.getByRole('link', { name: '2001' }).closest('tr')!;
    expect(within(linha).getByText('reincidente')).toBeVisible();
    expect(within(linha).getByText('—')).toBeVisible(); // local ausente
  });

  it('sem chamado, mostra o aviso no lugar das tabelas e "—" sem denominador (AC-14)', () => {
    const d = dados();
    render(
      <RelatorioContratoTela
        dados={{
          ...d,
          topo: {
            ...d.topo,
            corretivosTotal: 0,
            corretivosSemAtivo: 0,
            corretivosComAtivo: 0,
            percentualComAtivo: null,
            ativosAfetados: 0,
            mtbfMedioMs: null,
            mttrMedioMs: null,
            ativosReincidentes: 0,
            preventivasGeradas: 0,
            preventivasConcluidas: 0,
            sla: { ...sla, percentualDentro: null },
          },
          categorias: [],
          ativos: [],
        }}
        emissoes={[]}
      />,
    );

    expect(screen.getByText('Nenhum chamado deste contrato no período.')).toBeVisible();
    expect(screen.queryByText('Por ativo')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('lista as emissões com os 12 primeiros caracteres do hash e o inteiro no title (AC-19)', () => {
    render(<RelatorioContratoTela dados={dados()} emissoes={emissoes} />);

    const celula = screen.getByText('ab12cd34ef56…');
    expect(celula).toHaveAttribute('title', HASH);
    expect(screen.getByText('e'.repeat(24))).toBeVisible();
  });

  it('sem emissão, diz que nenhum PDF foi emitido', () => {
    render(<RelatorioContratoTela dados={dados()} emissoes={[]} />);
    expect(screen.getByText('Nenhum PDF emitido para este mês.')).toBeVisible();
  });

  it('oferece o botão de gerar o PDF', () => {
    render(<RelatorioContratoTela dados={dados()} emissoes={[]} />);
    expect(screen.getByRole('button', { name: 'Gerar PDF' })).toBeEnabled();
  });
});
