import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `GET /api/cotacoes/arquivos/[arquivoId]` (spec 0019, AC-15): o download
 * respeita a visão de quem pede e sai sempre como anexo, com `nosniff`.
 *
 * covers: AC-15
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const baixar = vi.hoisted(() => vi.fn());
const ler = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/material/arquivos', () => ({ arquivoParaBaixar: baixar }));
vi.mock('fs/promises', () => ({ default: { readFile: ler }, readFile: ler }));

import { GET } from '../route';

const params = (arquivoId = 'a'.repeat(24)) => ({ params: Promise.resolve({ arquivoId }) });
const req = () => new Request('http://localhost/api/cotacoes/arquivos/x');

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: 'u'.repeat(24), role: 'Técnico' };
  baixar.mockResolvedValue({
    ok: true,
    caminho: '/data/uploads/cotacoes/c/a.pdf',
    nomeOriginal: 'Orçamento Loja "1".pdf',
    mimeType: 'application/pdf',
  });
  ler.mockResolvedValue(Buffer.from('%PDF-1.4'));
});

describe('GET /api/cotacoes/arquivos/[arquivoId]', () => {
  it('sem sessão devolve 401', async () => {
    sessao.atual = null;
    expect((await GET(req(), params())).status).toBe(401);
    expect(baixar).not.toHaveBeenCalled();
  });

  it('quem não pode baixar recebe 403', async () => {
    baixar.mockResolvedValue({ ok: false, status: 403 });
    expect((await GET(req(), params())).status).toBe(403);
    expect(ler).not.toHaveBeenCalled();
  });

  it('arquivo inexistente devolve 404', async () => {
    baixar.mockResolvedValue({ ok: false, status: 404 });
    expect((await GET(req(), params())).status).toBe(404);
  });

  it('arquivo sumido do disco devolve 404', async () => {
    ler.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect((await GET(req(), params())).status).toBe(404);
  });

  it('entrega como anexo, com nosniff, sem cache e nome seguro', async () => {
    const r = await GET(req(), params());
    expect(r.status).toBe(200);
    const disp = r.headers.get('content-disposition') ?? '';
    expect(disp.startsWith('attachment;')).toBe(true);
    expect(disp).toContain("filename*=UTF-8''Or%C3%A7amento");
    expect(disp).not.toMatch(/filename="[^"]*"[^;]*"/);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-type')).toBe('application/pdf');
  });

  it('passa a sessão de quem pede para a checagem de visão', async () => {
    await GET(req(), params('b'.repeat(24)));
    expect(baixar).toHaveBeenCalledWith('b'.repeat(24), {
      userId: 'u'.repeat(24),
      role: 'Técnico',
    });
  });
});
