import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { ChamadoModel } from '@/models/Chamado';
import { CANAIS_ABERTURA, IA_SITUACOES } from '@/shared/conversas/conversa.constants';

/**
 * O que a spec 0002 acrescentou ao chamado: de onde ele foi aberto, a conversa
 * que virou ele, e quanto a IA pesou na classificação.
 *
 * Só estes campos e índices são testados aqui. O resto do model é anterior e
 * tem a cobertura dele nas ações que o usam.
 */

type Indice = [Record<string, unknown>, Record<string, unknown>];

const indices = () => ChamadoModel.schema.indexes() as unknown as Indice[];

function indicePor(campos: string[]): Indice | undefined {
  return indices().find(([chaves]) => Object.keys(chaves).join(',') === campos.join(','));
}

/** Valida um campo só, para não esbarrar nos obrigatórios antigos do chamado. */
function erroNoCampo(campo: string, valor: unknown) {
  const doc = new ChamadoModel({ [campo]: valor });
  return doc.validateSync([campo]);
}

// ── campos novos · AC-3 ──────────────────────────────────────────

describe('ChamadoModel · abertura por conversa (AC-3)', () => {
  it('nasce sem conversa ligada', () => {
    // Assert: chamado do formulário nunca tem conversa
    expect(new ChamadoModel({}).conversaId).toBeNull();
  });

  it('aceita a conversa que virou o chamado', () => {
    // Arrange
    const conversaId = new Types.ObjectId();

    // Act
    const doc = new ChamadoModel({ conversaId });

    // Assert
    expect(String(doc.conversaId)).toBe(String(conversaId));
  });

  it('usa formulário como canal padrão, que é o do chamado antigo', () => {
    // Assert: documento gravado antes da spec 0002 lê este padrão
    expect(new ChamadoModel({}).canalAbertura).toBe('formulario');
  });

  it.each([...CANAIS_ABERTURA])('aceita o canal de abertura %s', (canalAbertura) => {
    expect(erroNoCampo('canalAbertura', canalAbertura)).toBeUndefined();
  });

  it('recusa canal de abertura fora dos dois conhecidos', () => {
    // Act
    const erro = erroNoCampo('canalAbertura', 'email');

    // Assert
    expect(Object.keys(erro?.errors ?? {})).toContain('canalAbertura');
  });

  it('o enum do canal vem das constantes de shared', () => {
    // Arrange
    const caminho = ChamadoModel.schema.paths.canalAbertura as { enumValues?: string[] };

    // Assert
    expect(caminho.enumValues).toEqual([...CANAIS_ABERTURA]);
  });
});

// ── situação da IA · AC-3, AC-9 ──────────────────────────────────

describe('ChamadoModel · situação da IA (AC-3, AC-9)', () => {
  it('nasce nula, que é o chamado aberto antes de a IA existir', () => {
    expect(new ChamadoModel({}).iaSituacao).toBeNull();
  });

  it.each([...IA_SITUACOES])('aceita a situação %s', (iaSituacao) => {
    expect(erroNoCampo('iaSituacao', iaSituacao)).toBeUndefined();
  });

  it('aceita situação nula, para chamado que não passou pela IA', () => {
    expect(erroNoCampo('iaSituacao', null)).toBeUndefined();
  });

  it('recusa situação inventada', () => {
    // Act
    const erro = erroNoCampo('iaSituacao', 'em_analise');

    // Assert
    expect(Object.keys(erro?.errors ?? {})).toContain('iaSituacao');
  });

  it('aceita revisada, que é o estado depois do veredito da gestão (AC-9)', () => {
    expect(erroNoCampo('iaSituacao', 'revisada')).toBeUndefined();
  });
});

// ── índices · AC-4, AC-16 ────────────────────────────────────────

describe('ChamadoModel · índices da spec 0002', () => {
  it('declara o único parcial de conversaId, que barra o segundo chamado (AC-4)', () => {
    // Act
    const unico = indicePor(['conversaId']);

    // Assert: é este índice que faz o clique duplo virar jaExistia em vez
    // de criar dois chamados
    expect(unico?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { conversaId: { $type: 'objectId' } },
    });
  });

  it('declara o índice da triagem, restrito a quem passou pela IA', () => {
    // Act
    const triagem = indicePor(['iaSituacao', 'status', 'createdAt']);

    // Assert
    expect(triagem?.[0]).toEqual({ iaSituacao: 1, status: 1, createdAt: -1 });
    expect(triagem?.[1]).toMatchObject({
      partialFilterExpression: { iaSituacao: { $type: 'string' } },
    });
  });

  it('mantém os índices antigos do chamado', () => {
    // Assert: a spec 0002 acrescenta índice, não troca os que já serviam
    // às listas e ao relatório
    expect(indicePor(['status', 'updatedAt'])).toBeDefined();
    expect(indicePor(['status', 'closedAt'])).toBeDefined();
  });
});

// ── índice da lateral de /conversas · spec 0003, AC-2 ────────────

describe('ChamadoModel · índice da lateral de conversas (spec 0003)', () => {
  it('inclui o `_id` que a ordenação da lateral precisa', () => {
    // Act
    const lateral = indicePor(['solicitanteId', 'updatedAt', '_id']);

    // Assert: a lateral pagina por cursor composto e ordena por
    // `{ updatedAt: -1, _id: -1 }`. Sem o `_id` no índice o Mongo filtra por
    // ele mas ordena em memória, lendo todos os chamados do solicitante.
    expect(lateral?.[0]).toEqual({ solicitanteId: 1, updatedAt: -1, _id: -1 });
  });

  it('não deixa para trás a versão de dois campos, que não cobria a ordenação', () => {
    // Assert: dois índices com o mesmo prefixo só custariam escrita
    expect(indicePor(['solicitanteId', 'updatedAt'])).toBeUndefined();
  });

  it('a ordem das chaves acompanha a ordenação da consulta', () => {
    // Act
    const lateral = indicePor(['solicitanteId', 'updatedAt', '_id']);

    // Assert: `updatedAt` e `_id` descendentes, na mesma direção do `sort`
    expect(Object.values(lateral?.[0] ?? {})).toEqual([1, -1, -1]);
  });
});

// ── índice da lateral do técnico em /conversas · spec 0005, AC-8 ─

describe('ChamadoModel · índice da lateral do técnico (spec 0005)', () => {
  it('inclui o `_id`, pelo mesmo motivo do índice do solicitante', () => {
    // Act
    const lateral = indicePor(['assignedToUserId', 'updatedAt', '_id']);

    // Assert: sem o `_id` o Mongo lê todos os chamados do técnico e ordena em
    // memória, mesmo usando o índice só para filtrar
    expect(lateral?.[0]).toEqual({ assignedToUserId: 1, updatedAt: -1, _id: -1 });
  });

  it('não substitui o índice antigo de assignedToUserId, usado para carga', () => {
    // Assert: `{ assignedToUserId, status }` ainda serve a contagem de carga
    // do técnico em outras telas; os dois índices convivem
    expect(indicePor(['assignedToUserId', 'status'])).toBeDefined();
  });

  it('a ordem das chaves acompanha a ordenação da consulta', () => {
    // Act
    const lateral = indicePor(['assignedToUserId', 'updatedAt', '_id']);

    // Assert
    expect(Object.values(lateral?.[0] ?? {})).toEqual([1, -1, -1]);
  });
});
