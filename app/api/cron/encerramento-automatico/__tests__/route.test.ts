import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A rota lê `CRON_SECRET` no topo do módulo; cada teste reimporta com o
 * ambiente que precisa, como `app/api/cron/recurring-tickets/__tests__`.
 *
 * covers: AC-6 (autorização e formato da resposta)
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
  return new Request('http://localhost/api/cron/encerramento-automatico', {
    method: 'POST',
    headers,
  });
}

async function carregar(
  executar = vi.fn().mockResolvedValue({ encerrados: 2, prazosPreenchidos: 1 }),
) {
  vi.doMock('@/lib/chamados/encerramento-automatico', () => ({
    executarEncerramentoAutomatico: executar,
  }));
  const { POST } = await import('../route');
  return { POST, executar };
}

describe('POST /api/cron/encerramento-automatico', () => {
  it('sem o header responde 401 e não roda', async () => {
    // Arrange
    process.env.CRON_SECRET = SEGREDO;
    const { POST, executar } = await carregar();

    // Act
    const res = await POST(requisicao(null));

    // Assert
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(executar).not.toHaveBeenCalled();
  });

  it('com o segredo errado responde 401', async () => {
    // Arrange
    process.env.CRON_SECRET = SEGREDO;
    const { POST } = await carregar();

    // Act / Assert
    expect((await POST(requisicao('outro'))).status).toBe(401);
  });

  it('com CRON_SECRET vazio recusa tudo, mesmo com header vazio', async () => {
    // Arrange
    process.env.CRON_SECRET = '';
    const { POST, executar } = await carregar();

    // Act
    const res = await POST(requisicao(''));

    // Assert
    expect(res.status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });

  it('com o segredo certo devolve { encerrados, prazosPreenchidos }', async () => {
    // Arrange
    process.env.CRON_SECRET = SEGREDO;
    const { POST, executar } = await carregar();

    // Act
    const res = await POST(requisicao(SEGREDO));

    // Assert
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ encerrados: 2, prazosPreenchidos: 1 });
    expect(executar).toHaveBeenCalledOnce();
  });

  it('erro interno vira 500 com console.error', async () => {
    // Arrange
    process.env.CRON_SECRET = SEGREDO;
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await carregar(vi.fn().mockRejectedValue(new Error('banco caiu')));

    // Act
    const res = await POST(requisicao(SEGREDO));

    // Assert
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'banco caiu' });
    expect(erro).toHaveBeenCalled();
  });
});
