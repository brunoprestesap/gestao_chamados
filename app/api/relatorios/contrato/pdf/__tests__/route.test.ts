import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A rota do PDF do relatório por contrato (spec 0016). covers: AC-16, AC-18, AC-20 */

const m = vi.hoisted(() => ({
  verifySession: vi.fn(),
  gerarPdfContrato: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({
  verifySession: m.verifySession,
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/contratos/pdf/gerar', () => ({ gerarPdfContrato: m.gerarPdfContrato }));

import { POST } from '../route';

const ID = 'a'.repeat(24);

function pedido(corpo: unknown) {
  return new Request('http://localhost/api/relatorios/contrato/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

describe('POST /api/relatorios/contrato/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifySession.mockResolvedValue({ userId: 'u1', role: 'Admin' });
  });

  it('401 sem sessão e 403 para quem não é Admin, sem gerar nada', async () => {
    m.verifySession.mockResolvedValueOnce(null);
    expect((await POST(pedido({ contratoId: ID, mes: '2026-09' }))).status).toBe(401);
    m.verifySession.mockResolvedValueOnce({ userId: 'u2', role: 'Preposto' });
    expect((await POST(pedido({ contratoId: ID, mes: '2026-09' }))).status).toBe(403);
    expect(m.gerarPdfContrato).not.toHaveBeenCalled();
  });

  it('400 com corpo inválido', async () => {
    expect((await POST(pedido({ contratoId: 'x', mes: '2026-09' }))).status).toBe(400);
    expect((await POST(pedido('não é json'))).status).toBe(400);
    expect(m.gerarPdfContrato).not.toHaveBeenCalled();
  });

  it('repassa o status e a mensagem da geração (404, 422, 429, 500)', async () => {
    for (const status of [404, 422, 429, 500] as const) {
      m.gerarPdfContrato.mockResolvedValueOnce({ ok: false, status, error: `erro ${status}` });
      const r = await POST(pedido({ contratoId: ID, mes: '2026-09' }));
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ error: `erro ${status}` });
    }
  });

  it('devolve o PDF como anexo, com o usuário da sessão', async () => {
    m.gerarPdfContrato.mockResolvedValueOnce({
      ok: true,
      bytes: Buffer.from('%PDF-1.3'),
      nomeArquivo: 'relatorio-contrato-12-2025-2026-09.pdf',
      emissaoId: 'e1',
      hashSha256: 'h',
    });
    const r = await POST(pedido({ contratoId: ID, mes: '2026-09' }));
    expect(m.gerarPdfContrato).toHaveBeenCalledWith({
      contratoId: ID,
      mes: '2026-09',
      userId: 'u1',
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(r.headers.get('Content-Disposition')).toBe(
      'attachment; filename="relatorio-contrato-12-2025-2026-09.pdf"',
    );
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('%PDF-1.3');
  });
});
