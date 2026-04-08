import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Precisamos re-importar o módulo com env diferente a cada teste.
// O módulo lê process.env no nível top-level, então usamos vi.resetModules().

describe('emitToRoom', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadModule() {
    const mod = await import('@/lib/realtime-emit');
    return mod.emitToRoom;
  }

  const payload = {
    ticketId: '123',
    ticketNumber: 'T-001',
    title: 'Teste',
    assignedBy: { id: '1', name: 'Admin' },
    assignedTo: { id: '2', name: 'Técnico' },
    at: new Date().toISOString(),
  };

  it('retorna false se SOCKET_INTERNAL_SECRET estiver vazio', async () => {
    process.env.SOCKET_INTERNAL_SECRET = '';
    const emitToRoom = await loadModule();
    const result = await emitToRoom('user:123', 'ticket:assigned', payload);
    expect(result).toBe(false);
  });

  it('retorna true quando fetch retorna 200', async () => {
    process.env.SOCKET_INTERNAL_SECRET = 'test-secret';
    process.env.SOCKET_EMIT_URL = 'http://localhost:3001/emit';

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const emitToRoom = await loadModule();
    const result = await emitToRoom('user:123', 'ticket:assigned', payload);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/emit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-internal-secret': 'test-secret',
        }),
      }),
    );
  });

  it('retorna false quando fetch retorna 4xx', async () => {
    process.env.SOCKET_INTERNAL_SECRET = 'test-secret';

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', mockFetch);

    const emitToRoom = await loadModule();
    const result = await emitToRoom('managers', 'ticket:new', {
      ticketId: '1',
      openedBy: { id: '1' },
      at: new Date().toISOString(),
    });

    expect(result).toBe(false);
  });

  it('retorna false quando fetch lança erro de rede', async () => {
    process.env.SOCKET_INTERNAL_SECRET = 'test-secret';

    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    const emitToRoom = await loadModule();
    const result = await emitToRoom('user:123', 'ticket:assigned', payload);

    expect(result).toBe(false);
  });

  it('retorna false quando fetch é abortado (timeout)', async () => {
    process.env.SOCKET_INTERNAL_SECRET = 'test-secret';

    const mockFetch = vi.fn().mockRejectedValue(new Error('The operation was aborted.'));
    vi.stubGlobal('fetch', mockFetch);

    const emitToRoom = await loadModule();
    const result = await emitToRoom('user:123', 'ticket:assigned', payload);

    expect(result).toBe(false);
  });

  it('envia body correto com room, event e payload', async () => {
    process.env.SOCKET_INTERNAL_SECRET = 'test-secret';
    process.env.SOCKET_EMIT_URL = 'http://localhost:3001/emit';

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const emitToRoom = await loadModule();
    await emitToRoom('managers', 'ticket:closed', {
      ticketId: '42',
      closedBy: { id: '1', name: 'Admin' },
      at: '2024-01-01T00:00:00Z',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({
      room: 'managers',
      event: 'ticket:closed',
      payload: {
        ticketId: '42',
        closedBy: { id: '1', name: 'Admin' },
        at: '2024-01-01T00:00:00Z',
      },
    });
  });
});
