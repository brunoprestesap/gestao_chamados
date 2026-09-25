import { describe, expect, it } from 'vitest';

import { LLM_FAILURE_REASONS } from '@/lib/llm/types';
import { FINAL_PRIORITY_LABELS, type FinalPriority } from '@/shared/chamados/chamado.constants';
import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

import {
  afirmaChamadoJaAberto,
  ehFraseDeChamadoAberto,
  FORMULARIO_HREF,
  fraseDeChamadoAberto,
  fraseDoCartao,
  mensagemDeReserva,
  respostaSemAfirmarAbertura,
} from '../mensagens';

/**
 * Os textos fixos do Sigma para quando a IA não responde (spec 0003).
 * A promessa é dupla: a pessoa sabe que o relato está salvo, e sempre há uma
 * saída pelo formulário. Nunca é texto do modelo, porque o modelo falhou.
 *
 * covers: AC-7 (mensagem de reserva com texto do Sigma e link do formulário)
 */

/** Todo motivo que `lib/llm` pode devolver, inclusive os de fora da lista de falhas. */
const TODOS = [...LLM_FAILURE_REASONS, 'disabled', 'cancelled'] as const;

// ── cobertura dos motivos · AC-7 ─────────────────────────────────

describe('mensagemDeReserva', () => {
  it('responde a todo motivo que `lib/llm` pode devolver', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      const texto = mensagemDeReserva(motivo);
      expect(texto, `sem texto para ${motivo}`).toBeTruthy();
      expect(texto.length).toBeGreaterThan(40);
    }
  });

  it('diz em toda frase que o relato continua salvo', () => {
    // Act & Assert: é o que impede a pessoa de achar que perdeu o que escreveu
    for (const motivo of TODOS) {
      expect(mensagemDeReserva(motivo).toLowerCase(), motivo).toContain('salvo');
    }
  });

  it('oferece o formulário em toda frase, que é a saída sem a IA', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      expect(mensagemDeReserva(motivo).toLowerCase(), motivo).toContain('formulário');
    }
  });

  it('nunca vaza o motivo técnico nem endereço', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      const texto = mensagemDeReserva(motivo);
      expect(texto).not.toContain(motivo);
      expect(texto).not.toMatch(/http|vLLM|LLM_|localhost/i);
    }
  });

  it('escreve em português, com maiúscula no começo e ponto no fim', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      const texto = mensagemDeReserva(motivo);
      expect(texto[0]).toBe(texto[0].toUpperCase());
      expect(texto.trim().endsWith('.')).toBe(true);
    }
  });
});

// ── frases que se distinguem onde importa · AC-7 ─────────────────

describe('mensagemDeReserva, por motivo', () => {
  it('diz que está desligado quando está desligado, em vez de fingir defeito', () => {
    // Act & Assert
    expect(mensagemDeReserva('disabled').toLowerCase()).toContain('desligado');
  });

  it('fala de demora no prazo estourado', () => {
    // Act & Assert
    expect(mensagemDeReserva('timeout').toLowerCase()).toMatch(/demor/);
  });

  it('pede um minuto quando é a pessoa que mandou mensagem demais', () => {
    // Act & Assert
    expect(mensagemDeReserva('rate_limited').toLowerCase()).toMatch(/seguidas|minuto/);
  });

  it('explica o descarte quando a resposta foi reprovada pelo schema', () => {
    // Act & Assert
    expect(mensagemDeReserva('invalid_output').toLowerCase()).toMatch(/descartada|não entendeu/);
  });

  it('cai no texto padrão num motivo desconhecido, sem lançar', () => {
    // Act
    const texto = mensagemDeReserva('motivo_novo' as never);

    // Assert
    expect(texto).toBeTruthy();
    expect(texto.toLowerCase()).toContain('formulário');
  });
});

// ── AC-14: o modelo não manda dizer que o chamado já existe ──────

