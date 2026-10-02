import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fecharBanco, type OperacaoGuardada } from '../banco';
import {
  contarPendentes,
  descartarOperacao,
  guardarOperacao,
  limparResolvidasAntigas,
  listarOperacoes,
  registrarResultados,
} from '../fila';
import { gerarClientOpId } from '../id';
import { apagarPacote, lerPacote, salvarPacote } from '../pacote';
import { sincronizarFila } from '../sincronizar';

/**
 * A fila do aparelho (spec 0012, AC-6 e AC-15) sobre um IndexedDB falso: é
 * por pessoa, sobe em ordem e em lotes de 50, e 401 ou rede caída deixam
 * tudo pendente.
 */

const A = 'usuario-a';
const B = 'usuario-b';

function operacao(userId: string, criadaEm: string): OperacaoGuardada {
  const clientOpId = gerarClientOpId();
  return {
    clientOpId,
    userId,
    estado: 'pendente',
    criadaEm,
    operacao: {
      clientOpId,
      tipo: 'conferencia',
      campanhaId: 'c'.repeat(24),
      ativoId: 'a'.repeat(24),
      localizacaoId: 'b'.repeat(24),
      conferidoEm: criadaEm,
    },
    rotulo: { codigo: '1', descricao: 'Split', local: 'Sede/Sala 1' },
  };
}

function resposta(status: number, corpo?: unknown): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), { status });
}

/** Um servidor falso que aceita tudo e guarda os lotes recebidos. */
function servidorAceita() {
  const lotes: { clientOpId: string }[][] = [];
  const enviar = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { operacoes } = JSON.parse(String(init?.body)) as {
      operacoes: { clientOpId: string }[];
    };
    lotes.push(operacoes);
    return resposta(200, {
      resultados: operacoes.map((o) => ({ clientOpId: o.clientOpId, estado: 'aceita' })),
    });
  });
  return { enviar: enviar as unknown as typeof fetch, lotes };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await fecharBanco();
});

describe('gerarClientOpId', () => {
  it('gera UUID v4 sem crypto.randomUUID', () => {
    const id = gerarClientOpId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(gerarClientOpId()).not.toBe(id);
  });
});

describe('fila por usuário (AC-15)', () => {
  it('a fila de A não aparece para B nem sobe com a sessão de B', async () => {
    await guardarOperacao(operacao(A, '2026-10-02T10:00:00.000Z'));
    await guardarOperacao(operacao(A, '2026-10-02T10:01:00.000Z'));
    await guardarOperacao(operacao(B, '2026-10-02T10:02:00.000Z'));

    expect(await contarPendentes(A)).toBe(2);
    expect(await contarPendentes(B)).toBe(1);

    const { enviar, lotes } = servidorAceita();
    await sincronizarFila(B, enviar);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toHaveLength(1);
    expect(await contarPendentes(A)).toBe(2);
    expect(await contarPendentes(B)).toBe(0);
  });

  it('resultado com clientOpId de outra pessoa não mexe na operação dela', async () => {
    const op = operacao(A, '2026-10-02T10:00:00.000Z');
    await guardarOperacao(op);
    await registrarResultados(B, [{ clientOpId: op.clientOpId, estado: 'aceita' }]);
    expect(await contarPendentes(A)).toBe(1);
    await descartarOperacao(B, op.clientOpId);
    expect(await listarOperacoes(A)).toHaveLength(1);
  });

  it('o pacote é por pessoa e sair apaga só o dela', async () => {
    const pacote = {
      campanha: { id: 'c', nome: 'V', status: 'aberta', abertaEm: '' },
      geradoEm: '',
      ativos: [],
      locais: [],
      categorias: [],
      conferidos: [],
    };
    await salvarPacote(A, pacote);
    await salvarPacote(B, pacote);
    await apagarPacote(A);
    expect(await lerPacote(A)).toBeUndefined();
    expect(await lerPacote(B)).toBeDefined();
  });
});

