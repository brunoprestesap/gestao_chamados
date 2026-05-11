import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O módulo da rota lê CRON_SECRET no nível top-level (const CRON_SECRET = process.env.CRON_SECRET ?? '').
 * Para testar diferentes valores de CRON_SECRET, precisamos resetar os módulos e re-importar dinamicamente.
 * Mesma estratégia usada em lib/__tests__/realtime-emit.test.ts.
 */

const VALID_SECRET = 'super-secret-cron-token';

const MOCK_REPORT = {
  processed: 3,
  created: 3,
  errors: 0,
  details: ['OK: Template A → CHM-2024-00001', 'OK: Template B → CHM-2024-00002'],
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// ── Helpers ───────────────────────────────────────────────────────

function makeRequest(secret: string | null): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (secret !== null) {
    headers.set('x-cron-secret', secret);
  }
  return new Request('http://localhost/api/cron/recurring-tickets', {
    method: 'POST',
    headers,
  });
}

async function loadRoute(mockReport?: unknown, throwError?: Error | string) {
  const mockProcessRecurringTickets = vi.fn();
  if (throwError !== undefined) {
    mockProcessRecurringTickets.mockRejectedValue(throwError);
  } else {
    mockProcessRecurringTickets.mockResolvedValue(mockReport ?? MOCK_REPORT);
  }

  vi.doMock('@/lib/recurring-job', () => ({
    processRecurringTickets: mockProcessRecurringTickets,
  }));

  const { POST } = await import('@/app/api/cron/recurring-tickets/route');
  return { POST, mockProcessRecurringTickets };
}

// ── Testes de autenticação ────────────────────────────────────────

describe('POST /api/cron/recurring-tickets — autenticação', () => {
  it('should return 401 when x-cron-secret header is missing', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST } = await loadRoute();

    const response = await POST(makeRequest(null));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('should return 401 when x-cron-secret does not match CRON_SECRET', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST } = await loadRoute();

    const response = await POST(makeRequest('wrong-secret'));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('should return 401 when CRON_SECRET env var is empty string', async () => {
    process.env.CRON_SECRET = '';
    const { POST } = await loadRoute();

    const response = await POST(makeRequest('anything'));

    expect(response.status).toBe(401);
  });

  it('should not call processRecurringTickets when unauthorized', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST, mockProcessRecurringTickets } = await loadRoute();

    await POST(makeRequest('wrong-secret'));

    expect(mockProcessRecurringTickets).not.toHaveBeenCalled();
  });
});

// ── Testes de sucesso ─────────────────────────────────────────────

describe('POST /api/cron/recurring-tickets — fluxo de sucesso', () => {
  it('should return 200 with report when secret is valid', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST } = await loadRoute();

    const response = await POST(makeRequest(VALID_SECRET));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(3);
    expect(body.created).toBe(3);
    expect(body.errors).toBe(0);
  });

  it('should call processRecurringTickets exactly once', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST, mockProcessRecurringTickets } = await loadRoute();

    await POST(makeRequest(VALID_SECRET));

    expect(mockProcessRecurringTickets).toHaveBeenCalledOnce();
  });

  it('should return the full report from processRecurringTickets', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST } = await loadRoute();

    const response = await POST(makeRequest(VALID_SECRET));
    const body = await response.json();

    expect(body).toMatchObject({
      processed: MOCK_REPORT.processed,
      created: MOCK_REPORT.created,
      errors: MOCK_REPORT.errors,
      details: MOCK_REPORT.details,
    });
  });

  it('should return 200 with zero counts when no templates were due', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const emptyReport = {
      processed: 0,
      created: 0,
      errors: 0,
      details: ['Nenhum agendamento pendente.'],
    };
    const { POST } = await loadRoute(emptyReport);

    const response = await POST(makeRequest(VALID_SECRET));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(body.details).toContain('Nenhum agendamento pendente.');
  });
});

// ── Testes de erro interno ────────────────────────────────────────

describe('POST /api/cron/recurring-tickets — erros internos', () => {
  it('should return 500 when processRecurringTickets throws an Error', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST } = await loadRoute(undefined, new Error('DB connection failed'));

    const response = await POST(makeRequest(VALID_SECRET));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('DB connection failed');
  });

  it('should return 500 with generic message when non-Error is thrown', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST } = await loadRoute(undefined, 'unexpected failure');

    const response = await POST(makeRequest(VALID_SECRET));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Erro interno');
  });

  it('should return 500 when processRecurringTickets throws with timeout message', async () => {
    process.env.CRON_SECRET = VALID_SECRET;
    const { POST } = await loadRoute(undefined, new Error('Timeout connecting to MongoDB'));

    const response = await POST(makeRequest(VALID_SECRET));

    expect(response.status).toBe(500);
  });
});
