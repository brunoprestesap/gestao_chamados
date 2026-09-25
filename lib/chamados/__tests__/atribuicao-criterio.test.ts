import { describe, expect, it, vi } from 'vitest';

import { DECISAO_MOTIVO_MAX } from '@/shared/conversas/conversa.schemas';

import {
  type CandidatoAtribuicao,
  elegiveis,
  montarMotivoTecnico,
  ordenarCandidatos,
} from '../atribuicao-criterio';

/**
 * O critério da atribuição automática, puro (spec 0008, AC-2): menor carga, no
 * empate quem está há mais tempo sem receber chamado (nulo primeiro), e o id
 * por último. O motivo da decisão de técnico cabe sempre em 200 caracteres.
 *
 * covers: AC-2, AC-9 (motivo da decisão)
 */

function candidato(
  id: string,
  carga: number,
  ultimaAtribuicao: string | null = null,
  limite = 5,
): CandidatoAtribuicao {
  return {
    id,
    nome: `Técnico ${id}`,
    carga,
    limite,
    ultimaAtribuicao: ultimaAtribuicao ? new Date(ultimaAtribuicao) : null,
  };
}

describe('elegiveis', () => {
  it('só quem tem carga menor que o limite', () => {
    // Arrange
    const lista = [candidato('a', 4), candidato('b', 5), candidato('c', 6)];

    // Act
    const resultado = elegiveis(lista);

    // Assert
    expect(resultado.map((c) => c.id)).toEqual(['a']);
  });

  it('limite 0 nunca é elegível, nem com carga 0', () => {
    // Act & Assert
    expect(elegiveis([candidato('a', 0, null, 0)])).toEqual([]);
  });

  it('cada técnico usa o próprio limite', () => {
    // Arrange
    const lista = [candidato('a', 2, null, 2), candidato('b', 2, null, 3)];

    // Act & Assert
    expect(elegiveis(lista).map((c) => c.id)).toEqual(['b']);
  });
});

