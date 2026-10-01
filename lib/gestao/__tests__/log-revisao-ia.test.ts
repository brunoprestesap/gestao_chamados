import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logRevisaoIa } from '../log-revisao-ia';

/**
 * A linha `[revisao-ia]` (spec 0009, AC-17): um formato só, sem texto de
 * motivo, `direcao` presente só quando informada.
 *
 * covers: AC-17
 */

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

function ultimaLinha() {
  const chamada = warn.mock.calls.find((c: unknown[]) => c[0] === '[revisao-ia]');
  return chamada ? JSON.parse(chamada[1] as string) : undefined;
}

describe('logRevisaoIa', () => {
  it('grava chamadoId, campo, operacao e resultado, sem direcao quando ausente', () => {
    logRevisaoIa({
      chamadoId: 'a'.repeat(24),
      campo: 'servico',
      operacao: 'corrigir_servico',
      resultado: 'ok',
    });

    expect(ultimaLinha()).toEqual({
      chamadoId: 'a'.repeat(24),
      campo: 'servico',
      operacao: 'corrigir_servico',
      resultado: 'ok',
    });
  });

  it('inclui direcao só quando informada, para a correção de prioridade', () => {
    logRevisaoIa({
      chamadoId: 'a'.repeat(24),
      campo: 'prioridade',
      operacao: 'corrigir_prioridade',
      direcao: 'sobe',
      resultado: 'ok',
    });

    expect(ultimaLinha()).toMatchObject({ direcao: 'sobe' });
  });

  it('campo null vale para a confirmação em lote (sem campo único)', () => {
    logRevisaoIa({
      chamadoId: 'a'.repeat(24),
      campo: null,
      operacao: 'confirmar',
      resultado: 'ok',
    });

    expect(ultimaLinha()?.campo).toBeNull();
  });

  it('operacao reatribuir, sem direcao', () => {
    logRevisaoIa({
      chamadoId: 'a'.repeat(24),
      campo: 'tecnico',
      operacao: 'reatribuir',
      resultado: 'recusada',
    });

    const linha = ultimaLinha();
    expect(linha.operacao).toBe('reatribuir');
    expect(linha.direcao).toBeUndefined();
  });

  it('resultado parcial:<passo> vai como veio, sem parsear o passo', () => {
    logRevisaoIa({
      chamadoId: 'a'.repeat(24),
      campo: 'servico',
      operacao: 'corrigir_servico',
      resultado: 'parcial:aviso',
    });

    expect(ultimaLinha()?.resultado).toBe('parcial:aviso');
  });

  it('nunca escreve a palavra motivo na linha gravada', () => {
    logRevisaoIa({
      chamadoId: 'a'.repeat(24),
      campo: 'prioridade',
      operacao: 'corrigir_prioridade',
      direcao: 'desce',
      resultado: 'ok',
    });

    const [, payload] = warn.mock.calls[0];
    expect(payload as string).not.toMatch(/motivo/i);
  });
});
