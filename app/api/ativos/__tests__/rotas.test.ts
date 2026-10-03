import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As três rotas de leitura de ativos (spec 0011): leitura de etiqueta
 * (AC-11), busca do seletor e item por id (AC-14, AC-15). Qualquer sessão lê;
 * sem sessão é 401. O banco fica do lado de fora (mock no limite).
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const findOne = vi.hoisted(() => vi.fn());
const buscar = vi.hoisted(() => vi.fn());
const porId = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/models/Ativo', () => ({
  AtivoModel: {
    findOne: (...a: unknown[]) => {
      findOne(...a);
      return { select: () => ({ lean: () => findOne.mock.results.at(-1)?.value }) };
    },
  },
}));
vi.mock('@/lib/ativos/seletor', () => ({
  buscarAtivosSeletor: (...a: unknown[]) => buscar(...a),
  itemSeletorPorId: (...a: unknown[]) => porId(...a),
  FILTRO_RECEBE_DOCUMENTO: { status: { $ne: 'baixado' } },
}));

import { GET as getPorId } from '../[id]/route';
import { GET as getBusca } from '../busca/route';
import { GET as getPorCodigo } from '../por-codigo/[codigo]/route';

const ID = '507f1f77bcf86cd799439011';
const params = <T>(v: T) => ({ params: Promise.resolve(v) });
const req = (url: string) => new Request(`http://localhost${url}`);

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ID, role: 'Solicitante' };
});

describe('GET /api/ativos/por-codigo/[codigo] (AC-11)', () => {
  it('sem sessão devolve 401 e não consulta o banco', async () => {
    sessao.atual = null;
    const r = await getPorCodigo(req('/x'), params({ codigo: '11997' }));
    expect(r.status).toBe(401);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('normaliza o código antes de buscar: zeros, espaços e maiúsculas', async () => {
    findOne.mockReturnValueOnce({ _id: ID, codigo: '11997' });
    const r = await getPorCodigo(req('/x'), params({ codigo: encodeURIComponent(' 00011997 ') }));
    expect(findOne).toHaveBeenCalledWith({ codigo: '11997' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: ID, codigo: '11997' });
  });

  it('código interno em minúsculas acha o MNT-', async () => {
    findOne.mockReturnValueOnce({ _id: ID, codigo: 'MNT-0001' });
    await getPorCodigo(req('/x'), params({ codigo: 'mnt-0001' }));
    expect(findOne).toHaveBeenCalledWith({ codigo: 'MNT-0001' });
  });

  it('código desconhecido devolve 404 com o código normalizado', async () => {
    findOne.mockReturnValueOnce(null);
    const r = await getPorCodigo(req('/x'), params({ codigo: '000123' }));
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: 'Ativo não cadastrado', codigo: '123' });
  });

  // Achado da revisão: decodificar de novo um "%" solto lançava URIError (500).
  it('código com "%" solto é tratado como texto e dá 404, não 500', async () => {
    findOne.mockReturnValueOnce(null);
    const r = await getPorCodigo(req('/x'), params({ codigo: '100%' }));
    expect(r.status).toBe(404);
    expect(findOne).toHaveBeenCalledWith({ codigo: '100%' });
  });

  it('código só com espaços é 404 sem ir ao banco', async () => {
    const r = await getPorCodigo(req('/x'), params({ codigo: '%20%20' }));
    expect(r.status).toBe(404);
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('GET /api/ativos/busca (AC-14)', () => {
  it('sem sessão devolve 401', async () => {
    sessao.atual = null;
    expect((await getBusca(req('/api/ativos/busca?q=11'))).status).toBe(401);
  });

  it('com menos de 2 caracteres devolve 400 e não busca', async () => {
    const r = await getBusca(req('/api/ativos/busca?q=1'));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Digite ao menos 2 caracteres.' });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('repassa a busca com limite padrão 20 e devolve os itens', async () => {
    buscar.mockResolvedValueOnce([{ id: ID, codigo: '11997' }]);
    const r = await getBusca(req('/api/ativos/busca?q=%20119%20'));
    expect(buscar).toHaveBeenCalledWith('119', 20, undefined);
    expect(await r.json()).toEqual({ items: [{ id: ID, codigo: '11997' }] });
  });

  it('com escopo=documentos busca qualquer tier, ainda sem baixado (spec 0013)', async () => {
    sessao.atual = { userId: ID, role: 'Preposto' };
    buscar.mockResolvedValueOnce([]);
    await getBusca(req('/api/ativos/busca?q=11&escopo=documentos'));
    expect(buscar).toHaveBeenCalledWith('11', 20, { status: { $ne: 'baixado' } });
  });

  it('Solicitante não usa o escopo de documentos (spec 0013, AC-10)', async () => {
    const r = await getBusca(req('/api/ativos/busca?q=11&escopo=documentos'));
    expect(r.status).toBe(403);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('recusa limite acima de 50', async () => {
    expect((await getBusca(req('/api/ativos/busca?q=11&limite=500'))).status).toBe(400);
  });
});

describe('GET /api/ativos/[id] (AC-15)', () => {
  it('sem sessão devolve 401', async () => {
    sessao.atual = null;
    expect((await getPorId(req('/x'), params({ id: ID }))).status).toBe(401);
  });

  it('devolve o item do seletor', async () => {
    porId.mockResolvedValueOnce({ id: ID, codigo: '11997' });
    const r = await getPorId(req('/x'), params({ id: ID }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ item: { id: ID, codigo: '11997' } });
  });

  it('inexistente, baixado ou Tier C/D (o seletor devolve null) é 404', async () => {
    porId.mockResolvedValueOnce(null);
    const r = await getPorId(req('/x'), params({ id: ID }));
    expect(r.status).toBe(404);
  });
});