describe('ordenarCandidatos', () => {
  it('menor carga primeiro', () => {
    // Arrange
    const lista = [candidato('a', 3), candidato('b', 1), candidato('c', 2)];

    // Act
    const ordem = ordenarCandidatos(lista).map((c) => c.id);

    // Assert
    expect(ordem).toEqual(['b', 'c', 'a']);
  });

  it('no empate, quem recebeu há mais tempo vai primeiro', () => {
    // Arrange
    const lista = [
      candidato('a', 1, '2026-03-01T12:00:00Z'),
      candidato('b', 1, '2026-01-01T12:00:00Z'),
      candidato('c', 1, '2026-02-01T12:00:00Z'),
    ];

    // Act
    const ordem = ordenarCandidatos(lista).map((c) => c.id);

    // Assert
    expect(ordem).toEqual(['b', 'c', 'a']);
  });

  it('quem nunca recebeu vem antes de todos no empate', () => {
    // Arrange
    const lista = [candidato('a', 1, '2020-01-01T00:00:00Z'), candidato('b', 1, null)];

    // Act
    const ordem = ordenarCandidatos(lista).map((c) => c.id);

    // Assert
    expect(ordem).toEqual(['b', 'a']);
  });

  it('o id desempata por último, de forma estável', () => {
    // Arrange
    const lista = [candidato('b', 1, null), candidato('c', 1, null), candidato('a', 1, null)];

    // Act
    const ordem = ordenarCandidatos(lista).map((c) => c.id);

    // Assert
    expect(ordem).toEqual(['a', 'b', 'c']);
  });

  it('quem nunca recebeu vence o empate em qualquer ordem de entrada', () => {
    // Arrange
    const comData = candidato('a', 1, '2020-01-01T00:00:00Z');
    const nunca = candidato('b', 1, null);

    // Act
    const ordemDireta = ordenarCandidatos([comData, nunca]).map((c) => c.id);
    const ordemInversa = ordenarCandidatos([nunca, comData]).map((c) => c.id);

    // Assert
    expect(ordemDireta).toEqual(['b', 'a']);
    expect(ordemInversa).toEqual(['b', 'a']);
  });

  it('o resultado não depende da ordem em que a lista chega (todas as permutações)', () => {
    // Arrange: carga, data e id decidem, cada um em algum par
    const lista = [
      candidato('d', 2, '2026-01-01T00:00:00Z'),
      candidato('c', 1, '2026-02-01T00:00:00Z'),
      candidato('b', 1, '2026-02-01T00:00:00Z'),
      candidato('a', 1, null),
    ];
    const permutacoes = (itens: CandidatoAtribuicao[]): CandidatoAtribuicao[][] =>
      itens.length <= 1
        ? [itens]
        : itens.flatMap((item, i) =>
            permutacoes([...itens.slice(0, i), ...itens.slice(i + 1)]).map((resto) => [
              item,
              ...resto,
            ]),
          );

    // Act
    const ordens = permutacoes(lista).map((p) =>
      ordenarCandidatos(p)
        .map((c) => c.id)
        .join(''),
    );

    // Assert: 24 permutações, uma única ordem
    expect(ordens).toHaveLength(24);
    expect(new Set(ordens)).toEqual(new Set(['abcd']));
  });

  it('a carga vale mais que a data: menos carga vence mesmo tendo recebido agora', () => {
    // Arrange
    const lista = [
      candidato('a', 2, '2020-01-01T00:00:00Z'),
      candidato('b', 1, '2026-09-25T00:00:00Z'),
    ];

    // Act
    const ordem = ordenarCandidatos(lista).map((c) => c.id);

    // Assert
    expect(ordem).toEqual(['b', 'a']);
  });

  it('não altera a lista recebida', () => {
    // Arrange
    const lista = [candidato('b', 2), candidato('a', 1)];

    // Act
    ordenarCandidatos(lista);

    // Assert
    expect(lista.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('montarMotivoTecnico', () => {
  it('um único elegível: diz que era o único, com a carga', () => {
    // Arrange
    const unico = candidato('a', 2);

    // Act
    const motivo = montarMotivoTecnico(unico, [unico]);

    // Assert
    expect(motivo).toBe('Único técnico elegível com a especialidade: 2 de 5 chamados ativos.');
  });

  it('vários elegíveis sem empate: menor carga entre eles', () => {
    // Arrange
    const escolhido = candidato('a', 1);
    const todos = [escolhido, candidato('b', 2), candidato('c', 3)];

    // Act
    const motivo = montarMotivoTecnico(escolhido, todos);

    // Assert
    expect(motivo).toBe('Menor carga entre 3 técnicos elegíveis: 1 de 5 chamados ativos.');
  });

  it('com empate de carga decidido pela data, diz que decidiu por quem estava há mais tempo sem receber', () => {
    // Arrange: o escolhido recebeu há mais tempo que os outros dois empatados
    const escolhido = candidato('a', 1, '2026-01-01T12:00:00Z');
    const todos = [
      escolhido,
      candidato('b', 1, '2026-02-01T12:00:00Z'),
      candidato('c', 1, '2026-03-01T12:00:00Z'),
      candidato('d', 4),
    ];

    // Act
    const motivo = montarMotivoTecnico(escolhido, todos);

    // Assert
    expect(motivo).toContain('empate com 2');
    expect(motivo).toContain('há mais tempo sem receber');
    expect(motivo).not.toContain('cadastro');
  });

  it('empate em que o escolhido nunca recebeu e o outro já recebeu: decidido pela data', () => {
    // Arrange
    const escolhido = candidato('b', 1, null);
    const todos = [candidato('a', 1, '2026-01-01T12:00:00Z'), escolhido];

    // Act
    const motivo = montarMotivoTecnico(escolhido, todos);

    // Assert
    expect(motivo).toContain('há mais tempo sem receber');
    expect(motivo).not.toContain('cadastro');
  });

  it.each([
    ['todos nunca receberam', null, null],
    ['todos receberam no mesmo instante', '2026-02-01T12:00:00Z', '2026-02-01T12:00:00Z'],
  ])(
    'empate em que a data não diferencia (%s): diz que foi a ordem do cadastro, não a data',
    (_nome, dataEscolhido, dataOutro) => {
      // Arrange
      const escolhido = candidato('a', 1, dataEscolhido);
      const todos = [escolhido, candidato('b', 1, dataOutro), candidato('c', 1, dataOutro)];

      // Act
      const motivo = montarMotivoTecnico(escolhido, todos);

      // Assert
      expect(motivo).toContain('empate com 2');
      expect(motivo).toContain('ordem do cadastro');
      expect(motivo).not.toContain('há mais tempo sem receber');
    },
  );

  it('a frase mais longa possível cabe inteira no limite, sem ser cortada', () => {
    // Arrange: números enormes e o empate decidido pelo cadastro, a redação mais comprida
    const escolhido = candidato('a', Number.MAX_SAFE_INTEGER, null, Number.MAX_SAFE_INTEGER + 1);
    const todos = Array.from({ length: 50 }, (_, i) =>
      candidato(`t${i}`, Number.MAX_SAFE_INTEGER, null, Number.MAX_SAFE_INTEGER + 1),
    );

    // Act
    const motivo = montarMotivoTecnico(escolhido, [escolhido, ...todos]);

    // Assert: se a frase crescer além do limite, o corte come o ponto final e este teste avisa
    expect(motivo.length).toBeLessThanOrEqual(DECISAO_MOTIVO_MAX);
    expect(motivo.endsWith('.')).toBe(true);
  });

  it('corta o texto no limite da decisão quando o limite é menor que a frase', async () => {
    // Arrange: com o limite real (200) nenhuma frase o alcança; um limite menor prova a guarda
    vi.resetModules();
    vi.doMock('@/shared/conversas/conversa.schemas', () => ({ DECISAO_MOTIVO_MAX: 40 }));
    try {
      const { montarMotivoTecnico: montarComLimiteMenor } = await import('../atribuicao-criterio');
      const escolhido = candidato('a', 1);

      // Act
      const motivo = montarComLimiteMenor(escolhido, [escolhido, candidato('b', 2)]);

      // Assert
      expect(motivo).toHaveLength(40);
      expect(motivo).toBe(
        'Menor carga entre 2 técnicos elegíveis: 1 de 5 chamados ativos.'.slice(0, 40),
      );
    } finally {
      vi.doUnmock('@/shared/conversas/conversa.schemas');
      vi.resetModules();
    }
  });

  it('não leva id nem nome do técnico', () => {
    // Arrange
    const escolhido = candidato('a1b2c3d4e5f60718293a4b5c', 1);

    // Act
    const motivo = montarMotivoTecnico(escolhido, [escolhido, candidato('outro', 2)]);

    // Assert
    expect(motivo).not.toContain(escolhido.id);
    expect(motivo).not.toContain(escolhido.nome);
  });
});
