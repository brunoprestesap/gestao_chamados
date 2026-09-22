import { describe, expect, it } from 'vitest';

import {
  CANAIS_ABERTURA,
  CONVERSA_AUTORES,
  CONVERSA_FALHAS,
  CONVERSA_MENSAGEM_TIPOS,
  CONVERSA_SITUACOES,
  DECISAO_CAMPO_LABELS,
  DECISAO_CAMPOS,
  DECISAO_CORRECAO_ORIGENS,
  DECISAO_DECIDIDO_POR,
  DECISAO_EFEITOS,
  DECISAO_SITUACOES,
  IA_SITUACOES,
} from '@/shared/conversas/conversa.constants';

/**
 * Constantes da conversa (spec 0002). São a fonte dos enums do Mongoose e dos
 * schemas Zod, então valor repetido ou rótulo faltando quebra os dois lados de
 * uma vez, sem erro de compilação para avisar.
 */

const listas: Record<string, readonly string[]> = {
  CONVERSA_AUTORES,
  CONVERSA_MENSAGEM_TIPOS,
  CONVERSA_SITUACOES,
  DECISAO_CAMPOS,
  DECISAO_DECIDIDO_POR,
  DECISAO_EFEITOS,
  DECISAO_SITUACOES,
  DECISAO_CORRECAO_ORIGENS,
  CANAIS_ABERTURA,
  IA_SITUACOES,
  CONVERSA_FALHAS,
};

describe('listas de constantes da conversa', () => {
  it.each(Object.entries(listas))('%s não tem valor repetido', (_nome, valores) => {
    // Arrange / Act
    const unicos = new Set<string>(valores);

    // Assert: valor repetido passa despercebido no enum do Mongoose
    expect(unicos.size).toBe(valores.length);
  });

  it.each(Object.entries(listas))('%s não tem valor vazio', (_nome, valores) => {
    expect(valores.every((valor) => valor.trim().length > 0)).toBe(true);
  });
});

// ── autores e tipos de mensagem · AC-1 ───────────────────────────

describe('CONVERSA_AUTORES (AC-1)', () => {
  it('tem os três autores de mensagem', () => {
    expect([...CONVERSA_AUTORES]).toEqual(['solicitante', 'ia', 'sistema']);
  });
});

describe('CONVERSA_MENSAGEM_TIPOS (AC-1)', () => {
  it('traz o texto da fundação e o cartão resumo da spec 0004', () => {
    expect([...CONVERSA_MENSAGEM_TIPOS]).toEqual(['texto', 'cartao']);
  });
});

// ── situações da conversa · AC-3, AC-5 ───────────────────────────

describe('CONVERSA_SITUACOES (AC-3)', () => {
  it('cobre o caminho rascunho, reservada e vinculada', () => {
    expect([...CONVERSA_SITUACOES]).toEqual(['rascunho', 'reservada', 'vinculada']);
  });
});

// ── decisão · AC-6, AC-8, AC-9 ───────────────────────────────────

describe('DECISAO_CAMPOS (AC-6)', () => {
  it('a IA decide serviço, prioridade e técnico', () => {
    expect([...DECISAO_CAMPOS]).toEqual(['servico', 'prioridade', 'tecnico']);
  });
});

describe('DECISAO_CAMPO_LABELS (AC-6)', () => {
  it('tem um rótulo para cada campo decidido', () => {
    // Arrange / Act
    const camposComRotulo = Object.keys(DECISAO_CAMPO_LABELS).sort();

    // Assert: campo novo sem rótulo apareceria cru no histórico
    expect(camposComRotulo).toEqual([...DECISAO_CAMPOS].sort());
  });

  it('nenhum rótulo é vazio', () => {
    expect(Object.values(DECISAO_CAMPO_LABELS).every((rotulo) => rotulo.length > 0)).toBe(true);
  });
});

describe('DECISAO_DECIDIDO_POR (AC-6)', () => {
  it('separa o modelo da regra determinística', () => {
    expect([...DECISAO_DECIDIDO_POR]).toEqual(['ia', 'regra']);
  });
});

describe('DECISAO_EFEITOS (AC-6)', () => {
  it('separa a sugestão do que já valeu sem humano', () => {
    expect([...DECISAO_EFEITOS]).toEqual(['sugestao', 'aplicado']);
  });
});

describe('DECISAO_SITUACOES (AC-9)', () => {
  it('cobre sem revisão, confirmada e corrigida', () => {
    expect([...DECISAO_SITUACOES]).toEqual(['sem_revisao', 'confirmada', 'corrigida']);
  });
});

describe('DECISAO_CORRECAO_ORIGENS (AC-8, AC-9)', () => {
  it('separa a correção do solicitante da correção da gestão', () => {
    expect([...DECISAO_CORRECAO_ORIGENS]).toEqual(['solicitante', 'gestao']);
  });
});

// ── chamado · AC-3, AC-9 ─────────────────────────────────────────

describe('CANAIS_ABERTURA (AC-3)', () => {
  it('tem formulário e chat, nesta ordem', () => {
    // Assert: o primeiro é o padrão do Mongoose para documento antigo
    expect([...CANAIS_ABERTURA]).toEqual(['formulario', 'chat']);
    expect(CANAIS_ABERTURA[0]).toBe('formulario');
  });
});

describe('IA_SITUACOES (AC-3, AC-9)', () => {
  it('vai de sem IA até revisada pela gestão', () => {
    expect([...IA_SITUACOES]).toEqual(['sem_ia', 'sugerida', 'decidida', 'revisada']);
  });

  it('o padrão de chamado sem IA é o primeiro valor', () => {
    expect(IA_SITUACOES[0]).toBe('sem_ia');
  });
});

// ── falhas · contrato de retorno de lib/conversas ────────────────

describe('CONVERSA_FALHAS', () => {
  it.each([
    'nao_encontrada',
    'sem_permissao',
    'limite_rascunhos',
    'limite_mensagens',
    'confirmacao_em_andamento',
    'ja_existe',
    'invalida',
    'erro',
  ])('declara o motivo %s, que alguma função devolve', (motivo) => {
    expect([...CONVERSA_FALHAS]).toContain(motivo);
  });

  it('não declara motivo além dos oito do contrato', () => {
    // Assert: motivo a mais é motivo que ninguém trata na tela
    expect(CONVERSA_FALHAS).toHaveLength(8);
  });
});
