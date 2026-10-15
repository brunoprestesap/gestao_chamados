import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `GET /api/chamados/[id]/cotacao-material` (spec 0019): o cartão do chamado
 * pela visão de quem lê.
 *
 * covers: AC-15
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const cartao = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/material/leitura', () => ({ cartaoDoChamado: cartao }));

import { GET } from '../route';

const params = () => ({ params: Promise.resolve({ id: 'c'.repeat(24) }) });
const req = () => new Request('http://localhost/api/chamados/x/cotacao-material');

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: 'u'.repeat(24), role: 'Solicitante' };
});

describe('GET /api/chamados/[id]/cotacao-material', () => {
  it('sem sessão devolve 401', async () => {
    sessao.atual = null;
    expect((await GET(req(), params())).status).toBe(401);
  });

  it('quem não tem relação com o chamado recebe 403', async () => {
    cartao.mockResolvedValue(null);
    expect((await GET(req(), params())).status).toBe(403);
  });

  it('devolve o cartão sem cache', async () => {
    cartao.mockResolvedValue({ cotacao: null, acoes: null, podeCriar: false });
    const r = await GET(req(), params());
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(cartao).toHaveBeenCalledWith('c'.repeat(24), {
      userId: 'u'.repeat(24),
      role: 'Solicitante',
    });
  });

  it('erro inesperado responde 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cartao.mockRejectedValue(new Error('x'));
    expect((await GET(req(), params())).status).toBe(500);
  });
});
