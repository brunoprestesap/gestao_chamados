import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /api/cotacoes/[id]/arquivos` (spec 0019): sessão, tamanho, tipo pela
 * assinatura dos bytes e repasse do resultado da gravação. A regra de quem
 * envia o quê está em `lib/material/__tests__/arquivos-avisos.db.test.ts`.
 *
 * covers: AC-4, AC-10, AC-15
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const salvar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/material/arquivos', () => ({
  MIME_ARQUIVO_COTACAO: ['application/pdf', 'image/jpeg', 'image/png'],
  salvarArquivoCotacao: salvar,
}));

import { MAX_TAMANHO_ARQUIVO_COTACAO } from '@/shared/material/material.constants';

import { POST } from '../route';

const ID = 'c'.repeat(24);
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function requisicao(campos: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  return new Request(`http://localhost/api/cotacoes/${ID}/arquivos`, {
    method: 'POST',
    body: form,
    headers,
  });
}
const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const arquivo = (bytes: number[], nome = 'orcamento.pdf') =>
  new File([new Uint8Array(bytes)], nome);

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: 'u'.repeat(24), role: 'Preposto' };
  salvar.mockResolvedValue({ ok: true, arquivoId: 'a'.repeat(24) });
});

describe('POST /api/cotacoes/[id]/arquivos', () => {
  it('sem sessão devolve 401', async () => {
    sessao.atual = null;
    const r = await POST(requisicao({ tipo: 'orcamento', arquivo: arquivo(PDF) }), params());
    expect(r.status).toBe(401);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('id de cotação fora do formato devolve 404', async () => {
    const r = await POST(requisicao({ tipo: 'orcamento', arquivo: arquivo(PDF) }), params('xyz'));
    expect(r.status).toBe(404);
  });

  it('corpo declarado acima de 20 MB é recusado com 413 antes de ler', async () => {
    const r = await POST(
      requisicao(
        { tipo: 'orcamento', arquivo: arquivo(PDF) },
        { 'content-length': String(MAX_TAMANHO_ARQUIVO_COTACAO + 1024 * 1024) },
      ),
      params(),
    );
    expect(r.status).toBe(413);
  });

  it('tipo de arquivo fora da lista devolve 400', async () => {
    const r = await POST(requisicao({ tipo: 'contrato', arquivo: arquivo(PDF) }), params());
    expect(r.status).toBe(400);
  });

  it('sem arquivo devolve 400', async () => {
    const r = await POST(requisicao({ tipo: 'orcamento' }), params());
    expect(r.status).toBe(400);
  });

  it('assinatura que não é PDF, JPEG nem PNG devolve 415, mesmo com nome .pdf', async () => {
    const r = await POST(
      requisicao({ tipo: 'orcamento', arquivo: arquivo(GIF, 'falso.pdf') }),
      params(),
    );
    expect(r.status).toBe(415);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('PDF válido grava com o tipo detectado pelos bytes e devolve 201', async () => {
    const r = await POST(requisicao({ tipo: 'orcamento', arquivo: arquivo(PDF) }), params());
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, arquivoId: 'a'.repeat(24) });
    expect(salvar).toHaveBeenCalledWith(
      expect.objectContaining({ cotacaoId: ID, tipo: 'orcamento', mimeType: 'application/pdf' }),
    );
  });

  it('PNG é aceito como evidência', async () => {
    const r = await POST(
      requisicao({ tipo: 'evidencia', arquivo: arquivo(PNG, 'foto.png') }),
      params(),
    );
    expect(r.status).toBe(201);
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/png' }));
  });

  it('repassa a recusa da gravação com o status dela', async () => {
    salvar.mockResolvedValue({ ok: false, status: 409, error: 'Até 10 arquivos deste tipo.' });
    const r = await POST(requisicao({ tipo: 'orcamento', arquivo: arquivo(PDF) }), params());
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ ok: false, error: 'Até 10 arquivos deste tipo.' });
  });

  it('erro inesperado responde 500 com mensagem fixa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    salvar.mockRejectedValue(new Error('disco cheio'));
    const r = await POST(requisicao({ tipo: 'orcamento', arquivo: arquivo(PDF) }), params());
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('disco cheio');
  });
});
