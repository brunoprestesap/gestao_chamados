import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bytesCp1252,
  CABECALHO_SICAM,
  csvSicam,
  linhaSicam,
} from '@/lib/ativos/importacao/__tests__/sicam-fixture';

/**
 * Upload do SICAM (spec 0012, AC-17, AC-21 e AC-27): só o Admin; cabeçalho
 * inválido é 400 com o nome da coluna; acima de 10 MB é 413; pendente
 * existente é 409. O banco fica do lado de fora (mock no limite).
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const registrar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/ativos/importacao/pendente', () => ({
  registrarImportacao: (p: unknown) => registrar(p),
}));

import { POST } from '../route';

const ID = '507f1f77bcf86cd799439011';

function upload(bytes: Uint8Array<ArrayBuffer>, extra: Record<string, string> = {}) {
  const corpo = new FormData();
  corpo.set('arquivo', new File([bytes], 'SICAM.CSV', { type: 'text/csv' }));
  for (const [k, v] of Object.entries(extra)) corpo.set(k, v);
  return new Request('http://localhost/api/ativos/importacoes', { method: 'POST', body: corpo });
}

const valido = () => bytesCp1252(csvSicam([linhaSicam({ 'Número Tombo': '100' })]));

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ID, role: 'Admin' };
});

describe('POST /api/ativos/importacoes', () => {
  it('sem sessão é 401', async () => {
    sessao.atual = null;
    expect((await POST(upload(valido()))).status).toBe(401);
  });

  it.each(['Preposto', 'Técnico', 'Solicitante'])('%s recebe 403', async (role) => {
    sessao.atual = { userId: ID, role };
    expect((await POST(upload(valido()))).status).toBe(403);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('cabeçalho sem uma coluna usada é 400 com o nome da coluna', async () => {
    const cabecalho = CABECALHO_SICAM.filter((c) => c !== 'Saída');
    const r = await POST(upload(bytesCp1252(csvSicam([linhaSicam({}, cabecalho)], cabecalho))));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({
      error: 'O arquivo não parece um export do SICAM: falta a coluna Saída',
    });
  });

  it('arquivo acima de 10 MB é 413', async () => {
    const r = await POST(upload(new Uint8Array(10 * 1024 * 1024 + 1)));
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: 'Arquivo maior que 10 MB' });
  });

  it('com pendente e sem substituir é 409 com os dados da anterior', async () => {
    const anterior = { id: ID, criadaEm: '2026-10-01T10:00:00.000Z', autorNome: 'Admin X' };
    registrar.mockResolvedValueOnce({ ok: false, conflito: anterior });
    const r = await POST(upload(valido()));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ pendente: anterior });
    expect(registrar.mock.calls[0][0]).toMatchObject({ substituirPendente: false });
  });

  it('grava a pendente e devolve 201 com o id, repassando substituirPendente', async () => {
    registrar.mockResolvedValueOnce({ ok: true, id: ID });
    const r = await POST(upload(valido(), { substituirPendente: 'true' }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: ID });
    expect(registrar.mock.calls[0][0]).toMatchObject({
      arquivoNome: 'SICAM.CSV',
      autorId: ID,
      substituirPendente: true,
      contagensParse: { linhasLidas: 1, linhasAceitas: 1 },
    });
  });
});
