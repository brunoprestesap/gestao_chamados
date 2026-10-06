import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

import {
  codigosDoRelato,
  desempatarPorLocal,
  PALAVRAS_LOCAL_IGNORADAS,
  palavrasDoLocal,
  resumoDoAtivo,
} from '../ativo-do-cartao';
import { chaveDoAtivo, conteudoDaProposta, conteudoDoCartao, mesmoConteudo } from '../proposta';

/**
 * As partes puras do equipamento no cartão (spec 0014): o código no relato,
 * as palavras do local, o desempate, a chave que decide cartão novo e o
 * resumo da linha de log. A consulta ao banco está em
 * `ativo-do-cartao.db.test.ts`.
 *
 * covers: AC-1, AC-2, AC-7, AC-13
 */

const relato = (autor: string, texto: string, tipo = 'texto') => ({ autor, tipo, texto });

describe('codigosDoRelato (AC-1)', () => {
  it('lê só o texto do solicitante, na ordem, sem repetição', () => {
    // Arrange
    const mensagens = [
      relato('solicitante', 'o ar de tombo 11997 pinga'),
      relato('ia', 'Qual o tombo? Exemplo: tombo 22222.'),
      relato('sistema', 'aviso tombo 33333'),
      relato('solicitante', 'e o MNT-0012, e de novo o tombo 11997'),
    ];

    // Act / Assert
    expect(codigosDoRelato(mensagens)).toEqual(['11997', 'MNT-0012']);
  });

  it('ignora o cartão, mesmo de autor solicitante', () => {
    expect(codigosDoRelato([relato('solicitante', 'tombo 11997', 'cartao')])).toEqual([]);
  });

  it('não junta a palavra de uma mensagem com o número da seguinte', () => {
    expect(
      codigosDoRelato([
        relato('solicitante', 'o ar do tombo'),
        relato('solicitante', '11997 pinga'),
      ]),
    ).toEqual([]);
  });
});

describe('palavrasDoLocal (AC-2)', () => {
  it('fica com números e palavras de 3 letras ou mais, sem acento e em minúsculas', () => {
    expect(palavrasDoLocal('Sala 302, Gabinete do Juíz B')).toEqual(['302', 'gabinete', 'juiz']);
  });

  it('tira as palavras genéricas', () => {
    expect(palavrasDoLocal('Prédio sede, bloco A, 2º andar, piso, sala')).toEqual(['sede', '2']);
    expect([...PALAVRAS_LOCAL_IGNORADAS]).toEqual(['sala', 'andar', 'bloco', 'predio', 'piso']);
  });

  it('devolve vazio para local nulo ou vazio', () => {
    expect(palavrasDoLocal(null)).toEqual([]);
    expect(palavrasDoLocal('')).toEqual([]);
  });
});

describe('desempatarPorLocal (AC-2)', () => {
  const a302 = { caminho: 'Sede/Sala 302', descricao: 'Split 12000' };
  const a303a = { caminho: 'Sede/Sala 303', descricao: 'Split 18000' };
  const a303b = { caminho: 'Sede/Sala 303', descricao: 'Split 9000' };
  const todos = [a302, a303a, a303b];

  it('fica só com quem tem mais palavras em comum', () => {
    expect(desempatarPorLocal(todos, 'sala 302')).toEqual([a302]);
    expect(desempatarPorLocal(todos, 'SALA 303')).toEqual([a303a, a303b]);
  });

  it('também compara com a descrição', () => {
    expect(desempatarPorLocal(todos, 'perto do split 9000')).toEqual([a303b]);
  });

  it('mantém todos quando nenhuma palavra casa', () => {
    expect(desempatarPorLocal(todos, 'perto da janela')).toEqual(todos);
  });

  it('mantém todos quando o local só tem palavras genéricas', () => {
    expect(desempatarPorLocal(todos, 'sala')).toEqual(todos);
  });

  it('não casa palavra com pedaço de outra', () => {
    expect(desempatarPorLocal(todos, 'sala 30')).toEqual(todos);
  });

  it('aceita caminho nulo sem quebrar', () => {
    const semLocal = { caminho: null, descricao: 'Bebedouro' };
    expect(desempatarPorLocal([semLocal, a302], 'sala 302')).toEqual([a302]);
  });
});

const ATIVO_A = '6aad5286df6f201a25eda001';
const ATIVO_B = '6aad5286df6f201a25eda002';
const candidato = (ativoId: string) => ({
  ativoId,
  codigo: 'X',
  descricao: 'Split',
  caminho: null,
});

describe('chaveDoAtivo (AC-7)', () => {
  it('é origem e ids na ordem dos candidatos', () => {
    expect(
      chaveDoAtivo({ origem: 'regra', candidatos: [candidato(ATIVO_A), candidato(ATIVO_B)] }),
    ).toBe(`regra|${ATIVO_A},${ATIVO_B}`);
  });

  it('é vazia sem ativo e também para o cartão antigo sem o campo', () => {
    expect(chaveDoAtivo(null)).toBe('');
    expect(chaveDoAtivo(undefined)).toBe('');
  });

  it('muda quando só a origem muda', () => {
    const codigo = chaveDoAtivo({ origem: 'codigo', candidatos: [candidato(ATIVO_A)] });
    const regra = chaveDoAtivo({ origem: 'regra', candidatos: [candidato(ATIVO_A)] });
    expect(codigo).not.toBe(regra);
  });
});

describe('mesmoConteudo com o ativo (AC-7)', () => {
  const base: CartaoPayload = {
    modo: 'ia',
    servico: null,
    unidade: null,
    localExato: 'sala 302',
    faltando: [],
  } as unknown as CartaoPayload;

  it('cartão antigo sem o campo `ativo` vale igual a uma proposta sem ativo', () => {
    const antigo = conteudoDoCartao(base);
    const novo = conteudoDaProposta(
      { servico: null, localExato: 'sala 302', localForaDoPerfil: false },
      {
        unidade: null,
      },
    );
    expect(mesmoConteudo(antigo, novo)).toBe(true);
  });

  it('o mesmo serviço, unidade e local com um ativo novo é conteúdo diferente', () => {
    const antigo = conteudoDoCartao({ ...base, ativo: null });
    const novo = conteudoDaProposta(
      { servico: null, localExato: 'sala 302', localForaDoPerfil: false },
      { unidade: null },
      `codigo|${ATIVO_A}`,
    );
    expect(mesmoConteudo(antigo, novo)).toBe(false);
  });
});

describe('resumoDoAtivo (AC-13)', () => {
  it('leva só a origem e a quantidade, nunca o código', () => {
    const resumo = resumoDoAtivo({
      origem: 'codigo',
      candidatos: [{ ...candidato(ATIVO_A), codigo: '11997' }],
    });
    expect(resumo).toEqual({ ativoOrigem: 'codigo', ativoCandidatos: 1 });
    expect(JSON.stringify(resumo)).not.toContain('11997');
  });

  it('sem ativo é origem nula e zero candidatos', () => {
    expect(resumoDoAtivo(null)).toEqual({ ativoOrigem: null, ativoCandidatos: 0 });
  });
});
