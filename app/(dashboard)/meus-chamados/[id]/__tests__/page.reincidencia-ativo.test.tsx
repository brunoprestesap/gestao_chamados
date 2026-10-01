// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "O problema voltou" herda o equipamento do chamado encerrado (spec 0011,
 * AC-15), mas só se ele ainda passa nas regras do seletor: `/api/ativos/[id]`
 * devolve 404 para `baixado` ou Tier C/D, e aí o formulário abre sem ativo.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/config/expediente-provider', () => ({
  useInstitutionalTimezone: () => 'America/Belem',
}));
vi.mock('@/app/(dashboard)/meus-chamados/_components/NewTicketDialog', () => ({
  NewTicketDialog: (p: {
    open: boolean;
    ativoInicial?: { codigo: string } | null;
    reincidencia?: unknown;
  }) => (
    <div data-testid="reincidencia" data-open={String(p.open)}>
      equipamento herdado: {p.ativoInicial?.codigo ?? 'nenhum'}
    </div>
  ),
}));
for (const [mod, nome] of [
  ['@/app/(dashboard)/gestao/_components/CotacaoApprovalCard', 'CotacaoApprovalCard'],
  ['@/app/(dashboard)/gestao/_components/ReatribuirChamadoDialog', 'ReatribuirChamadoDialog'],
  ['@/app/(dashboard)/meus-chamados/_components/AvaliarChamadoDialog', 'AvaliarChamadoDialog'],
  ['@/app/(dashboard)/meus-chamados/_components/RecusarServicoDialog', 'RecusarServicoDialog'],
  ['@/app/(dashboard)/meus-chamados/[id]/_components/AttachmentGallery', 'AttachmentGallery'],
  ['@/app/(dashboard)/meus-chamados/[id]/_components/CancelTicketDialog', 'CancelTicketDialog'],
  ['@/app/(dashboard)/meus-chamados/[id]/_components/CommentThread', 'CommentThread'],
  ['@/app/(dashboard)/meus-chamados/[id]/_components/HistoryTimeline', 'HistoryTimeline'],
] as const) {
  vi.doMock(mod, () => ({ [nome]: () => null }));
}

const CHAMADO = 'c'.repeat(24);
const ATIVO = 'a'.repeat(24);
let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function chamado(campos: Record<string, unknown> = {}) {
  return {
    _id: CHAMADO,
    ticket_number: 'CHM-1',
    titulo: 'Split pingando',
    descricao: 'x',
    status: 'encerrado',
    solicitanteId: 'eu',
    unitId: 'u1',
    localExato: 'Sala 302',
    tipoServico: 'Ar-Condicionado',
    naturezaAtendimento: 'Padrão',
    grauUrgencia: 'Normal',
    telefoneContato: '',
    subtypeId: null,
    catalogServiceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ativo: { id: ATIVO, codigo: '11997', descricao: 'Split' },
    ...campos,
  };
}

function servir(item: Record<string, unknown>, ativoStatus = 200) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith(`/api/meus-chamados/${CHAMADO}`)) return json({ item });
    if (url.startsWith('/api/session')) return json({ role: 'Solicitante', userId: 'eu' });
    if (url.startsWith(`/api/ativos/${ATIVO}`))
      return ativoStatus === 200
        ? json({ item: { id: ATIVO, codigo: '11997' } })
        : json({}, ativoStatus);
    return json({ items: [] });
  });
}

async function montar() {
  const { default: Pagina } = await import('../page');
  render(<Pagina params={Promise.resolve({ id: CHAMADO })} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('reincidência com equipamento', () => {
  it('herda o equipamento que ainda pode receber chamado', async () => {
    servir(chamado());
    await montar();
    expect(await screen.findByText('equipamento herdado: 11997')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/ativos/${ATIVO}`, { cache: 'no-store' });
  });

  it('não herda equipamento baixado ou Tier C/D (a rota devolve 404)', async () => {
    servir(chamado(), 404);
    await montar();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/ativos/${ATIVO}`, { cache: 'no-store' }),
    );
    // Deixa a resposta 404 chegar e ser processada antes de olhar.
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByTestId('reincidencia')).toHaveTextContent('equipamento herdado: nenhum');
  });

  it('chamado sem equipamento não consulta ativo', async () => {
    servir(chamado({ ativo: null }));
    await montar();
    await screen.findByTestId('reincidencia');
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/ativos'))).toBe(false);
  });

  it('chamado ainda aberto não oferece reincidência nem consulta ativo', async () => {
    servir(chamado({ status: 'em atendimento' }));
    await montar();
    await screen.findByText('Split pingando');
    expect(screen.queryByTestId('reincidencia')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/ativos'))).toBe(false);
  });

  it('mostra o equipamento do chamado com link para a ficha', async () => {
    servir(chamado({ status: 'em atendimento' }));
    await montar();
    expect(await screen.findByRole('link', { name: '11997' })).toHaveAttribute(
      'href',
      `/ativos/${ATIVO}`,
    );
  });
});
