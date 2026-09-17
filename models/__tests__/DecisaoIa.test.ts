import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { DECISAO_CORRECOES_MAX, DecisaoIaModel } from '@/models/DecisaoIa';
import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import {
  DECISAO_CAMPOS,
  DECISAO_CORRECAO_ORIGENS,
  DECISAO_DECIDIDO_POR,
  DECISAO_EFEITOS,
  DECISAO_SITUACOES,
} from '@/shared/conversas/conversa.constants';
import {
  DECISAO_CORRECAO_MOTIVO_MAX,
  DECISAO_MOTIVO_MAX,
  DECISAO_ROTULO_MAX,
} from '@/shared/conversas/conversa.schemas';

/**
 * Model da decisão da IA (spec 0002).
 *
 * Este documento é a base da auditoria e da medição de acerto: o que a IA
 * decidiu, com que confiança, por quê, com qual modelo, e toda correção humana
 * que veio depois. O que se tranca aqui são os campos imutáveis, os limites do
 * AC-6 e os índices que tornam a gravação repetível.
 */

type Indice = [Record<string, unknown>, Record<string, unknown>];

const indices = () => DecisaoIaModel.schema.indexes() as unknown as Indice[];

function indicePor(campos: string[]): Indice | undefined {
  return indices().find(([chaves]) => Object.keys(chaves).join(',') === campos.join(','));
}

const valor = (rotulo = 'Ar-condicionado · Manutenção corretiva') => ({
  catalogServiceId: new Types.ObjectId(),
  subtypeId: new Types.ObjectId(),
  rotulo,
});

function decisaoValida(extra: Record<string, unknown> = {}) {
  return new DecisaoIaModel({
    chamadoId: new Types.ObjectId(),
    campo: 'servico',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valorIa: valor(),
    valorFinal: valor(),
    motivo: 'o relato cita ar-condicionado que não gela',
    ...extra,
  });
}

describe('DecisaoIaModel', () => {
  it('usa a coleção decisaoias, que é como o Mongoose pluraliza o nome', () => {
    // Assert: o nome real da coleção, o que vale para consulta direta,
    // backup e script de operação
    expect(DecisaoIaModel.collection.collectionName).toBe('decisaoias');
  });

  it('tem exatamente os campos do modelo de dados da spec 0002', () => {
    // Arrange / Act
    const campos = Object.keys(DecisaoIaModel.schema.paths)
      .filter((campo) => campo !== '__v')
      .sort();

    // Assert
    expect(campos).toEqual(
      [
        '_id',
        'campo',
        'chamadoId',
        'confianca',
        'conversaId',
        'correcoes',
        'createdAt',
        'decididoPor',
        'efeito',
        'llmCallId',
        'modelo',
        'motivo',
        'promptVersion',
        'revisadaEm',
        'revisadaPorUserId',
        'situacao',
        'task',
        'updatedAt',
        'valorFinal',
        'valorIa',
      ].sort(),
    );
  });

  it('não guarda texto de relato nem resposta do modelo', () => {
    // Assert: a decisão guarda o que foi decidido, não a conversa (LGPD)
    const campos = Object.keys(DecisaoIaModel.schema.paths).join(' ');

    expect(campos).not.toMatch(/texto|prompt(?!Version)|resposta|content|relato/i);
  });
});

// ── obrigatórios e padrões · AC-6 ────────────────────────────────

describe('DecisaoIaModel · obrigatórios e padrões (AC-6)', () => {
  it('aceita uma decisão da IA recém-gravada', () => {
    expect(decisaoValida().validateSync()).toBeUndefined();
  });

  it('exige chamado, campo, quem decidiu, efeito, os dois valores e o motivo', () => {
    // Arrange
    const doc = new DecisaoIaModel({});

    // Act
    const erros = Object.keys(doc.validateSync()?.errors ?? {}).sort();

    // Assert
    expect(erros).toEqual(
      ['campo', 'chamadoId', 'decididoPor', 'efeito', 'motivo', 'valorFinal', 'valorIa'].sort(),
    );
  });

  it('nasce sem revisão', () => {
    // Act
    const doc = decisaoValida();

    // Assert
    expect(doc.situacao).toBe('sem_revisao');
    expect(doc.revisadaEm).toBeNull();
    expect(doc.revisadaPorUserId).toBeNull();
  });

  it('nasce com a lista de correções vazia', () => {
    expect(decisaoValida().correcoes).toHaveLength(0);
  });

  it('deixa nulos os cinco campos que só a decisão da IA preenche', () => {
    // Act: decisão por regra não tem confiança nem modelo
    const doc = decisaoValida({ decididoPor: 'regra' });

    // Assert
    expect(doc.confianca).toBeNull();
    expect(doc.modelo).toBeNull();
    expect(doc.promptVersion).toBeNull();
    expect(doc.task).toBeNull();
    expect(doc.llmCallId).toBeNull();
  });

  it('deixa a conversa nula, para decisão tomada fora de uma conversa', () => {
    expect(decisaoValida().conversaId).toBeNull();
  });
});