describe('afirmaChamadoJaAberto', () => {
  it('pega o modelo dizendo que o chamado já foi ou está aberto', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('O chamado foi aberto para reparo de vazamento.')).toBe(true);
    expect(afirmaChamadoJaAberto('O chamado já está aberto, obrigado por reportar.')).toBe(true);
  });

  it('pega o modelo dizendo que o chamado foi criado, registrado ou tem número', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('O chamado foi criado com sucesso.')).toBe(true);
    expect(afirmaChamadoJaAberto('Seu chamado foi registrado.')).toBe(true);
    expect(afirmaChamadoJaAberto('Já abrimos o seu chamado.')).toBe(true);
    expect(afirmaChamadoJaAberto('O número do chamado é 12345.')).toBe(true);
    expect(afirmaChamadoJaAberto('Guarde o protocolo do chamado.')).toBe(true);
  });

  it('pega um número de chamado inventado, mesmo sem a frase de abertura', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('Fica registrado como CHM-2026-00671.')).toBe(true);
  });

  it('deixa passar uma resposta comum, que só confirma o relato ou pergunta algo', () => {
    // Act & Assert
    expect(afirmaChamadoJaAberto('Entendi que a lâmpada da sala 302 queimou.')).toBe(false);
    expect(afirmaChamadoJaAberto('Você pode dizer em que sala é o problema?')).toBe(false);
    expect(afirmaChamadoJaAberto('Esse é o segundo chamado que você abre este mês.')).toBe(false);
  });
});

describe('respostaSemAfirmarAbertura', () => {
  it('troca a resposta pela frase fixa quando ela afirma que o chamado já existe', () => {
    // Act
    const texto = respostaSemAfirmarAbertura('O chamado foi aberto. Obrigado por reportar.');

    // Assert
    expect(texto).not.toContain('O chamado foi aberto');
    expect(texto.toLowerCase()).toContain('nenhum chamado foi aberto ainda');
  });

  it('não mexe numa resposta que não afirma nada sobre o chamado existir', () => {
    // Arrange
    const original = 'Entendi que a lâmpada da sala 302 queimou. Pode confirmar o andar?';

    // Act & Assert
    expect(respostaSemAfirmarAbertura(original)).toBe(original);
  });
});

// ── spec 0007, AC-14: texto variando por status ───────────────────

describe('fraseDeChamadoAberto', () => {
  it('sem opções (padrão), promete a análise de um Preposto', () => {
    // Act
    const texto = fraseDeChamadoAberto('CHM-2026-00001');

    // Assert
    expect(texto).toContain('#CHM-2026-00001');
    expect(texto).toContain('Preposto');
  });

  it('validado sozinho, confirma a prioridade em vez de prometer análise (AC-14)', () => {
    // Act
    const texto = fraseDeChamadoAberto('CHM-2026-00001', {
      validado: true,
      finalPriority: 'ALTA',
    });

    // Assert
    expect(texto).toContain('#CHM-2026-00001');
    expect(texto).toContain('prioridade alta');
    expect(texto).not.toContain('Preposto');
  });

  it('validado sem a prioridade (defensivo), cai no texto de sempre', () => {
    // Act
    const texto = fraseDeChamadoAberto('CHM-2026-00001', { validado: true, finalPriority: null });

    // Assert
    expect(texto).toContain('Preposto');
  });
});

// ── para onde o link aponta ──────────────────────────────────────

describe('FORMULARIO_HREF', () => {
  it('aponta para a lista onde fica o botão de novo chamado', () => {
    // Assert
    expect(FORMULARIO_HREF).toBe('/meus-chamados');
  });
});

// ── spec 0008, AC-12: o resultado da atribuição automática ─────────

