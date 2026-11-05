import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A busca de materiais da checagem (spec 0024, AC-26): 401 sem sessão, 403 para
 * quem não pode agir naquela cotação naquele momento, e 503 com o SICAM fora.
 *
 * covers: AC-5, AC-12, AC-26
 */

const m = vi.hoisted(() => ({
  verifySession: vi.fn(),
  papeisDe: vi.fn(),
  lean: vi.fn(),
  buscarCandidatos: vi.fn(),
  buscarMateriais: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: m.verifySession }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/material/papeis', async () => ({
  papeisDe: m.papeisDe,
  podeConcluirChecagem: (situacao: string, p: { tem: (x: string) => boolean } | null) =>
    situacao === 'em_checagem' && !!p && (p.tem('almoxarifado') || p.tem('fiscal')),
}));
vi.mock('@/lib/material/sicam', () => ({
  buscarCandidatos: m.buscarCandidatos,
  buscarMateriais: m.buscarMateriais,
}));
vi.mock('@/models/CotacaoMaterial', () => ({
  CotacaoMaterialModel: { findById: () => ({ select: () => ({ lean: m.lean }) }) },
}));

import { GET } from '../route';

const ID = String(new Types.ObjectId());
const itemId = new Types.ObjectId();
const pedir = (q = '') =>
  GET(new Request(`http://localhost/api/cotacoes/${ID}/checagem/materiais${q}`), {
    params: Promise.resolve({ id: ID }),
  });

const material = {
  coMat: '1',
  descricao: 'TORNEIRA',
  unidade: 'UN',
  saldo: 4,
  reservado: 0,
  disponivel: 4,
  valorTotal: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.verifySession.mockResolvedValue({ userId: 'u', role: 'Solicitante' });
  m.papeisDe.mockResolvedValue({ tem: (p: string) => p === 'almoxarifado' });
  m.lean.mockResolvedValue({
    situacao: 'em_checagem',
    itens: [{ _id: itemId, descricao: 'Torneira', quantidade: 2 }],
    checagem: { itens: [] },
  });
});

describe('GET /api/cotacoes/[id]/checagem/materiais', () => {
  it('401 sem sessão', async () => {
    m.verifySession.mockResolvedValue(null);
    expect((await pedir()).status).toBe(401);
  });

  it('403 para quem não pode agir, mesmo com a cotação existindo', async () => {
    m.papeisDe.mockResolvedValue({ tem: (p: string) => p === 'gestor' });
    expect((await pedir()).status).toBe(403);
    expect(m.buscarCandidatos).not.toHaveBeenCalled();
  });

  it('403 fora de `em_checagem`, e com a cotação inexistente', async () => {
    m.lean.mockResolvedValue({ situacao: 'rascunho', itens: [], checagem: { itens: [] } });
    expect((await pedir()).status).toBe(403);
    m.lean.mockResolvedValue(null);
    expect((await pedir()).status).toBe(403);
  });

  it('sem `q`, os candidatos dos itens em aberto, com o preço médio e sem o valor bruto', async () => {
    m.buscarCandidatos.mockResolvedValue({
      ok: true,
      consultadoEm: new Date('2026-11-05T12:00:00.000Z'),
      porItem: new Map([[String(itemId), [material]]]),
    });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(m.buscarCandidatos).toHaveBeenCalledWith([
      { itemId: String(itemId), palavras: ['torneira'] },
    ]);
    const corpo = await r.json();
    expect(corpo.consultadoEm).toBe('2026-11-05T12:00:00.000Z');
    expect(corpo.candidatos[String(itemId)][0]).toMatchObject({
      coMat: '1',
      precoMedioCentavos: 2500,
    });
    expect(corpo.candidatos[String(itemId)][0]).not.toHaveProperty('valorTotal');
  });

  it('com `q`, a busca manual; curta demais é 400', async () => {
    m.buscarMateriais.mockResolvedValue({
      ok: true,
      consultadoEm: new Date(),
      materiais: [{ ...material, saldo: 0, disponivel: 0 }],
    });
    const r = await pedir('?q=torneira');
    expect(r.status).toBe(200);
    expect((await r.json()).materiais[0].precoMedioCentavos).toBeNull();
    expect((await pedir('?q=ab')).status).toBe(400);
  });

  it('503 com o SICAM fora, sem detalhe do banco', async () => {
    m.buscarCandidatos.mockResolvedValue({ ok: false, motivo: 'prazo' });
    const r = await pedir();
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'SICAM indisponível', motivo: 'prazo' });
  });
});
