import { describe, expect, it } from 'vitest';

import {
  lerQuadro,
  QUADRO_SEPARADOR,
  type QuadroResposta,
  quadroRespostaSchema,
  serializarQuadro,
} from '../quadro.schemas';

/**
 * O contrato de rede da resposta do assistente (spec 0003). É a única coisa que
 * atravessa entre a rota e a tela, então o que ele aceita e o que ele recusa
 * decide se a conversa aparece ou quebra no meio.
 *
 * covers: AC-5 (quadros `inicio`, `parcial`, `fim`), AC-5b (`mensagemId` nulo)
 */

const ID = '6aad5286df6f201a25eda5f1';
const OUTRO_ID = '6aad5286df6f201a25eda5f2';

// ── ida e volta · AC-5 ───────────────────────────────────────────

describe('serializarQuadro e lerQuadro', () => {
  it('termina cada quadro numa quebra de linha, que é o que separa um do outro', () => {
    // Act
    const linha = serializarQuadro({ tipo: 'parcial', texto: 'Entendi que' });

    // Assert
    expect(linha.endsWith(QUADRO_SEPARADOR)).toBe(true);
    expect(linha.indexOf(QUADRO_SEPARADOR)).toBe(linha.length - 1);
  });

  it('leva e traz o mesmo quadro, sem perder campo pelo caminho', () => {
    // Arrange
    const quadros: QuadroResposta[] = [
      { tipo: 'inicio', conversaId: ID, mensagemId: OUTRO_ID },
      { tipo: 'parcial', texto: 'texto acumulado' },
      { tipo: 'fim', texto: 'resposta pronta', mensagemId: OUTRO_ID, motivo: null },
      { tipo: 'reserva', texto: 'o assistente falhou', mensagemId: null, motivo: 'timeout' },
    ];

    // Act & Assert
    for (const quadro of quadros) {
      expect(lerQuadro(serializarQuadro(quadro).trimEnd())).toEqual(quadro);
    }
  });

  it('não deixa o texto do modelo quebrar a linha do fluxo', () => {
    // Arrange: resposta com quebra de linha dentro
    const quadro: QuadroResposta = { tipo: 'parcial', texto: 'primeira linha\nsegunda linha' };

    // Act
    const linha = serializarQuadro(quadro);

    // Assert: uma quebra só, a do fim; a de dentro virou escape do JSON
    expect(linha.split(QUADRO_SEPARADOR)).toHaveLength(2);
    expect(lerQuadro(linha)).toEqual(quadro);
  });

  it('preserva acento e emoji, que é o que a pessoa realmente escreve', () => {
    // Arrange
    const quadro: QuadroResposta = { tipo: 'parcial', texto: 'infiltração no 3º andar 💧' };

    // Act & Assert
    expect(lerQuadro(serializarQuadro(quadro))).toEqual(quadro);
  });
});

// ── o que o leitor recusa · AC-5 ─────────────────────────────────

describe('lerQuadro, entrada ruim', () => {
  it('devolve nulo na linha em branco, para a tela ignorar em vez de quebrar', () => {
    // Act & Assert
    expect(lerQuadro('')).toBeNull();
    expect(lerQuadro('   ')).toBeNull();
    expect(lerQuadro('\n')).toBeNull();
  });

  it('devolve nulo no JSON quebrado, que é o que chega quando a conexão corta no meio', () => {
    // Act & Assert
    expect(lerQuadro('{"tipo":"parcial","texto":"metad')).toBeNull();
    expect(lerQuadro('não é json')).toBeNull();
  });

  it('devolve nulo no tipo que não existe, em vez de repassar adiante', () => {
    // Act & Assert
    expect(lerQuadro('{"tipo":"desconhecido","texto":"x"}')).toBeNull();
  });

  it('devolve nulo quando falta campo obrigatório do quadro', () => {
    // Act & Assert: `inicio` sem `mensagemId`
    expect(lerQuadro(`{"tipo":"inicio","conversaId":"${ID}"}`)).toBeNull();
    // `fim` sem `mensagemId` (que é obrigatório, mesmo podendo ser nulo)
    expect(lerQuadro('{"tipo":"fim","texto":"pronta"}')).toBeNull();
  });

  it('recusa identificador que não é ObjectId, para id inventado não virar link', () => {
    // Act & Assert
    expect(lerQuadro('{"tipo":"inicio","conversaId":"abc","mensagemId":"def"}')).toBeNull();
  });

  it('aguenta JSON que não é objeto, sem lançar', () => {
    // Act & Assert
    expect(lerQuadro('[1,2,3]')).toBeNull();
    expect(lerQuadro('"só um texto"')).toBeNull();
    expect(lerQuadro('null')).toBeNull();
  });
});

// ── a resposta que não ficou salva · AC-5b ───────────────────────

describe('quadro `fim` sem gravação', () => {
  it('aceita `mensagemId` nulo, que é como a tela sabe que a resposta não ficou salva', () => {
    // Arrange
    const quadro = {
      tipo: 'fim' as const,
      texto: 'resposta boa que não coube',
      mensagemId: null,
      motivo: 'limite_mensagens' as const,
    };

    // Act
    const lido = lerQuadro(serializarQuadro(quadro));

    // Assert
    expect(lido).toEqual(quadro);
    expect(lido && lido.tipo === 'fim' && lido.mensagemId).toBeNull();
  });

  it('aceita o `fim` sem motivo, que é o caso normal de resposta gravada', () => {
    // Act
    const lido = lerQuadro(`{"tipo":"fim","texto":"ok","mensagemId":"${ID}"}`);

    // Assert
    expect(lido).toMatchObject({ tipo: 'fim', mensagemId: ID });
  });

  it('só aceita motivo que existe em `lib/conversas`, não texto solto', () => {
    // Act & Assert
    expect(
      quadroRespostaSchema.safeParse({
        tipo: 'fim',
        texto: 'x',
        mensagemId: null,
        motivo: 'motivo_inventado',
      }).success,
    ).toBe(false);
  });
});
