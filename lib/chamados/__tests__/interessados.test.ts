import { afterEach, describe, expect, it, vi } from 'vitest';

const falhar = vi.hoisted(() => () => {
  throw new Error('banco fora');
});
vi.mock('@/models/Chamado', () => ({ ChamadoModel: { findById: falhar } }));
vi.mock('@/models/ChamadoInteressado', () => ({
  ChamadoInteressadoModel: { find: falhar, updateMany: falhar },
}));

import { notificarFimAosInteressados, tituloDoFim, zerarAvisoDeFim } from '../interessados';

/**
 * O texto do aviso de fim e a garantia de que nada aqui derruba a ação que
 * mudou o status (spec 0017). O resto, com o Mongo de verdade, está em
 * `interessados.db.test.ts`.
 *
 * covers: AC-17, AC-18
 */

afterEach(() => vi.restoreAllMocks());

describe('tituloDoFim (AC-17)', () => {
  it('diz que o chamado acompanhado foi concluído', () => {
    expect(tituloDoFim('CHM-2026-00012', 'concluído')).toBe(
      'O chamado #CHM-2026-00012 que você acompanha foi concluído',
    );
  });

  it('no cancelamento, convida a abrir um novo se o problema continua', () => {
    expect(tituloDoFim('CHM-2026-00012', 'cancelado')).toBe(
      'O chamado #CHM-2026-00012 que você acompanha foi cancelado. Se o problema continua, abra um novo chamado',
    );
  });

  it('na recusa, convida a abrir um novo se o problema continua', () => {
    expect(tituloDoFim('CHM-2026-00012', 'recusado')).toBe(
      'O chamado #CHM-2026-00012 que você acompanha foi recusado. Se o problema continua, abra um novo chamado',
    );
  });
});

describe('nunca lança', () => {
  it('notificarFimAosInteressados engole a falha do banco e loga sem texto', async () => {
    // Arrange
    const erros: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      erros.push(a.map(String).join(' '));
    });

    // Act / Assert
    await expect(
      notificarFimAosInteressados('6aad5286df6f201a25eda5f9', 'concluído'),
    ).resolves.toBeUndefined();
    expect(erros.join('\n')).toContain('"operacao":"notificarFimAosInteressados"');
    expect(erros.join('\n')).not.toContain('banco fora');
  });

  it('zerarAvisoDeFim engole a falha do banco (AC-18)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(zerarAvisoDeFim('6aad5286df6f201a25eda5f9')).resolves.toBeUndefined();
  });
});
