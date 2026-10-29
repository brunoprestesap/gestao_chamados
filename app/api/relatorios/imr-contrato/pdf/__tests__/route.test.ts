import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A rota do PDF do fechamento do IMR do contrato (spec 0023). covers: AC-13, AC-14 */

const m = vi.hoisted(() => ({
  verifySession: vi.fn(),
  gerarPdfImr: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: m.verifySession }));
vi.mock('@/lib/imr-contrato/pdf/gerar', () => ({ gerarPdfImr: m.gerarPdfImr }));

import { POST } from '../route';

const ID = 'a'.repeat(24);

function pedido(corpo: unknown) {
  return new Request('http://localhost/api/relatorios/imr-contrato/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

describe('POST /api/relatorios/imr-contrato/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifySession.mockResolvedValue({ userId: 'u1', role: 'Admin' });
  });

  it('401 sem sessão, sem gerar nada', async () => {
    m.verifySession.mockResolvedValueOnce(null);
    expect((await POST(pedido({ contratoId: ID, competencia: '2026-10' }))).status).toBe(401);
    expect(m.gerarPdfImr).not.toHaveBeenCalled();
  });

  it('400 com corpo inválido', async () => {
    expect((await POST(pedido({ contratoId: 'x', competencia: '2026-10' }))).status).toBe(400);
    expect((await POST(pedido({ contratoId: ID, competencia: '2026-13' }))).status).toBe(400);
    expect((await POST(pedido('não é json'))).status).toBe(400);
    expect(m.gerarPdfImr).not.toHaveBeenCalled();
  });

  it('repassa o status e a mensagem da geração (403, 409, 429, 500)', async () => {
    for (const status of [403, 409, 429, 500] as const) {
      m.gerarPdfImr.mockResolvedValueOnce({ ok: false, status, error: `erro ${status}` });
      const r = await POST(pedido({ contratoId: ID, competencia: '2026-10' }));
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ error: `erro ${status}` });
    }
  });

  it('devolve o PDF como anexo, com a sessão', async () => {
    m.gerarPdfImr.mockResolvedValueOnce({
      ok: true,
      bytes: Buffer.from('%PDF-1.3'),
      nomeArquivo: 'imr-contrato-12-2025-2026-10-v1.pdf',
      emissaoId: 'e1',
      sha256: 'h',
    });
    const r = await POST(pedido({ contratoId: ID, competencia: '2026-10' }));
    expect(m.gerarPdfImr).toHaveBeenCalledWith({
      contratoId: ID,
      competencia: '2026-10',
      sessao: { userId: 'u1', role: 'Admin' },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(r.headers.get('Content-Disposition')).toBe(
      'attachment; filename="imr-contrato-12-2025-2026-10-v1.pdf"',
    );
    expect(r.headers.get('X-Emissao-Id')).toBe('e1');
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('%PDF-1.3');
  });
});
