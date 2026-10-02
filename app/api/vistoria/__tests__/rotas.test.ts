import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As duas rotas da vistoria (spec 0012, AC-3, AC-6 e permissões): sem sessão
 * é 401, Solicitante é 403, sem campanha aberta o pacote é 409, e o corpo que
 * não é um lote é 400. O banco fica do lado de fora (mock no limite).
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const campanhaAberta = vi.hoisted(() => vi.fn());
const montarPacote = vi.hoisted(() => vi.fn());
const processarLote = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/vistoria/campanha', () => ({ campanhaAberta: () => campanhaAberta() }));
vi.mock('@/lib/vistoria/pacote', () => ({ montarPacote: (c: unknown) => montarPacote(c) }));
vi.mock('@/lib/vistoria/sincronizacao', () => ({
  processarLote: (ops: unknown, s: unknown) => processarLote(ops, s),
}));

import { GET as getPacote } from '../pacote/route';
import { POST as postSincronizar } from '../sincronizar/route';

const ID = '507f1f77bcf86cd799439011';
const post = (corpo: unknown) =>
  new Request('http://localhost/api/vistoria/sincronizar', {
    method: 'POST',
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ID, role: 'Técnico' };
});

describe('GET /api/vistoria/pacote', () => {
  it('sem sessão é 401', async () => {
    sessao.atual = null;
    expect((await getPacote()).status).toBe(401);
  });

  it('Solicitante é 403 e não monta pacote', async () => {
    sessao.atual = { userId: ID, role: 'Solicitante' };
    expect((await getPacote()).status).toBe(403);
    expect(montarPacote).not.toHaveBeenCalled();
  });

  it('sem campanha aberta é 409 com a mensagem', async () => {
    campanhaAberta.mockResolvedValueOnce(null);
    const r = await getPacote();
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'Nenhuma campanha aberta' });
  });

  it.each(['Técnico', 'Preposto', 'Admin'])('%s recebe o pacote', async (role) => {
    sessao.atual = { userId: ID, role };
    campanhaAberta.mockResolvedValueOnce({ id: 'c' });
    montarPacote.mockResolvedValueOnce({ ativos: [] });
    const r = await getPacote();
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('POST /api/vistoria/sincronizar', () => {
  it('sem sessão é 401 e Solicitante é 403, sem processar nada', async () => {
    sessao.atual = null;
    expect((await postSincronizar(post({ operacoes: [{}] }))).status).toBe(401);
    sessao.atual = { userId: ID, role: 'Solicitante' };
    expect((await postSincronizar(post({ operacoes: [{}] }))).status).toBe(403);
    expect(processarLote).not.toHaveBeenCalled();
  });

  it('corpo que não é lote é 400: JSON quebrado, sem operações, vazio ou mais de 50', async () => {
    for (const corpo of ['{', {}, { operacoes: [] }, { operacoes: Array(51).fill({}) }]) {
      expect((await postSincronizar(post(corpo))).status).toBe(400);
    }
    expect(processarLote).not.toHaveBeenCalled();
  });

  it('lote válido é 200, com o autor e o papel vindos da sessão', async () => {
    processarLote.mockResolvedValueOnce([{ clientOpId: 'x', estado: 'aceita' }]);
    const r = await postSincronizar(post({ operacoes: [{ clientOpId: 'x' }] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ resultados: [{ clientOpId: 'x', estado: 'aceita' }] });
    expect(processarLote).toHaveBeenCalledWith([{ clientOpId: 'x' }], {
      userId: ID,
      role: 'Técnico',
    });
  });

  it('erro inesperado é 500, para o aparelho manter tudo pendente', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    processarLote.mockRejectedValueOnce(new Error('caiu'));
    expect((await postSincronizar(post({ operacoes: [{}] }))).status).toBe(500);
  });
});
