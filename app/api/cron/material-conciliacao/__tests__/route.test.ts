import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /api/cron/material-conciliacao` (spec 0019, AC-8): só o cron com o
 * segredo roda a conciliação das reservas de empenho.
 *
 * covers: AC-8
 */

const conciliar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/material/saldo', () => ({ conciliarReservas: conciliar }));
const encerrar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/material/chamado', () => ({ cancelarCotacoesDeChamadosEncerrados: encerrar }));

import { GET, POST } from '../route';

const SEGREDO = 'segredo-do-cron';
const original = process.env.CRON_SECRET;

function requisicao(segredo: string | null, method = 'POST'): Request {
  const headers = new Headers();
  if (segredo !== null) headers.set('x-cron-secret', segredo);
  return new Request('http://localhost/api/cron/material-conciliacao', { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SEGREDO;
  conciliar.mockResolvedValue({ verificadas: 4, liberadas: 1 });
  encerrar.mockResolvedValue({ verificadas: 2, canceladas: 2 });
});

afterEach(() => {
  process.env.CRON_SECRET = original;
});

describe('POST /api/cron/material-conciliacao', () => {
  it('com CRON_SECRET vazio recusa tudo, mesmo com header vazio', async () => {
    process.env.CRON_SECRET = '';
    expect((await POST(requisicao(''))).status).toBe(401);
    expect(conciliar).not.toHaveBeenCalled();
  });

  it('sem header ou com segredo errado responde 401', async () => {
    expect((await POST(requisicao(null))).status).toBe(401);
    expect((await POST(requisicao('outro'))).status).toBe(401);
    expect(conciliar).not.toHaveBeenCalled();
  });

  it('com o segredo certo roda a conciliação e devolve o resumo', async () => {
    const r = await POST(requisicao(SEGREDO));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      verificadas: 4,
      liberadas: 1,
      cotacoesCanceladas: 2,
    });
  });

  it('cancela as cotações de chamado encerrado antes de conciliar (AC-12)', async () => {
    const ordem: string[] = [];
    encerrar.mockImplementation(async () => {
      ordem.push('encerrar');
      return { verificadas: 0, canceladas: 0 };
    });
    conciliar.mockImplementation(async () => {
      ordem.push('conciliar');
      return { verificadas: 0, liberadas: 0 };
    });
    await POST(requisicao(SEGREDO));
    expect(ordem).toEqual(['encerrar', 'conciliar']);
  });

  it('falha na rodada de cancelamento não impede a conciliação do dia (AC-8, AC-12)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    encerrar.mockRejectedValue(new Error('mongo piscou'));
    const r = await POST(requisicao(SEGREDO));
    expect(conciliar).toHaveBeenCalledOnce();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      verificadas: 4,
      liberadas: 1,
      cotacoesCanceladas: null,
    });
  });

  it('aceita GET também, com a mesma checagem', async () => {
    expect((await GET(requisicao(null, 'GET'))).status).toBe(401);
    expect((await GET(requisicao(SEGREDO, 'GET'))).status).toBe(200);
  });

  it('falha da conciliação responde 500 sem detalhe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    conciliar.mockRejectedValue(new Error('mongo caiu'));
    const r = await POST(requisicao(SEGREDO));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false });
  });
});
