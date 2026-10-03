import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /api/ativos/documentos` (spec 0013): quem pode cadastrar, as recusas
 * de tamanho e de tipo pelos bytes iniciais, e o repasse do resultado da
 * gravação. O banco fica de fora (mock em `cadastrarDocumento`); a regra de
 * substituição e a corrida estão em `lib/ativos/documentos/__tests__/documentos.db.test.ts`.
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const cadastrar = vi.hoisted(() => vi.fn());
const revalidar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidar }));
vi.mock('@/lib/ativos/documentos/gravar', () => ({ cadastrarDocumento: cadastrar }));

import { MAX_TAMANHO_DOCUMENTO } from '@/shared/ativos/documento.constants';

import { POST } from '../route';

const ATIVO = 'a'.repeat(24);
const LOCAL = 'b'.repeat(24);
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];

function arquivo(bytes: number[] | Uint8Array<ArrayBuffer>, nome = 'laudo.pdf'): File {
  return new File([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], nome);
}

function requisicao(campos: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  return new Request('http://localhost/api/ativos/documentos', {
    method: 'POST',
    body: form,
    headers,
  });
}

const validos = () => ({
  tipo: 'pmoc',
  ativoId: ATIVO,
  emitidoEm: '2026-01-10',
  validadeAte: '2027-01-10',
  arquivo: arquivo(PDF),
});

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: 'u'.repeat(24), role: 'Preposto' };
  cadastrar.mockResolvedValue({ ok: true, id: 'd'.repeat(24) });
});

describe('POST /api/ativos/documentos · permissão (AC-10)', () => {
  it('sem sessão devolve 401', async () => {
    sessao.atual = null;
    expect((await POST(requisicao(validos()))).status).toBe(401);
  });

  it.each(['Técnico', 'Solicitante'])('%s recebe 403 e nada é gravado', async (role) => {
    sessao.atual = { userId: 'u'.repeat(24), role };
    const r = await POST(requisicao(validos()));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, error: 'Sem permissão para esta ação.' });
    expect(cadastrar).not.toHaveBeenCalled();
  });
});

describe('POST /api/ativos/documentos · recusas do arquivo (AC-3, AC-15)', () => {
  it('cabeçalho de tamanho acima do limite recusa com 413 antes de ler o corpo', async () => {
    const r = await POST(
      requisicao(validos(), { 'content-length': String(MAX_TAMANHO_DOCUMENTO + 70 * 1024) }),
    );
    expect(r.status).toBe(413);
    expect((await r.json()).error).toMatch(/20 MB/);
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it('arquivo acima de 20 MB recusa com 413 e mensagem em português', async () => {
    const grande = new Uint8Array(MAX_TAMANHO_DOCUMENTO + 1);
    grande.set(PDF);
    const r = await POST(requisicao({ ...validos(), arquivo: arquivo(grande) }));
    expect(r.status).toBe(413);
    expect((await r.json()).error).toBe('O arquivo passa de 20 MB. Envie um arquivo menor.');
  });

  it('arquivo de exatamente 20 MB passa', async () => {
    const limite = new Uint8Array(MAX_TAMANHO_DOCUMENTO);
    limite.set(PDF);
    const r = await POST(requisicao({ ...validos(), arquivo: arquivo(limite) }));
    expect(r.status).toBe(201);
  });

  it('".pdf" com bytes de executável recusa com 415 pelo conteúdo, não pela extensão', async () => {
    const r = await POST(
      requisicao({ ...validos(), arquivo: arquivo([0x4d, 0x5a, 0x90, 0x00], 'laudo.pdf') }),
    );
    expect(r.status).toBe(415);
    expect((await r.json()).error).toBe(
      'Tipo de arquivo não aceito. Envie PDF, JPEG, PNG ou WebP.',
    );
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it('sem arquivo, ou arquivo vazio, recusa com 400', async () => {
    const { arquivo: _semArquivo, ...semArquivo } = validos();
    expect((await POST(requisicao(semArquivo))).status).toBe(400);
    expect((await POST(requisicao({ ...validos(), arquivo: arquivo([]) }))).status).toBe(400);
  });
});

describe('POST /api/ativos/documentos · campos (AC-3)', () => {
  it('ativo e local juntos recusa com 400', async () => {
    const r = await POST(requisicao({ ...validos(), localizacaoId: LOCAL }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('Escolha um ativo ou um local (só um dos dois).');
  });

  it('nem ativo nem local recusa com 400', async () => {
    const { ativoId: _semAtivo, ...semAlvo } = validos();
    expect((await POST(requisicao(semAlvo))).status).toBe(400);
  });

  it('validade anterior à emissão recusa com 400', async () => {
    const r = await POST(requisicao({ ...validos(), validadeAte: '2025-12-31' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('A validade não pode ser anterior à emissão.');
  });
});

describe('POST /api/ativos/documentos · gravação', () => {
  it('cadastra com o tipo real do arquivo, o nome em disco seguro e o autor da sessão', async () => {
    sessao.atual = { userId: 'f'.repeat(24), role: 'Admin' };
    const r = await POST(
      requisicao({ ...validos(), arquivo: arquivo(PDF, '../../Laudo Ção.pdf') }),
    );

    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, id: 'd'.repeat(24) });
    const [dados, recebido, autor] = cadastrar.mock.calls[0];
    expect(dados).toMatchObject({ tipo: 'pmoc', ativoId: ATIVO, emitidoEm: '2026-01-10' });
    expect(recebido.mimeType).toBe('application/pdf');
    expect(recebido.filename).toMatch(/^\d+-Laudo_Ção\.pdf$/);
    expect(recebido.filename).not.toContain('/');
    expect(autor).toBe('f'.repeat(24));
    expect(revalidar).toHaveBeenCalledWith(`/ativos/${ATIVO}`);
    expect(revalidar).toHaveBeenCalledWith('/ativos/documentos');
  });

  it('substituição devolve o id do anterior (AC-4)', async () => {
    cadastrar.mockResolvedValue({ ok: true, id: 'd'.repeat(24), substituidoId: 'e'.repeat(24) });
    const r = await POST(requisicao(validos()));
    expect(await r.json()).toEqual({ ok: true, id: 'd'.repeat(24), substituidoId: 'e'.repeat(24) });
  });

  it('corrida perdida vira 409 com a mensagem da gravação (AC-4)', async () => {
    cadastrar.mockResolvedValue({ ok: false, error: 'Outro documento…', status: 409 });
    const r = await POST(requisicao(validos()));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ ok: false, error: 'Outro documento…' });
  });

  it('erro inesperado vira 500 sem vazar detalhe', async () => {
    cadastrar.mockRejectedValue(new Error('mongo caiu'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await POST(requisicao(validos()));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe('Não deu para salvar o documento. Tente de novo.');
  });
});
