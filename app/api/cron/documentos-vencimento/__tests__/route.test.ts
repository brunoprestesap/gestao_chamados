import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A rota lê `CRON_SECRET` no topo do módulo; cada teste reimporta com o
 * ambiente que precisa, como os outros crons.
 *
 * covers: AC-11 (autorização e formato do relatório)
 */

const SEGREDO = 'segredo-do-cron';
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

function requisicao(segredo: string | null): Request {
  const headers = new Headers();
  if (segredo !== null) headers.set('x-cron-secret', segredo);
  return new Request('http://localhost/api/cron/documentos-vencimento', {
    method: 'POST',
    headers,
  });
}

async function carregar(
  processar = vi.fn().mockResolvedValue({ avaliados: 3, avisados: 1, erros: 0 }),
) {
  vi.doMock('@/lib/ativos/documentos/alerta-job', () => ({ processarVencimentos: processar }));
  const { POST } = await import('../route');
  return { POST, processar };
}

describe('POST /api/cron/documentos-vencimento', () => {
  it('com CRON_SECRET vazio recusa tudo, mesmo com header vazio', async () => {
    process.env.CRON_SECRET = '';
    const { POST, processar } = await carregar();
    expect((await POST(requisicao(''))).status).toBe(401);
    expect(processar).not.toHaveBeenCalled();
  });

  it('sem header ou com segredo errado responde 401', async () => {
    process.env.CRON_SECRET = SEGREDO;
    const { POST, processar } = await carregar();
    expect((await POST(requisicao(null))).status).toBe(401);
    expect((await POST(requisicao('outro'))).status).toBe(401);
    expect(processar).not.toHaveBeenCalled();
  });

  it('com o segredo certo roda o job e devolve o relatório', async () => {
    process.env.CRON_SECRET = SEGREDO;
    const { POST } = await carregar();
    const r = await POST(requisicao(SEGREDO));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ avaliados: 3, avisados: 1, erros: 0 });
  });

  it('falha do job responde 500 com a mensagem', async () => {
    process.env.CRON_SECRET = SEGREDO;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await carregar(vi.fn().mockRejectedValue(new Error('mongo caiu')));
    const r = await POST(requisicao(SEGREDO));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'mongo caiu' });
  });
});
