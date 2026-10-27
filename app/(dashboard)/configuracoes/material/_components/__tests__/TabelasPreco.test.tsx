// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A revisão da importação do Anexo V e do SINAPI (spec 0021, fatia 7): os
 * resumos Novos, Alterados e Removidos viram filtros, e nos alterados o valor
 * antigo aparece riscado ao lado do novo. Sem "caminho 1" nem "caminho 2".
 *
 * covers: AC-22
 */

const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../actions', () => ({
  aplicarImportacaoAction: vi.fn(),
  corrigirCodigoSinapiAction: vi.fn(),
  descartarImportacaoAction: vi.fn(),
  marcarAnomaliaAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('sonner', () => ({ toast: m.toast }));

import type { ImportacaoAberta, TabelasPreco } from '@/lib/material/tabelas';

import { AbaAnexoV, AbaSinapi } from '../TabelasPreco';

const aberta: ImportacaoAberta = {
  id: 'i1',
  tipo: 'anexo_v',
  estado: 'pendente',
  arquivoNome: 'anexo-v-aditivo-2.csv',
  contratoNumero: '18/2025',
  referencia: null,
  versaoBase: 1,
  comparadoCom: null,
  resumo: { total: 20, novos: 1, alterados: 1, removidos: 1 },
  revisao: {
    novos: [{ chave: '200', descricao: 'Fita isolante' }],
    alterados: [
      {
        chave: '214',
        descricao: 'Gás refrigerante R-410A',
        mudancas: [{ campo: 'precoCentavos', antes: 1_380_00, depois: 1_412_00 }],
      },
    ],
    removidos: [{ chave: '9', descricao: 'Lâmpada incandescente' }],
  },
  enviadaPor: 'Admin',
  criadaEm: '2026-10-20T12:00:00.000Z',
  expiraEm: '2026-10-27T12:00:00.000Z',
};

const base: TabelasPreco = {
  contratos: [],
  meses: [],
  mesMaisRecente: null,
  percentualSinapi: 10,
  abertas: [aberta],
};

beforeEach(() => vi.clearAllMocks());

describe('revisão da importação', () => {
  it('abre nos alterados, com o valor antigo riscado ao lado do novo', () => {
    render(<AbaAnexoV tabelas={base} contratosSemAnexo={[]} itensSemCodigo={[]} />);

    const filtros = screen.getByRole('group', { name: 'Grupos da revisão' });
    expect(within(filtros).getByRole('button', { name: /Alterados/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const linha = screen.getByRole('row', { name: /Gás refrigerante/ });
    expect(within(linha).getByText('R$ 1.380,00').tagName).toBe('DEL');
    expect(linha).toHaveTextContent('Preço de R$ 1.380,00 → para R$ 1.412,00');
  });

  it('os resumos filtram a tabela: removidos mostram o que sai da versão nova', async () => {
    const user = userEvent.setup();
    render(<AbaAnexoV tabelas={base} contratosSemAnexo={[]} itensSemCodigo={[]} />);

    await user.click(screen.getByRole('button', { name: /Saem da versão nova/ }));

    expect(screen.getByRole('row', { name: /Lâmpada incandescente/ })).toHaveTextContent(
      'sai da versão nova',
    );
    expect(screen.queryByRole('row', { name: /Gás refrigerante/ })).not.toBeInTheDocument();
  });

  it('avisa o contrato sem Anexo V e o SINAPI atrasado, sem falar em caminho', () => {
    const { container } = render(
      <>
        <AbaAnexoV
          tabelas={{ ...base, abertas: [] }}
          contratosSemAnexo={['CT-9']}
          itensSemCodigo={[]}
        />
        <AbaSinapi tabelas={{ ...base, abertas: [], mesMaisRecente: '2020-01' }} atrasado />
      </>,
    );

    expect(
      screen.getByText(
        'O contrato CT-9 não tem Anexo V carregado: a busca não oferece os itens dele.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('O SINAPI está atrasado: o mês mais recente importado é 01/2020.'),
    ).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/caminho [12]/);
  });

  it('no SINAPI, o terceiro resumo é "Fora deste mês" e mostra o que não está no mês', async () => {
    const user = userEvent.setup();
    const sinapi: ImportacaoAberta = {
      ...aberta,
      id: 'i2',
      tipo: 'sinapi',
      contratoNumero: null,
      referencia: '2026-09',
      versaoBase: null,
      comparadoCom: '2026-08',
      resumo: { total: 2, novos: 1, alterados: 0, removidos: 1 },
      revisao: {
        novos: [{ chave: '39408', descricao: 'Gás refrigerante R-410A' }],
        alterados: [],
        removidos: [{ chave: '300', descricao: 'Lâmpada fluorescente' }],
      },
    };
    render(<AbaSinapi tabelas={{ ...base, abertas: [sinapi] }} atrasado={false} />);

    const filtros = screen.getByRole('group', { name: 'Grupos da revisão' });
    expect(within(filtros).getByRole('button', { name: /Novos/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('row', { name: /Gás refrigerante/ })).toHaveTextContent(
      'novo neste mês',
    );

    await user.click(within(filtros).getByRole('button', { name: /Fora deste mês/ }));

    expect(screen.getByRole('row', { name: /Lâmpada fluorescente/ })).toHaveTextContent(
      'não está neste mês',
    );
    expect(screen.queryByRole('button', { name: /Saem da versão nova/ })).not.toBeInTheDocument();
  });
});
