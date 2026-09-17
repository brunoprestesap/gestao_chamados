import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { CHAMADO_HISTORY_ACTOR_TYPES } from '@/shared/chamados/history.constants';

/**
 * Model do histórico do chamado, depois da spec 0002.
 *
 * A mudança que importa: a entrada da IA e a do sistema não têm usuário, mas a
 * ação de gente continua exigindo um. O `required` por função guarda as duas
 * regras no mesmo campo, e é isso que estes testes trancam (AC-11).
 */

function entrada(extra: Record<string, unknown> = {}) {
  return new ChamadoHistoryModel({
    chamadoId: new Types.ObjectId(),
    action: 'comentario',
    ...extra,
  });
}

const errosDe = (doc: ReturnType<typeof entrada>) => Object.keys(doc.validateSync()?.errors ?? {});

describe('ChamadoHistoryModel', () => {
  it('tem os campos da spec 0002 além dos antigos', () => {
    // Arrange / Act
    const campos = Object.keys(ChamadoHistoryModel.schema.paths);

    // Assert
    expect(campos).toEqual(expect.arrayContaining(['actorType', 'decisaoIaId', 'userId']));
  });

  it('exige chamado e ação', () => {
    // Arrange
    const doc = new ChamadoHistoryModel({});

    // Act
    const erros = errosDe(doc);

    // Assert
    expect(erros).toEqual(expect.arrayContaining(['chamadoId', 'action']));
  });
});

// ── usuário exigido por função · AC-11 ───────────────────────────

describe('ChamadoHistoryModel · usuário por tipo de ator (AC-11)', () => {
  it('exige usuário quando a ação é de gente', () => {
    // Arrange
    const doc = entrada({ actorType: 'usuario' });

    // Act / Assert: a garantia antiga continua valendo onde sempre valeu
    expect(errosDe(doc)).toContain('userId');
  });

  it('exige usuário também quando o actorType não veio (documento antigo)', () => {
    // Arrange: entrada gravada antes da spec 0002, sem actorType
    const doc = entrada({});

    // Act / Assert
    expect(errosDe(doc)).toContain('userId');
  });

  it('aceita entrada da IA sem usuário', () => {
    // Arrange
    const doc = entrada({ action: 'decisao_ia', actorType: 'ia' });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.userId).toBeNull();
  });

  it('aceita entrada do sistema sem usuário', () => {
    // Arrange
    const doc = entrada({ action: 'decisao_ia', actorType: 'sistema' });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.userId).toBeNull();
  });

  it('aceita a ação de gente com usuário', () => {
    // Arrange
    const doc = entrada({ actorType: 'usuario', userId: new Types.ObjectId() });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('trata usuário nulo como ausente na ação de gente', () => {
    // Arrange: o padrão do campo é nulo, e nulo não satisfaz o required
    const doc = entrada({ actorType: 'usuario', userId: null });

    // Act / Assert
    expect(errosDe(doc)).toContain('userId');
  });

  it('usa usuario como padrão do actorType', () => {
    // Act
    const doc = entrada({ userId: new Types.ObjectId() });

    // Assert
    expect(doc.actorType).toBe('usuario');
  });

  it.each([...CHAMADO_HISTORY_ACTOR_TYPES])('aceita o ator %s', (actorType) => {
    // Arrange
    const userId = actorType === 'usuario' ? new Types.ObjectId() : undefined;
    const doc = entrada({ actorType, userId });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('recusa tipo de ator inventado', () => {
    // Arrange
    const doc = entrada({ actorType: 'robo', userId: new Types.ObjectId() });

    // Act / Assert
    expect(errosDe(doc)).toContain('actorType');
  });
});

// ── ações da IA · AC-11 ──────────────────────────────────────────

describe('ChamadoHistoryModel · ações da IA (AC-11)', () => {
  it('aceita a ação decisao_ia', () => {
    // Arrange
    const doc = entrada({ action: 'decisao_ia', actorType: 'ia' });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('aceita a ação correcao_ia praticada por quem corrigiu', () => {
    // Arrange
    const doc = entrada({
      action: 'correcao_ia',
      actorType: 'usuario',
      userId: new Types.ObjectId(),
      decisaoIaId: new Types.ObjectId(),
    });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('liga a entrada à decisão que ela registra', () => {
    // Arrange
    const decisaoIaId = new Types.ObjectId();

    // Act
    const doc = entrada({ action: 'decisao_ia', actorType: 'ia', decisaoIaId });

    // Assert
    expect(String(doc.decisaoIaId)).toBe(String(decisaoIaId));
  });

  it('deixa a decisão nula nas entradas que não são da IA', () => {
    // Act
    const doc = entrada({ userId: new Types.ObjectId() });

    // Assert
    expect(doc.decisaoIaId).toBeNull();
  });

  it('recusa ação fora da lista', () => {
    // Arrange
    const doc = entrada({ action: 'decisao_da_ia', userId: new Types.ObjectId() });

    // Act / Assert
    expect(errosDe(doc)).toContain('action');
  });
});

// ── índices ──────────────────────────────────────────────────────

describe('ChamadoHistoryModel · índices', () => {
  it('declara a leitura do histórico de um chamado, do mais novo ao mais velho', () => {
    // Arrange
    type Indice = [Record<string, unknown>, Record<string, unknown>];
    const indices = ChamadoHistoryModel.schema.indexes() as unknown as Indice[];

    // Act
    const porChamado = indices.find(
      ([chaves]) => Object.keys(chaves).join(',') === 'chamadoId,createdAt',
    );

    // Assert
    expect(porChamado?.[0]).toEqual({ chamadoId: 1, createdAt: -1 });
  });
});
