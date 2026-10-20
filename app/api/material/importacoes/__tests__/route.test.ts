import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TAMANHO_MAXIMO_IMPORTACAO_MATERIAL } from '@/shared/material/material.constants';

/**
 * Envio do CSV do Anexo V e do SINAPI (spec 0019, AC-24, AC-25): só o Admin;
 * contrato e mês vêm do formulário; acima de 10 MB é 413; a recusa da
 * leitura volta com o status e as linhas que a regra devolveu. O banco fica
 * do lado de fora (mock no limite).
 *
 * covers: AC-24, AC-25
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const pendente = vi.hoisted(() => ({
  enviarImportacaoAnexoV: vi.fn(),
  enviarImportacaoSinapi: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/material/importacao/pendente', () => pendente);

import { POST } from '../route';

const CONTRATO = 'c'.repeat(24);
const ADMIN = 'u'.repeat(24);

function envio(campos: Record<string, string>, arquivo: File | null = csv()) {
  const corpo = new FormData();
  if (arquivo) corpo.set('arquivo', arquivo);
  for (const [k, v] of Object.entries(campos)) corpo.set(k, v);
  return new Request('http://localhost/api/material/importacoes', { method: 'POST', body: corpo });
}

function csv(texto = 'CODIGO;DESCRICAO;UNIDADE;PRECO\n1;a;un;1,00', nome = 'sinapi.csv') {
  return new File([texto], nome, { type: 'text/csv' });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ADMIN, role: 'Admin' };
  pendente.enviarImportacaoAnexoV.mockResolvedValue({ ok: true, id: 'i'.repeat(24) });
  pendente.enviarImportacaoSinapi.mockResolvedValue({ ok: true, id: 'i'.repeat(24) });
});

describe('quem envia', () => {
  it('sem sessão é 401', async () => {
    sessao.atual = null;
    expect((await POST(envio({ tipo: 'sinapi', referencia: '2026-08' }))).status).toBe(401);
  });

  it.each(['Preposto', 'Técnico', 'Solicitante'])('%s recebe 403 e nada é lido', async (role) => {
    sessao.atual = { userId: ADMIN, role };
    const r = await POST(envio({ tipo: 'sinapi', referencia: '2026-08' }));
    expect(r.status).toBe(403);
    expect(pendente.enviarImportacaoSinapi).not.toHaveBeenCalled();
  });
});

describe('entrada', () => {
  it('sem arquivo é 400', async () => {
    const r = await POST(envio({ tipo: 'sinapi', referencia: '2026-08' }, null));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Envie o arquivo CSV.' });
  });

  it('arquivo acima de 10 MB é 413, sem chegar na leitura', async () => {
    const grande = new File([new Uint8Array(TAMANHO_MAXIMO_IMPORTACAO_MATERIAL + 1)], 'g.csv');
    const r = await POST(envio({ tipo: 'sinapi', referencia: '2026-08' }, grande));
    expect(r.status).toBe(413);
    expect(pendente.enviarImportacaoSinapi).not.toHaveBeenCalled();
  });

  it('Anexo V sem contrato é 422', async () => {
    const r = await POST(envio({ tipo: 'anexo_v' }));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: 'Escolha o contrato do Anexo V.' });
  });

  it.each(['', '2026-13', '08/2026'])('SINAPI com mês %j é 422', async (referencia) => {
    const r = await POST(envio({ tipo: 'sinapi', referencia }));
    expect(r.status).toBe(422);
    expect(pendente.enviarImportacaoSinapi).not.toHaveBeenCalled();
  });

  it('tipo desconhecido é 400', async () => {
    expect((await POST(envio({ tipo: 'sicam' }))).status).toBe(400);
  });
});

describe('repasse para a regra', () => {
  it('SINAPI passa o mês do formulário, não o do nome do arquivo (AC-25)', async () => {
    const r = await POST(
      envio({ tipo: 'sinapi', referencia: '2026-07' }, csv(undefined, 'sinapi-2026-08.csv')),
    );
    expect(r.status).toBe(201);
    expect(pendente.enviarImportacaoSinapi).toHaveBeenCalledWith(
      expect.objectContaining({
        referencia: '2026-07',
        arquivoNome: 'sinapi-2026-08.csv',
        autorId: ADMIN,
      }),
    );
  });

  it('Anexo V passa o contrato e devolve o id da importação', async () => {
    const r = await POST(envio({ tipo: 'anexo_v', contratoId: CONTRATO }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: 'i'.repeat(24) });
    expect(pendente.enviarImportacaoAnexoV).toHaveBeenCalledWith(
      expect.objectContaining({ contratoId: CONTRATO }),
    );
  });

  it('a recusa da regra volta com o status dela e as linhas inválidas, sem o campo status', async () => {
    pendente.enviarImportacaoSinapi.mockResolvedValue({
      ok: false,
      status: 422,
      error: 'Uma linha do arquivo é inválida; nada foi gravado.',
      linhas: [{ linha: 2, motivo: 'preço inválido (x)' }],
    });
    const r = await POST(envio({ tipo: 'sinapi', referencia: '2026-08' }));
    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ linhas: [{ linha: 2, motivo: 'preço inválido (x)' }] });
    expect(corpo).not.toHaveProperty('status');
  });

  it('mês já importado ou importação aberta volta 409', async () => {
    pendente.enviarImportacaoSinapi.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'Este mês já foi importado.',
    });
    const r = await POST(envio({ tipo: 'sinapi', referencia: '2026-08' }));
    expect(r.status).toBe(409);
  });

  it('falha inesperada da regra vira 500 com texto fixo, sem detalhe interno', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    pendente.enviarImportacaoSinapi.mockRejectedValue(new Error('mongo caiu: senha=xyz'));
    const r = await POST(envio({ tipo: 'sinapi', referencia: '2026-08' }));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('senha');
    erro.mockRestore();
  });
});
