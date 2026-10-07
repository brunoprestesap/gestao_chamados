// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));

const mockSair = vi.fn();
vi.mock('../../actions', () => ({
  deixarDeAcompanharAction: (...a: unknown[]) => mockSair(...a),
}));

import type { AcompanhamentoLido } from '../../_types';
import { PainelAcompanhamento } from '../PainelAcompanhamento';

/**
 * A vista de quem acompanha o chamado de outra pessoa (spec 0017): só leitura,
 * com os campos da spec, os marcos e o "Deixar de acompanhar".
 *
 * covers: AC-14, AC-16
 */

const CHAMADO = '6aad5286df6f201a25edf001';

const lido = (extra: Partial<AcompanhamentoLido> = {}): AcompanhamentoLido => ({
  chamadoId: CHAMADO,
  ticketNumber: 'CHM-2026-00001',
  rotuloServico: 'REPARO DE SPLIT',
  localExato: 'sala 205 norte',
  ativoCodigo: 'MNT-0001',
  situacao: 'Em atendimento',
  statusChave: 'em atendimento',
  abertoEm: '2026-10-01T12:00:00.000Z',
  acompanhaDesde: '2026-10-02T09:00:00.000Z',
  marcos: [
    { id: 'm1', rotulo: 'Aberto', em: '2026-10-01T12:00:00.000Z' },
    { id: 'm2', rotulo: 'Em atendimento', em: '2026-10-02T14:20:00.000Z' },
  ],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSair.mockResolvedValue({ ok: true });
});

describe('PainelAcompanhamento · a vista (AC-14)', () => {
  it('mostra número, status, serviço, local, equipamento e os marcos, e manda o foco ao título', () => {
    render(<PainelAcompanhamento acompanhamento={lido()} />);

    expect(screen.getByRole('heading', { level: 2, name: '#CHM-2026-00001' })).toHaveFocus();
    expect(screen.getByText('Você acompanha')).toBeInTheDocument();
    expect(screen.getByText('REPARO DE SPLIT')).toBeInTheDocument();
    expect(screen.getByText('sala 205 norte')).toBeInTheDocument();
    expect(screen.getByText('MNT-0001')).toBeInTheDocument();
    const marcos = screen.getByRole('list');
    expect(marcos.children).toHaveLength(2);
    expect(marcos).toHaveTextContent('Aberto');
  });

  it('não tem caixa de comentário nem nenhum campo de texto', () => {
    render(<PainelAcompanhamento acompanhamento={lido()} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('sem local e sem equipamento, essas linhas não aparecem', () => {
    render(
      <PainelAcompanhamento
        acompanhamento={lido({ localExato: null, ativoCodigo: null, marcos: [] })}
      />,
    );
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipamento')).not.toBeInTheDocument();
    expect(screen.getByText(/ainda não mudou de situação/i)).toBeInTheDocument();
  });
});

describe('PainelAcompanhamento · deixar de acompanhar (AC-16)', () => {
  it('grava a saída e volta para /conversas', async () => {
    const user = userEvent.setup();
    render(<PainelAcompanhamento acompanhamento={lido()} />);

    await user.click(screen.getByRole('button', { name: /deixar de acompanhar/i }));

    expect(mockSair).toHaveBeenCalledWith({ chamadoId: CHAMADO });
    expect(mockPush).toHaveBeenCalledWith('/conversas');
  });

  it('quem já tinha saído (`nao_encontrada`) também volta para /conversas', async () => {
    const user = userEvent.setup();
    mockSair.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });
    render(<PainelAcompanhamento acompanhamento={lido()} />);

    await user.click(screen.getByRole('button', { name: /deixar de acompanhar/i }));

    expect(mockPush).toHaveBeenCalledWith('/conversas');
  });

  it('falha mostra um alerta e mantém a pessoa na vista', async () => {
    const user = userEvent.setup();
    mockSair.mockResolvedValue({ ok: false, reason: 'erro' });
    render(<PainelAcompanhamento acompanhamento={lido()} />);

    await user.click(screen.getByRole('button', { name: /deixar de acompanhar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /não deu para deixar de acompanhar/i,
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /deixar de acompanhar/i })).toBeEnabled();
  });
});
