// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O pré-preenchimento da prioridade sugerida pela IA, com o rótulo "Sugestão
 * da IA" (spec 0007, AC-8). `chamado.tipoServico` fica vazio nos fixtures
 * para não entrar na cascata de catálogo (tipo → subtipo → serviço), que é
 * comportamento anterior à fatia 0007 e não muda aqui.
 */

vi.mock('@/app/(dashboard)/gestao/actions', () => ({
  classificarChamadoAction: vi.fn(),
}));

import type { ChamadoDTO } from '../../../meus-chamados/_components/ChamadoCard';
import { ClassificarChamadoDialog } from '../ClassificarChamadoDialog';

const CHAMADO_ID = 'a'.repeat(24);

function chamado(overrides: Partial<ChamadoDTO> = {}): ChamadoDTO {
  return {
    _id: CHAMADO_ID,
    ticket_number: 'CHM-2026-00001',
    titulo: 'Lâmpada queimada',
    descricao: 'A lâmpada da sala 302 queimou.',
    status: 'aberto',
    solicitanteId: null,
    unitId: null,
    localExato: 'Sala 302',
    tipoServico: '',
    naturezaAtendimento: 'Padrão',
    grauUrgencia: 'Normal',
    telefoneContato: '',
    subtypeId: null,
    catalogServiceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockFetchComSugestao(prioridade: string | null) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/decisao-prioridade')) {
      return {
        ok: true,
        json: async () => ({ sugestao: prioridade ? { prioridade } : null }),
      } as Response;
    }
    if (url.includes('/api/session')) {
      return { ok: true, json: async () => ({ role: 'Preposto' }) } as Response;
    }
    // /api/units, /api/sla/configs, /recorrencia
    return { ok: true, json: async () => ({ items: [] }) } as Response;
  });
}

describe('ClassificarChamadoDialog · sugestão de prioridade da IA (AC-8)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchComSugestao(null));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem sugestão da IA: não mostra o rótulo "Sugestão da IA"', async () => {
    render(
      <ClassificarChamadoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText('Sugestão da IA')).not.toBeInTheDocument();
  });

  it('com sugestão da IA: mostra o rótulo "Sugestão da IA" ao lado do campo', async () => {
    vi.stubGlobal('fetch', mockFetchComSugestao('ALTA'));

    render(
      <ClassificarChamadoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    expect(await screen.findByText('Sugestão da IA')).toBeInTheDocument();
  });

  it('com sugestão da IA: o campo Prioridade Final já vem com o valor sugerido', async () => {
    vi.stubGlobal('fetch', mockFetchComSugestao('ALTA'));

    render(
      <ClassificarChamadoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByText('Sugestão da IA');
    expect(screen.getByLabelText(/Prioridade Final/)).toHaveTextContent('Alta');
  });

  it('escolha do Preposto antes de a sugestão chegar não é trocada pela sugestão', async () => {
    // O Radix Select usa APIs de ponteiro e rolagem que o jsdom não tem.
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();

    let entregarSugestao: (r: Response) => void = () => undefined;
    const sugestaoPendente = new Promise<Response>((resolve) => {
      entregarSugestao = resolve;
    });
    const base = mockFetchComSugestao(null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/decisao-prioridade') ? sugestaoPendente : base(input),
      ),
    );
    const user = userEvent.setup();

    render(
      <ClassificarChamadoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    const campo = screen.getByLabelText(/Prioridade Final/);
    await user.click(campo);
    await user.click(await screen.findByRole('option', { name: 'Baixa' }));
    expect(campo).toHaveTextContent('Baixa');

    let sugestaoEntregue = false;
    entregarSugestao({
      ok: true,
      json: async () => {
        sugestaoEntregue = true;
        return { sugestao: { prioridade: 'ALTA' } };
      },
    } as Response);

    // A sugestão chegou, mas o valor é a escolha do Preposto: o rótulo não
    // aparece, porque não descreve o que está no campo.
    await waitFor(() => expect(sugestaoEntregue).toBe(true));
    // Deixa o resto do carregamento (setState da sugestão) terminar.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByLabelText(/Prioridade Final/)).toHaveTextContent('Baixa');
    expect(screen.queryByText('Sugestão da IA')).not.toBeInTheDocument();
  });

  it('o rótulo some quando o Preposto troca a prioridade sugerida', async () => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', mockFetchComSugestao('ALTA'));
    const user = userEvent.setup();

    render(
      <ClassificarChamadoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByText('Sugestão da IA');
    await user.click(screen.getByLabelText(/Prioridade Final/));
    await user.click(await screen.findByRole('option', { name: 'Normal' }));

    expect(screen.queryByText('Sugestão da IA')).not.toBeInTheDocument();
  });

  it('busca a sugestão pelo id do chamado certo', async () => {
    const fetchMock = mockFetchComSugestao('EMERGENCIAL');
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ClassificarChamadoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByText('Sugestão da IA');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/gestao/chamados/${CHAMADO_ID}/decisao-prioridade`),
      expect.any(Object),
    );
  });

  it('fechado (open=false): não busca a sugestão', () => {
    const fetchMock = mockFetchComSugestao('ALTA');
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ClassificarChamadoDialog
        open={false}
        onOpenChange={vi.fn()}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
