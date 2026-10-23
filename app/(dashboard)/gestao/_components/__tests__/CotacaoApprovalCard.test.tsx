// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A cotação antiga no sheet da gestão (spec 0021, AC-17): fica num bloco
 * recolhido "Histórico: sistema anterior", que abre sozinho só quando há uma
 * cotação antiga `enviada` esperando aprovação.
 *
 * covers: AC-17
 */

vi.mock('@/app/(dashboard)/chamados-atribuidos/cotacao.actions', () => ({
  approveCotacaoAction: vi.fn(),
  rejectCotacaoAction: vi.fn(),
}));

import { CotacaoApprovalCard, type CotacaoDTO } from '../CotacaoApprovalCard';

const antiga = (status: CotacaoDTO['status'], id: string): CotacaoDTO => ({
  _id: id,
  status,
  valorEstimado: 150,
  descricao: 'Troca do compressor',
  prazoEntregaDias: 5,
  observacoes: null,
  anexoId: null,
  submittedByUserId: 'u1',
  submittedByName: 'Técnico',
  submittedAt: '2026-09-01T12:00:00Z',
  reviewedByUserId: null,
  reviewedByName: null,
  reviewedAt: null,
  reviewObservacao: null,
  createdAt: '2026-09-01T12:00:00Z',
});

describe('CotacaoApprovalCard · recolhido (spec 0021, AC-17)', () => {
  const fetchMock = vi.fn();
  const responder = (corpo: unknown) =>
    fetchMock.mockResolvedValue({ ok: true, json: async () => corpo });

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('abre sozinho com uma cotação antiga enviada esperando aprovação', async () => {
    // Arrange
    const enviada = antiga('enviada', 'a1');
    responder({ active: enviada, history: [enviada] });

    // Act
    render(<CotacaoApprovalCard ticketId="ch1" canReview recolhido />);

    // Assert
    const resumo = await screen.findByText('Histórico: sistema anterior');
    const bloco = resumo.closest('details');
    expect(bloco).toHaveAttribute('open');
    expect(bloco).toHaveTextContent('uma esperando aprovação');
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
  });

  it('fica recolhido quando só há cotações antigas já decididas', async () => {
    // Arrange
    responder({ active: null, history: [antiga('aprovada', 'a1'), antiga('recusada', 'a2')] });

    // Act
    render(<CotacaoApprovalCard ticketId="ch1" canReview recolhido />);

    // Assert
    const resumo = await screen.findByText('Histórico: sistema anterior');
    const bloco = resumo.closest('details');
    expect(bloco).not.toHaveAttribute('open');
    expect(bloco).toHaveTextContent('2 cotações');
  });

  it('sem cotação antiga, não mostra nada', async () => {
    // Arrange
    responder({ active: null, history: [] });

    // Act
    const { container } = render(<CotacaoApprovalCard ticketId="ch1" canReview recolhido />);

    // Assert
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
