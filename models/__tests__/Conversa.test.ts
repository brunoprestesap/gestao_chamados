import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { ConversaModel } from '@/models/Conversa';
import { CONVERSA_PREVIA_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * Model da conversa (spec 0002).
 *
 * Aqui se prova o que o schema garante sozinho, sem banco: campos, padrões,
 * limites e a declaração dos índices. Que o índice existe mesmo na coleção é
 * outro teste, o `*.db.test.ts`, que precisa do Mongo de verdade (AC-16).
 */

type Indice = [Record<string, unknown>, Record<string, unknown>];

const indices = () => ConversaModel.schema.indexes() as unknown as Indice[];

/** Acha o índice pelos campos que ele cobre, na ordem declarada. */
function indicePor(campos: string[]): Indice | undefined {
  return indices().find(([chaves]) => Object.keys(chaves).join(',') === campos.join(','));
}

function conversaValida(extra: Record<string, unknown> = {}) {
  return new ConversaModel({
    solicitanteId: new Types.ObjectId(),
    ultimaMensagemEm: new Date(),
    ...extra,
  });
}

describe('ConversaModel', () => {
  it('usa a coleção conversas', () => {
    expect(ConversaModel.collection.collectionName).toBe('conversas');
  });

  it('tem exatamente os campos do modelo de dados das specs 0002 e 0004', () => {
    // Arrange / Act
    const campos = Object.keys(ConversaModel.schema.paths)
      .filter((campo) => campo !== '__v')
      .sort();

    // Assert
    expect(campos).toEqual(
      [
        '_id',
        'chamadoId',
        'chamadoIdReservado',
        'createdAt',
        'expiresAt',
        'mensagensCount',
        'previa',
        'propostaIa',
        'solicitanteId',
        'ultimaMensagemEm',
        'updatedAt',
        'vinculandoEm',
      ].sort(),
    );
  });

  it('não guarda o texto das mensagens, só a prévia', () => {
    // Assert: o relato existe em um lugar só, na coleção de mensagens
    expect(ConversaModel.schema.paths).not.toHaveProperty('texto');
    expect(ConversaModel.schema.paths).not.toHaveProperty('mensagens');
  });
});

// ── campos obrigatórios e padrões · AC-1 ─────────────────────────

describe('ConversaModel · obrigatórios (AC-1)', () => {
  it('aceita um rascunho recém-criado, sem mensagem nenhuma', () => {
    // Act
    const doc = conversaValida();

    // Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('exige dono e data da última mensagem', () => {
    // Arrange
    const doc = new ConversaModel({});

    // Act
    const erros = Object.keys(doc.validateSync()?.errors ?? {}).sort();

    // Assert
    expect(erros).toEqual(['solicitanteId', 'ultimaMensagemEm']);
  });

  it('nasce sem chamado, sem reserva e com contador zerado', () => {
    // Act
    const doc = conversaValida();

    // Assert
    expect(doc.chamadoId).toBeNull();
    expect(doc.chamadoIdReservado).toBeNull();
    expect(doc.vinculandoEm).toBeNull();
    expect(doc.mensagensCount).toBe(0);
    expect(doc.previa).toBe('');
  });

  it('nasce sem expiração no documento, que lib/conversas preenche (AC-2)', () => {
    // Assert: o padrão é nulo; os 30 dias são calculados na criação, não aqui
    expect(conversaValida().expiresAt).toBeNull();
  });
});

// ── limites dos campos derivados ─────────────────────────────────

describe('ConversaModel · limites', () => {
  it(`aceita prévia de exatamente ${CONVERSA_PREVIA_MAX} caracteres`, () => {
    // Arrange
    const doc = conversaValida({ previa: 'a'.repeat(CONVERSA_PREVIA_MAX) });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('recusa prévia mais longa que o limite da lista lateral', () => {
    // Arrange
    const doc = conversaValida({ previa: 'a'.repeat(CONVERSA_PREVIA_MAX + 1) });

    // Act
    const erros = Object.keys(doc.validateSync()?.errors ?? {});

    // Assert
    expect(erros).toContain('previa');
  });

  it('recusa contador de mensagens negativo', () => {
    // Arrange
    const doc = conversaValida({ mensagensCount: -1 });

    // Act
    const erros = Object.keys(doc.validateSync()?.errors ?? {});

    // Assert
    expect(erros).toContain('mensagensCount');
  });

  it('aceita contador zerado', () => {
    expect(conversaValida({ mensagensCount: 0 }).validateSync()).toBeUndefined();
  });
});

// ── índices · AC-2, AC-4, AC-16 ──────────────────────────────────

describe('ConversaModel · índices', () => {
  it('declara o TTL do rascunho em expiresAt (AC-2)', () => {
    // Act
    const ttl = indicePor(['expiresAt']);

    // Assert: sem expireAfterSeconds: 0 o rascunho abandonado nunca some
    expect(ttl?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });

  it('declara o único parcial de chamadoId, que barra o segundo chamado (AC-4)', () => {
    // Act
    const unico = indicePor(['chamadoId']);

    // Assert
    expect(unico?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { chamadoId: { $type: 'objectId' } },
    });
  });

  it('restringe o único ao chamadoId gravado, para vários rascunhos conviverem', () => {
    // Arrange
    const unico = indicePor(['chamadoId']);
    const parcial = unico?.[1]?.partialFilterExpression;

    // Assert: sem o parcial, o segundo rascunho com chamadoId nulo seria
    // recusado como duplicado
    expect(parcial).toBeDefined();
  });

  it('declara o índice da lista lateral do solicitante', () => {
    // Act
    const lista = indicePor(['solicitanteId', 'chamadoId', 'ultimaMensagemEm']);

    // Assert
    expect(lista?.[0]).toEqual({ solicitanteId: 1, chamadoId: 1, ultimaMensagemEm: -1 });
  });
});
