import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A barreira de rota do `proxy.ts` para a gestão de ativos (spec 0011): sem
 * login, `/ativos` vai para `/login`; qualquer perfil logado entra em
 * `/ativos`; `/configuracoes/categorias-ativo` é só do Admin (AC-3, AC-17).
 * As telas de escrita de ativo (gestão) são barradas pela própria página,
 * com `requireManager()`, e isso fica no E2E.
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { user: { id: string; role: string } } }));
vi.mock('@/auth', () => ({ auth: async () => sessao.atual }));

import proxy from '../proxy';

const req = (path: string) => new NextRequest(new URL(`http://localhost${path}`));
const destino = (res: Response) => {
  const loc = res.headers.get('location');
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};
const logado = (role: string) => {
  sessao.atual = { user: { id: 'u1', role } };
};

beforeEach(() => {
  sessao.atual = null;
});

describe('proxy · /ativos', () => {
  it.each(['/ativos', '/ativos/ler', '/ativos/abc', '/ativos/novo'])(
    'sem login, %s vai para o login com a volta guardada',
    async (path) => {
      const res = await proxy(req(path));
      expect(destino(res)).toBe(`/login?callbackUrl=${encodeURIComponent(path)}`);
    },
  );

  it.each(['Solicitante', 'Técnico', 'Preposto', 'Admin'])(
    '%s logado entra em /ativos',
    async (role) => {
      logado(role);
      const res = await proxy(req('/ativos'));
      expect(destino(res)).toBeNull();
    },
  );

  it('não confunde /ativosx com /ativos (o prefixo é por segmento)', async () => {
    const res = await proxy(req('/ativosx'));
    expect(destino(res)).toBeNull();
  });

  it('não barra as rotas /api/ativos: elas conferem a sessão sozinhas', async () => {
    const res = await proxy(req('/api/ativos/busca?q=11'));
    expect(destino(res)).toBeNull();
  });
});

describe('proxy · /configuracoes/categorias-ativo', () => {
  it.each(['Preposto', 'Solicitante', 'Técnico'])('%s é mandado embora', async (role) => {
    logado(role);
    const res = await proxy(req('/configuracoes/categorias-ativo'));
    expect(destino(res)).toBe('/');
  });

  it('Admin entra', async () => {
    logado('Admin');
    const res = await proxy(req('/configuracoes/categorias-ativo'));
    expect(destino(res)).toBeNull();
  });
});
