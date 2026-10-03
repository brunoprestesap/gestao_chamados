import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `GET /api/ativos/documentos/[id]/arquivo` (spec 0013, AC-6 e AC-10): só
 * Admin, Preposto e Técnico baixam; excluído responde 404; o nome do arquivo
 * vai no cabeçalho em UTF-8 sem quebrar o ASCII de reserva.
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const doc = vi.hoisted(() => ({ atual: null as unknown }));
const disco = vi.hoisted(() => ({ ler: vi.fn() }));

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/models/DocumentoAtivo', () => ({
  DocumentoAtivoModel: {
    findById: () => ({ select: () => ({ lean: async () => doc.atual }) }),
  },
}));
vi.mock('fs/promises', () => ({ default: { readFile: disco.ler } }));

import { GET } from '../route';

const ID = 'a'.repeat(24);
const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = () => new Request(`http://localhost/api/ativos/documentos/${ID}/arquivo`);

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: 'u'.repeat(24), role: 'Técnico' };
  doc.atual = {
    situacao: 'vigente',
    arquivo: {
      filename: '1700-Laudo_Ção.pdf',
      originalName: 'Laudo Ção.pdf',
      mimeType: 'application/pdf',
    },
  };
  disco.ler.mockResolvedValue(Buffer.from('%PDF-1.4'));
});

describe('GET arquivo do documento', () => {
  it('sem sessão devolve 401', async () => {
    sessao.atual = null;
    expect((await GET(req(), params())).status).toBe(401);
  });

  it('Solicitante recebe 403 e o disco nem é lido (AC-10)', async () => {
    sessao.atual = { userId: 'u'.repeat(24), role: 'Solicitante' };
    expect((await GET(req(), params())).status).toBe(403);
    expect(disco.ler).not.toHaveBeenCalled();
  });

  it.each(['Admin', 'Preposto', 'Técnico'])(
    '%s baixa o arquivo com o tipo gravado',
    async (role) => {
      sessao.atual = { userId: 'u'.repeat(24), role };
      const r = await GET(req(), params());
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('application/pdf');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await r.text()).toBe('%PDF-1.4');
    },
  );

  it('o arquivo nunca fica no cache do navegador (permissão e exclusão valem a cada pedido)', async () => {
    const r = await GET(req(), params());
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('o nome vai em UTF-8 e com reserva ASCII sem aspas nem acento', async () => {
    const r = await GET(req(), params());
    const disp = r.headers.get('content-disposition') ?? '';
    expect(disp).toContain(`filename*=UTF-8''${encodeURIComponent('Laudo Ção.pdf')}`);
    expect(disp).toMatch(/^inline; filename="Laudo __o\.pdf"/);
  });

  it('documento excluído responde 404 (AC-6)', async () => {
    doc.atual = { ...(doc.atual as object), situacao: 'excluido' };
    expect((await GET(req(), params())).status).toBe(404);
    expect(disco.ler).not.toHaveBeenCalled();
  });

  it('documento substituído ainda baixa (fica consultável, AC-4)', async () => {
    doc.atual = { ...(doc.atual as object), situacao: 'substituido' };
    expect((await GET(req(), params())).status).toBe(200);
  });

  it('id inválido ou inexistente responde 404', async () => {
    expect((await GET(req(), params('../etc'))).status).toBe(404);
    doc.atual = null;
    expect((await GET(req(), params())).status).toBe(404);
  });

  it('arquivo sumido do disco responde 404', async () => {
    disco.ler.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect((await GET(req(), params())).status).toBe(404);
  });

  it('filename gravado com "../" não sai da pasta do documento (404)', async () => {
    doc.atual = {
      situacao: 'vigente',
      arquivo: {
        filename: '../../segredo.pdf',
        originalName: 'x.pdf',
        mimeType: 'application/pdf',
      },
    };
    expect((await GET(req(), params())).status).toBe(404);
    expect(disco.ler).not.toHaveBeenCalled();
  });
});
