// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Abrir chamado deste ativo" (spec 0011, AC-15): `/meus-chamados?ativo=<id>`
 * busca o ativo pelas regras do seletor, abre o formulário com ele uma vez só
 * e tira o parâmetro da URL. Ativo que não pode receber chamado só avisa.
 */

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/(dashboard)/meus-chamados/_components/NewTicketDialog', () => ({
  NewTicketDialog: (p: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    ativoInicial?: { codigo: string } | null;
  }) =>
    p.open ? (
      <div role="dialog" aria-label="Novo chamado">
        <span>equipamento: {p.ativoInicial?.codigo ?? 'nenhum'}</span>
        <button onClick={() => p.onOpenChange(false)}>Fechar</button>
      </div>
    ) : null,
}));
vi.mock('@/app/(dashboard)/gestao/_components/ChamadoDetailSheet', () => ({
  ChamadoDetailSheet: () => null,
}));
vi.mock('@/app/(dashboard)/meus-chamados/_components/AvaliarChamadoDialog', () => ({
  AvaliarChamadoDialog: () => null,
}));
vi.mock('@/app/(dashboard)/meus-chamados/_components/RecusarServicoDialog', () => ({
  RecusarServicoDialog: () => null,
}));
vi.mock('@/app/(dashboard)/meus-chamados/[id]/_components/CancelTicketDialog', () => ({
  CancelTicketDialog: () => null,
}));

import MeusChamadosPage from '../page';

const ATIVO_ID = 'a'.repeat(24);
let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function abrirEm(url: string) {
  window.history.replaceState(null, '', url);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/session')) return json({ role: 'Solicitante', userId: 'eu' });
    if (url.startsWith('/api/meus-chamados'))
      return json({ items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    if (url.startsWith(`/api/ativos/${ATIVO_ID}`))
      return json({ item: { id: ATIVO_ID, codigo: '11997' } });
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  abrirEm('/');
});

describe('/meus-chamados?ativo=', () => {
  it('abre o formulário com o equipamento e tira o parâmetro da URL', async () => {
    abrirEm(`/meus-chamados?ativo=${ATIVO_ID}&outro=1`);
    render(<MeusChamadosPage />);
    expect(await screen.findByText('equipamento: 11997')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/ativos/${ATIVO_ID}`, { cache: 'no-store' });
    expect(window.location.search).toBe('?outro=1');
  });

  it('ativo que não pode receber chamado avisa e não abre o formulário', async () => {
    abrirEm('/meus-chamados?ativo=baixado');
    render(<MeusChamadosPage />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Este equipamento não pode receber chamado.'),
    );
    expect(screen.queryByRole('dialog', { name: 'Novo chamado' })).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('falha de rede avisa sem quebrar a tela', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/ativos')
        ? Promise.reject(new TypeError('offline'))
        : json({ items: [] }),
    );
    abrirEm(`/meus-chamados?ativo=${ATIVO_ID}`);
    render(<MeusChamadosPage />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Não foi possível carregar o equipamento.'),
    );
  });

  it('sem o parâmetro, não busca ativo nem abre o formulário', async () => {
    abrirEm('/meus-chamados');
    render(<MeusChamadosPage />);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/session', { cache: 'no-store' }),
    );
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/ativos'))).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Novo chamado' })).not.toBeInTheDocument();
  });

  it('fechar o formulário esquece o equipamento: o próximo "Novo Chamado" abre limpo', async () => {
    const user = userEvent.setup();
    abrirEm(`/meus-chamados?ativo=${ATIVO_ID}`);
    render(<MeusChamadosPage />);
    await screen.findByText('equipamento: 11997');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getAllByRole('button', { name: /Novo Chamado/ })[0]);
    expect(await screen.findByText('equipamento: nenhum')).toBeInTheDocument();
  });
});