describe('fraseDeChamadoAberto · atribuição automática (spec 0008, AC-12)', () => {
  const validado = { validado: true, finalPriority: 'ALTA' as const };

  it('atribuído: diz o nome do técnico e não promete análise do Preposto', () => {
    // Act
    const texto = fraseDeChamadoAberto('CHM-2026-00001', {
      ...validado,
      atribuicao: { resultado: 'atribuido', tecnicoId: 't1', tecnicoNome: 'Carla' },
    });

    // Assert
    expect(texto).toContain('#CHM-2026-00001');
    expect(texto).toContain('prioridade alta');
    expect(texto).toContain('o técnico Carla já foi designado');
    expect(texto).not.toContain('Preposto');
  });

  it('atribuído com nome vazio: cai em um técnico, nunca em branco', () => {
    // Act
    const texto = fraseDeChamadoAberto('CHM-2026-00001', {
      ...validado,
      atribuicao: { resultado: 'atribuido', tecnicoId: 't1', tecnicoNome: '  ' },
    });

    // Assert
    expect(texto).toContain('um técnico já foi designado');
    expect(texto).not.toContain('o técnico  ');
  });

  it('sem técnico: diz que um Preposto vai designar, sem revelar o motivo', () => {
    // Act
    const texto = fraseDeChamadoAberto('CHM-2026-00001', {
      ...validado,
      atribuicao: { resultado: 'sem_tecnico', motivo: 'sem_vaga' },
    });

    // Assert
    expect(texto).toContain('Um Preposto vai designar o técnico');
    expect(texto).not.toContain('limite');
    expect(texto).not.toContain('especialidade');
    expect(texto).not.toContain('sem_vaga');
  });

  it('nao_tentada e ausente mantêm a frase da 0007, palavra por palavra', () => {
    // Arrange
    const da0007 = fraseDeChamadoAberto('CHM-2026-00001', validado);

    // Act
    const naoTentada = fraseDeChamadoAberto('CHM-2026-00001', {
      ...validado,
      atribuicao: { resultado: 'nao_tentada' },
    });

    // Assert
    expect(naoTentada).toBe(da0007);
    expect(da0007).toBe(
      'Chamado #CHM-2026-00001 aberto com prioridade alta, já validada. Você acompanha o atendimento por aqui.',
    );
  });

  it('chamado que nasceu aberto ignora o resultado: quem decide é o Preposto', () => {
    // Act
    const texto = fraseDeChamadoAberto('CHM-2026-00001', {
      validado: false,
      finalPriority: null,
      atribuicao: { resultado: 'atribuido', tecnicoId: 't1', tecnicoNome: 'Carla' },
    });

    // Assert
    expect(texto).toContain('Um Preposto vai analisar');
    expect(texto).not.toContain('Carla');
  });
});

// ── o reconhecimento da frase, para a leitura da conversa ──────────

describe('ehFraseDeChamadoAberto', () => {
  const NUMERO = 'CHM-2026-00412';

  /** Toda forma que `fraseDeChamadoAberto` monta: sem validação, e validado com cada resultado. */
  function todasAsFrases(): { descricao: string; texto: string }[] {
    const prioridades = Object.keys(FINAL_PRIORITY_LABELS) as FinalPriority[];
    const resultados = [
      undefined,
      { resultado: 'nao_tentada' as const },
      { resultado: 'atribuido' as const, tecnicoId: 't1', tecnicoNome: 'Carla' },
      { resultado: 'atribuido' as const, tecnicoId: 't1', tecnicoNome: '  ' },
      { resultado: 'sem_tecnico' as const, motivo: 'sem_especialidade' as const },
      { resultado: 'sem_tecnico' as const, motivo: 'sem_vaga' as const },
      { resultado: 'sem_tecnico' as const, motivo: 'erro' as const },
    ];
    return [
      { descricao: 'sem validação', texto: fraseDeChamadoAberto(NUMERO) },
      ...prioridades.flatMap((finalPriority) =>
        resultados.map((atribuicao) => ({
          descricao: `${finalPriority}, ${atribuicao?.resultado ?? 'sem resultado'}`,
          texto: fraseDeChamadoAberto(NUMERO, { validado: true, finalPriority, atribuicao }),
        })),
      ),
    ];
  }

  it('reconhece toda frase que fraseDeChamadoAberto sabe montar, em todas as variantes', () => {
    // Arrange
    const frases = todasAsFrases();

    // Act
    const naoReconhecidas = frases.filter((f) => !ehFraseDeChamadoAberto(f.texto, NUMERO));

    // Assert: 1 sem validação, mais 4 prioridades por 7 resultados
    expect(frases).toHaveLength(1 + 4 * 7);
    expect(naoReconhecidas).toEqual([]);
  });

  it('a frase de um chamado não é a de outro, nem quando um número é o começo do outro', () => {
    // Arrange
    const validada = { validado: true, finalPriority: 'NORMAL' as const };

    // Act & Assert
    expect(ehFraseDeChamadoAberto(fraseDeChamadoAberto('412', validada), '4120')).toBe(false);
    expect(ehFraseDeChamadoAberto(fraseDeChamadoAberto('4120', validada), '412')).toBe(false);
    expect(ehFraseDeChamadoAberto(fraseDeChamadoAberto('412'), '4120')).toBe(false);
    expect(ehFraseDeChamadoAberto(fraseDeChamadoAberto('CHM-2026-00413'), NUMERO)).toBe(false);
  });

  it('não confunde os outros textos do Sigma na conversa com o aviso de abertura', () => {
    // Act & Assert
    for (const motivo of TODOS) {
      expect(ehFraseDeChamadoAberto(mensagemDeReserva(motivo), NUMERO)).toBe(false);
    }
    expect(ehFraseDeChamadoAberto('', NUMERO)).toBe(false);
    expect(ehFraseDeChamadoAberto(`Chamado #${NUMERO} aberto`, NUMERO)).toBe(false);
    expect(ehFraseDeChamadoAberto(`Seu chamado #${NUMERO} foi aberto.`, NUMERO)).toBe(false);
  });
});