// ── enums derivados das constantes · AC-6 ────────────────────────

describe('DecisaoIaModel · enums (AC-6)', () => {
  it.each([
    ['campo', DECISAO_CAMPOS],
    ['decididoPor', DECISAO_DECIDIDO_POR],
    ['efeito', DECISAO_EFEITOS],
    ['situacao', DECISAO_SITUACOES],
  ])('o enum de %s vem das constantes de shared', (caminho, esperado) => {
    // Arrange
    const path = DecisaoIaModel.schema.paths[caminho] as { enumValues?: string[] };

    // Assert
    expect(path.enumValues).toEqual([...esperado]);
  });

  it('recusa campo fora dos três decididos', () => {
    // Arrange
    const doc = decisaoValida({ campo: 'unidade' });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('campo');
  });

  it('recusa situação inventada', () => {
    // Arrange
    const doc = decisaoValida({ situacao: 'pendente' });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('situacao');
  });
});

// ── valor decidido · AC-6, AC-7 ──────────────────────────────────

describe('DecisaoIaModel · valor decidido (AC-6)', () => {
  it('exige o rótulo, que é o nome lido do banco na gravação', () => {
    // Arrange: sem rótulo a auditoria fica só com identificadores
    const doc = decisaoValida({ valorIa: { catalogServiceId: new Types.ObjectId() } });

    // Act
    const erros = Object.keys(doc.validateSync()?.errors ?? {});

    // Assert
    expect(erros).toContain('valorIa.rotulo');
  });

  it(`recusa rótulo com mais de ${DECISAO_ROTULO_MAX} caracteres`, () => {
    // Arrange
    const doc = decisaoValida({ valorIa: valor('a'.repeat(DECISAO_ROTULO_MAX + 1)) });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('valorIa.rotulo');
  });

  it('aceita rótulo no limite', () => {
    // Arrange
    const doc = decisaoValida({ valorIa: valor('a'.repeat(DECISAO_ROTULO_MAX)) });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('não cria _id nos valores, que são parte do documento e não itens de lista', () => {
    // Act
    const gravado = decisaoValida().toObject();

    // Assert
    expect(gravado.valorIa).not.toHaveProperty('_id');
    expect(gravado.valorFinal).not.toHaveProperty('_id');
  });

  it.each([...FINAL_PRIORITY_VALUES])('aceita a prioridade %s no valor', (prioridade) => {
    // Arrange
    const doc = decisaoValida({
      campo: 'prioridade',
      valorIa: { prioridade, rotulo: prioridade },
      valorFinal: { prioridade, rotulo: prioridade },
    });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('recusa prioridade fora do enum do chamado', () => {
    // Arrange
    const doc = decisaoValida({
      campo: 'prioridade',
      valorIa: { prioridade: 'URGENTE', rotulo: 'Urgente' },
      valorFinal: { prioridade: 'URGENTE', rotulo: 'Urgente' },
    });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('valorIa.prioridade');
  });

  it('deixa nulos os campos que o campo decidido não usa', () => {
    // Act: decisão de prioridade não tem serviço nem técnico
    const doc = decisaoValida({
      campo: 'prioridade',
      valorIa: { prioridade: 'ALTA', rotulo: 'Alta' },
      valorFinal: { prioridade: 'ALTA', rotulo: 'Alta' },
    });

    // Assert
    expect(doc.valorIa?.catalogServiceId).toBeNull();
    expect(doc.valorIa?.tecnicoId).toBeNull();
    expect(doc.valorIa?.tipoServico).toBeNull();
  });
});

// ── confiança e motivo · AC-6 ────────────────────────────────────

describe('DecisaoIaModel · confiança e motivo (AC-6)', () => {
  it.each([0, 0.5, 1])('aceita confiança %s', (confianca) => {
    expect(decisaoValida({ confianca }).validateSync()).toBeUndefined();
  });

  it('recusa confiança negativa', () => {
    // Arrange
    const doc = decisaoValida({ confianca: -0.01 });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('confianca');
  });

  it('recusa confiança acima de 1', () => {
    // Arrange
    const doc = decisaoValida({ confianca: 1.01 });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('confianca');
  });

  it(`aceita motivo de exatamente ${DECISAO_MOTIVO_MAX} caracteres`, () => {
    expect(
      decisaoValida({ motivo: 'a'.repeat(DECISAO_MOTIVO_MAX) }).validateSync(),
    ).toBeUndefined();
  });

  it('recusa motivo além do limite de uma frase', () => {
    // Arrange
    const doc = decisaoValida({ motivo: 'a'.repeat(DECISAO_MOTIVO_MAX + 1) });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('motivo');
  });

  it('apara os espaços das pontas do motivo', () => {
    expect(decisaoValida({ motivo: '  cita elevador  ' }).motivo).toBe('cita elevador');
  });
});

// ── correções · AC-8, AC-9 ───────────────────────────────────────

describe('DecisaoIaModel · correções (AC-8, AC-9)', () => {
  const correcao = (extra: Record<string, unknown> = {}) => ({
    anterior: valor('Elevador · Parada'),
    novo: valor('Elevador · Emergência'),
    userId: new Types.ObjectId(),
    origem: 'gestao',
    em: new Date(),
    ...extra,
  });

  it('aceita uma correção completa', () => {
    // Arrange
    const doc = decisaoValida({ correcoes: [correcao()], situacao: 'corrigida' });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('exige valor anterior, valor novo, usuário, origem e data', () => {
    // Arrange: correção sem autor não serve de auditoria
    const doc = decisaoValida({ correcoes: [{}] });

    // Act
    const erros = Object.keys(doc.validateSync()?.errors ?? {});

    // Assert
    expect(erros).toEqual(
      expect.arrayContaining([
        'correcoes.0.anterior',
        'correcoes.0.novo',
        'correcoes.0.userId',
        'correcoes.0.origem',
        'correcoes.0.em',
      ]),
    );
  });

  it.each([...DECISAO_CORRECAO_ORIGENS])('aceita correção de origem %s', (origem) => {
    // Arrange
    const doc = decisaoValida({ correcoes: [correcao({ origem })] });

    // Act / Assert
    expect(doc.validateSync()).toBeUndefined();
  });

  it('recusa origem fora de solicitante e gestão', () => {
    // Arrange
    const doc = decisaoValida({ correcoes: [correcao({ origem: 'ia' })] });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('correcoes.0.origem');
  });

  it('deixa o motivo da correção vazio quando não veio justificativa', () => {
    // Act
    const doc = decisaoValida({ correcoes: [correcao()] });

    // Assert
    expect(doc.correcoes[0]?.motivo).toBe('');
  });

  it(`recusa justificativa com mais de ${DECISAO_CORRECAO_MOTIVO_MAX} caracteres`, () => {
    // Arrange
    const longa = correcao({ motivo: 'a'.repeat(DECISAO_CORRECAO_MOTIVO_MAX + 1) });
    const doc = decisaoValida({ correcoes: [longa] });

    // Act / Assert
    expect(Object.keys(doc.validateSync()?.errors ?? {})).toContain('correcoes.0.motivo');
  });

  it('guarda várias correções em ordem, para o segundo veredito não apagar o primeiro', () => {
    // Arrange
    const primeira = correcao({ origem: 'solicitante' });
    const segunda = correcao({ origem: 'gestao' });

    // Act
    const doc = decisaoValida({ correcoes: [primeira, segunda] });

    // Assert
    expect(doc.correcoes).toHaveLength(2);
    expect(doc.correcoes.map((c) => c.origem)).toEqual(['solicitante', 'gestao']);
  });

  it('o teto da lista de correções é positivo', () => {
    // Assert: um teto zerado ou negativo faria o $slice esvaziar a lista
    expect(DECISAO_CORRECOES_MAX).toBeGreaterThan(0);
    expect(Number.isInteger(DECISAO_CORRECOES_MAX)).toBe(true);
  });
});

// ── índices · AC-6, AC-16 ────────────────────────────────────────

describe('DecisaoIaModel · índices', () => {
  it('declara o único de chamado e campo, que é o que torna a gravação repetível (AC-6)', () => {
    // Act
    const unico = indicePor(['chamadoId', 'campo']);

    // Assert: sem o único, registrar duas vezes criaria duas decisões
    // em vez de falhar como ja_existe
    expect(unico?.[0]).toEqual({ chamadoId: 1, campo: 1 });
    expect(unico?.[1]).toMatchObject({ unique: true });
  });

  it('declara o índice das métricas de acerto por campo', () => {
    // Act
    const metricas = indicePor(['situacao', 'campo', 'createdAt']);

    // Assert
    expect(metricas?.[0]).toEqual({ situacao: 1, campo: 1, createdAt: -1 });
  });
});
