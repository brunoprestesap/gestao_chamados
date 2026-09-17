import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { ConversaMensagemModel } from '@/models/ConversaMensagem';
import { CONVERSA_AUTORES, CONVERSA_MENSAGEM_TIPOS } from '@/shared/conversas/conversa.constants';
import { CONVERSA_TEXTO_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * Model da mensagem da conversa (spec 0002).
 *
 * O envelope é garantido aqui; o `payload` é conferido pelo schema Zod do tipo
 * antes de chegar. O que interessa trancar é a ordem de leitura, a expiração e
 * o fato de os enums virem das constantes, nunca escritos de novo à mão.
 */

type Indice = [Record<string, unknown>, Record<string, unknown>];

const indices = () => ConversaMensagemModel.schema.indexes() as unknown as Indice[];

function indicePor(campos: string[]): Indice | undefined {
  return indices().find(([chaves]) => Object.keys(chaves).join(',') === campos.join(','));
}

function mensagemValida(extra: Record<string, unknown> = {}) {
  return new ConversaMensagemModel({
    conversaId: new Types.ObjectId(),
    autor: 'solicitante',
    tipo: 'texto',
    texto: 'o ar-condicionado da sala 3 parou',
    ...extra,
  });
}

describe('ConversaMensagemModel', () => {
  it('usa a coleção conversamensagems, que é como o Mongoose pluraliza o nome', () => {
    // Assert: o nome vem do pluralizador do Mongoose, não do português;
    // qualquer consulta direta ou script de operação precisa usar este
    expect(ConversaMensagemModel.collection.collectionName).toBe('conversamensagems');
  });

  it('tem exatamente os campos do modelo de dados da spec 0002', () => {
    // Arrange / Act
    const campos = Object.keys(ConversaMensagemModel.schema.paths)
      .filter((campo) => campo !== '__v')
      .sort();

    // Assert
    expect(campos).toEqual(
      [
        '_id',
        'autor',
        'conversaId',
        'createdAt',
        'expiresAt',
        'llmCallId',
        'payload',
        'texto',
        'tipo',
        'userId',
      ].sort(),
    );
  });

  it('não tem updatedAt: mensagem é gravada uma vez e não se edita', () => {
    expect(ConversaMensagemModel.schema.paths).not.toHaveProperty('updatedAt');
  });
});

// ── enums derivados das constantes ───────────────────────────────

describe('ConversaMensagemModel · enums (AC-1)', () => {
  it('o autor aceita exatamente os autores declarados em shared', () => {
    // Arrange
    const caminho = ConversaMensagemModel.schema.paths.autor as { enumValues?: string[] };

    // Assert: os enums do Mongoose derivam das constantes, nunca o contrário
    expect(caminho.enumValues).toEqual([...CONVERSA_AUTORES]);
  });

  it('o tipo aceita exatamente os tipos declarados em shared', () => {
    // Arrange
    const caminho = ConversaMensagemModel.schema.paths.tipo as { enumValues?: string[] };

    // Assert
    expect(caminho.enumValues).toEqual([...CONVERSA_MENSAGEM_TIPOS]);
  });

  it.each([...CONVERSA_AUTORES])('aceita mensagem de autor %s', (autor) => {
    expect(mensagemValida({ autor }).validateSync()).toBeUndefined();
  });

  it('recusa autor desconhecido', () => {
    // Arrange
    const doc = mensagemValida({ autor: 'tecnico' });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('autor');
  });

  it('recusa tipo desconhecido', () => {
    // Arrange
    const doc = mensagemValida({ tipo: 'audio' });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('tipo');
  });
});

// ── obrigatórios, padrões e limites · AC-1 ───────────────────────

describe('ConversaMensagemModel · obrigatórios e padrões (AC-1)', () => {
  it('aceita uma mensagem de texto do solicitante', () => {
    expect(mensagemValida().validateSync()).toBeUndefined();
  });

  it('exige conversa, autor, tipo e texto', () => {
    // Arrange
    const doc = new ConversaMensagemModel({});

    // Act
    const erros = Object.keys(doc.validateSync()?.errors ?? {}).sort();

    // Assert
    expect(erros).toEqual(['autor', 'conversaId', 'texto', 'tipo']);
  });

  it('deixa nulos os campos que só algumas mensagens usam', () => {
    // Act
    const doc = mensagemValida();

    // Assert
    expect(doc.userId).toBeNull();
    expect(doc.payload).toBeNull();
    expect(doc.llmCallId).toBeNull();
    expect(doc.expiresAt).toBeNull();
  });

  it('apara os espaços das pontas do texto', () => {
    // Act
    const doc = mensagemValida({ texto: '   sem energia   ' });

    // Assert
    expect(doc.texto).toBe('sem energia');
  });

  it(`aceita texto de exatamente ${CONVERSA_TEXTO_MAX} caracteres`, () => {
    // Arrange
    const doc = mensagemValida({ texto: 'a'.repeat(CONVERSA_TEXTO_MAX) });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('recusa texto além do limite, mesmo se escapar do Zod', () => {
    // Arrange: a segunda barreira, para quem gravar sem passar pelo schema
    const doc = mensagemValida({ texto: 'a'.repeat(CONVERSA_TEXTO_MAX + 1) });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('texto');
  });
});

// ── índices · AC-2, AC-12, AC-16 ─────────────────────────────────

describe('ConversaMensagemModel · índices', () => {
  it('declara a ordem de leitura por data e, no empate, por _id (AC-12)', () => {
    // Act
    const leitura = indicePor(['conversaId', 'createdAt', '_id']);

    // Assert
    expect(leitura?.[0]).toEqual({ conversaId: 1, createdAt: 1, _id: 1 });
  });

  it('declara o TTL que apaga a mensagem junto com o rascunho (AC-2)', () => {
    // Act
    const ttl = indicePor(['expiresAt']);

    // Assert
    expect(ttl?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });
});