// ── o texto do cartão resumo ───────────────────────────────────────

describe('fraseDoCartao', () => {
  const CARTAO: CartaoPayload = {
    modo: 'ia',
    servico: {
      catalogServiceId: 'a'.repeat(24),
      subtypeId: 'b'.repeat(24),
      tipoServico: 'Manutenção Predial',
      rotuloServico: 'Reparo de tomada',
      rotuloSubtipo: 'Elétrica',
    },
    unidade: { unitId: 'c'.repeat(24), rotulo: 'Núcleo de Gestão de Pessoas', andar: '2º andar' },
    localExato: 'sala 5',
    faltando: [],
  };
  const BASE =
    'Resumo do chamado para você conferir e confirmar: serviço Reparo de tomada, de Elétrica; unidade Núcleo de Gestão de Pessoas, 2º andar; local sala 5. O texto desta conversa vira a descrição do chamado.';

  it('monta a frase com o serviço, a unidade e o local, terminando o local com um ponto', () => {
    expect(fraseDoCartao(CARTAO)).toBe(BASE);
  });

  it('um local que já termina em pontuação não gera ponto duplo: a frase é a mesma', () => {
    // Arrange: o local vem do modelo ou do que a pessoa digitou, e pode terminar em qualquer sinal
    const terminacoes = ['.', '!', '?', '...', '…', ' .', ';', ':', ',', '. ', '.  '];

    // Act
    const divergentes = terminacoes.filter(
      (fim) => fraseDoCartao({ ...CARTAO, localExato: `sala 5${fim}` }) !== BASE,
    );

    // Assert
    expect(divergentes).toEqual([]);
    expect(fraseDoCartao({ ...CARTAO, localExato: 'sala 5.' })).not.toContain('5..');
  });

  it('só a frase perde a pontuação: o local do payload segue como foi digitado', () => {
    // Arrange
    const cartao: CartaoPayload = { ...CARTAO, localExato: 'sala 5.' };

    // Act
    fraseDoCartao(cartao);

    // Assert
    expect(cartao.localExato).toBe('sala 5.');
  });

  it('sem local, diz "local a informar" e fecha com um ponto só', () => {
    // Act
    const texto = fraseDoCartao({ ...CARTAO, localExato: null, faltando: ['local'] });

    // Assert
    expect(texto).toContain('local a informar. O texto desta conversa');
    expect(texto).toContain('para você completar e confirmar');
  });

  it('local só de pontuação não some da frase, e ela continua inteira', () => {
    // Act
    const texto = fraseDoCartao({ ...CARTAO, localExato: '...' });

    // Assert: nada é perdido em silêncio, e o resto da frase segue no lugar
    expect(texto).toContain('local ...');
    expect(texto).toContain('O texto desta conversa vira a descrição do chamado.');
  });

  it('cartão manual: a frase pede o tipo e a unidade, sem depender do local', () => {
    // Act
    const texto = fraseDoCartao({
      ...CARTAO,
      modo: 'manual',
      servico: null,
      unidade: null,
      localExato: 'sala 5.',
      faltando: ['tipo', 'unidade'],
    });

    // Assert
    expect(texto).toBe(
      'Resumo do chamado para você completar e confirmar: tipo de serviço a escolher; unidade a escolher; local sala 5. O texto desta conversa vira a descrição do chamado.',
    );
  });
});