describe('sincronização (AC-6)', () => {
  it('sobe em ordem de criadaEm, em lotes de até 50', async () => {
    const ops = Array.from({ length: 120 }, (_, i) =>
      operacao(A, new Date(Date.UTC(2026, 9, 2, 10, 0, 120 - i)).toISOString()),
    );
    for (const o of ops) await guardarOperacao(o);

    const { enviar, lotes } = servidorAceita();
    const r = await sincronizarFila(A, enviar);

    expect(r).toEqual({ estado: 'ok', enviadas: 120 });
    expect(lotes.map((l) => l.length)).toEqual([50, 50, 20]);
    const ordemEsperada = [...ops]
      .sort((x, y) => x.criadaEm.localeCompare(y.criadaEm))
      .map((o) => o.clientOpId);
    expect(lotes.flat().map((o) => o.clientOpId)).toEqual(ordemEsperada);
    expect(await contarPendentes(A)).toBe(0);
  });

  it('grava o estado de cada item: enviado, já conferido, recusado', async () => {
    const [o1, o2, o3] = [1, 2, 3].map((i) => operacao(A, `2026-10-02T10:0${i}:00.000Z`));
    for (const o of [o1, o2, o3]) await guardarOperacao(o);
    const enviar = vi.fn(async () =>
      resposta(200, {
        resultados: [
          { clientOpId: o1.clientOpId, estado: 'aceita' },
          { clientOpId: o2.clientOpId, estado: 'ja_conferido', conferidoPor: 'Ana' },
          { clientOpId: o3.clientOpId, estado: 'recusada', mensagem: 'Ativo inexistente' },
        ],
      }),
    ) as unknown as typeof fetch;

    await sincronizarFila(A, enviar);
    const estados = (await listarOperacoes(A)).map((o) => o.estado);
    expect(estados).toEqual(['enviada', 'ja_conferido', 'recusada']);
    expect((await listarOperacoes(A))[2].resultado?.mensagem).toBe('Ativo inexistente');
  });

  it('sessão expirada (401) deixa tudo pendente', async () => {
    await guardarOperacao(operacao(A, '2026-10-02T10:00:00.000Z'));
    const r = await sincronizarFila(A, (async () => resposta(401)) as unknown as typeof fetch);
    expect(r.estado).toBe('sessao_expirada');
    expect(await contarPendentes(A)).toBe(1);
  });

  it('rede caída e 5xx deixam tudo pendente', async () => {
    await guardarOperacao(operacao(A, '2026-10-02T10:00:00.000Z'));
    const semRede = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect((await sincronizarFila(A, semRede)).estado).toBe('sem_conexao');
    const falha = (async () => resposta(500)) as unknown as typeof fetch;
    expect((await sincronizarFila(A, falha)).estado).toBe('erro_servidor');
    expect(await contarPendentes(A)).toBe(1);
  });

  it('a fila sobrevive a fechar e reabrir o banco (recarregar a página)', async () => {
    await guardarOperacao(operacao(A, '2026-10-02T10:00:00.000Z'));
    await fecharBanco();
    expect(await contarPendentes(A)).toBe(1);
  });
});

describe('limpeza', () => {
  it('resolvidas saem depois de 7 dias; pendentes e recusadas ficam', async () => {
    const velha = '2026-09-01T10:00:00.000Z';
    const enviada = { ...operacao(A, velha), estado: 'enviada' as const, resolvidaEm: velha };
    const recusada = { ...operacao(A, velha), estado: 'recusada' as const, resolvidaEm: velha };
    const pendente = operacao(A, velha);
    const recente = {
      ...operacao(A, velha),
      estado: 'ja_conferido' as const,
      resolvidaEm: '2026-10-01T10:00:00.000Z',
    };
    for (const o of [enviada, recusada, pendente, recente]) await guardarOperacao(o);

    await limparResolvidasAntigas(A, new Date('2026-10-02T10:00:00.000Z'));
    const restantes = (await listarOperacoes(A)).map((o) => o.clientOpId).sort();
    expect(restantes).toEqual(
      [recusada.clientOpId, pendente.clientOpId, recente.clientOpId].sort(),
    );
  });
});
