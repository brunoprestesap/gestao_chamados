import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { type Consultas, criarApp, type Material } from '../app.js';

const MATERIAL: Material = {
  coMat: '123',
  descricao: 'TORNEIRA',
  unidade: 'UN',
  saldo: 10,
  reservado: 1,
  disponivel: 9,
  valorTotal: 100,
};

function falsa(sobre: Partial<Consultas> = {}): Consultas {
  return {
    candidatos: async () => ({ a: [MATERIAL] }),
    materiais: async () => [MATERIAL],
    lote: async () => [MATERIAL],
    ...sobre,
  };
}

async function subir(segredo: string, consultas: Consultas) {
  const servidor: Server = await new Promise((ok) => {
    const s = criarApp(segredo, consultas).listen(0, () => ok(s));
  });
  const { port } = servidor.address() as { port: number };
  return { servidor, url: `http://127.0.0.1:${port}` };
}

describe('barreiras do sicam-gateway (AC-29)', () => {
  let servidor: Server;
  let url: string;
  const h = { 'x-internal-secret': 'segredo', 'content-type': 'application/json' };

  before(async () => {
    ({ servidor, url } = await subir('segredo', falsa()));
  });
  after(() => {
    servidor.close();
  });

  it('healthz responde sem segredo', async () => {
    const r = await fetch(`${url}/healthz`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  });

  it('401 sem segredo, ou com o errado', async () => {
    for (const headers of [{}, { 'x-internal-secret': 'outro' }]) {
      const r = await fetch(`${url}/materiais?q=torneira`, { headers });
      assert.equal(r.status, 401);
    }
  });

  it('segredo vazio recusa tudo', async () => {
    const vazio = await subir('', falsa());
    try {
      const r = await fetch(`${vazio.url}/materiais?q=torneira`, {
        headers: { 'x-internal-secret': '' },
      });
      assert.equal(r.status, 401);
    } finally {
      vazio.servidor.close();
    }
  });

  it('400 em entrada fora dos limites', async () => {
    const post = (body: unknown): RequestInit => ({
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
    });
    const pedidos: [string, RequestInit][] = [
      ['/materiais?q=ab', { headers: h }],
      ['/materiais?q=torneira&limite=26', { headers: h }],
      ['/candidatos', post({ itens: [{ itemId: 'a' }] })],
      [
        '/candidatos',
        post({ itens: [{ itemId: 'a', palavras: Array.from({ length: 9 }, () => 'palavra') }] }),
      ],
      ['/candidatos', post({ itens: [{ itemId: 'a', palavras: ['x'.repeat(41)] }] })],
      ['/materiais/lote', post({ coMats: ["1' OR 1=1"] })],
    ];
    for (const [rota, init] of pedidos) {
      const r = await fetch(`${url}${rota}`, init);
      assert.equal(r.status, 400, rota);
    }
  });

  it('responde as três consultas', async () => {
    const c = await fetch(`${url}/candidatos`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ itens: [{ itemId: 'a', palavras: ['torneira'] }] }),
    });
    assert.deepEqual(await c.json(), { itens: { a: [MATERIAL] } });
    const m = await fetch(`${url}/materiais?q=torneira`, { headers: h });
    assert.deepEqual(await m.json(), { materiais: [MATERIAL] });
    const l = await fetch(`${url}/materiais/lote`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ coMats: ['123'] }),
    });
    assert.deepEqual(await l.json(), { materiais: [MATERIAL] });
  });

  it('503 quando o Oracle falha, sem o erro na resposta', async () => {
    const fora = await subir(
      'segredo',
      falsa({
        materiais: async () => {
          throw Object.assign(new Error('ORA-12541 senha'), { code: 'ORA-12541' });
        },
      }),
    );
    try {
      const r = await fetch(`${fora.url}/materiais?q=torneira`, { headers: h });
      assert.equal(r.status, 503);
      assert.equal(JSON.stringify(await r.json()).includes('ORA-'), false);
    } finally {
      fora.servidor.close();
    }
  });
});
