import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockListarRascunhos = vi.fn();
vi.mock('@/lib/conversas', () => ({
  listarRascunhos: (...a: unknown[]) => mockListarRascunhos(...a),
}));

/** Guarda o filtro e a ordenação que o código pediu, e devolve os documentos. */
const consulta = { filtro: undefined as unknown, ordem: undefined as unknown, limite: 0 };
let docs: unknown[] = [];

const mockFind = vi.fn((filtro: unknown) => {
  consulta.filtro = filtro;
  const cadeia = {
    select: () => cadeia,
    populate: () => cadeia,
    sort: (o: unknown) => {
      consulta.ordem = o;
      return cadeia;
    },
    limit: (n: number) => {
      consulta.limite = n;
      return cadeia;
    },
    lean: async () => docs,
  };
  return cadeia;
});
vi.mock('@/models/Chamado', () => ({ ChamadoModel: { find: (f: unknown) => mockFind(f) } }));

import { CHAMADOS_POR_PAGINA, cursorDe, lerChamadosDaLateral, montarLateral } from '../lateral';

/**
 * A lateral de `/conversas` (spec 0003): rascunhos em cima, chamados embaixo,
 * com o endereço de cada linha já calculado no servidor.
 *
 * covers: AC-2 (dois blocos, paginação por cursor composto, linha de apoio),
 * AC-10 (o endereço é o da conversa quando ela existe)
 */

const VIEWER = { userId: '6aad5286df6f201a25eda111', role: 'Solicitante' as const };

function chamado(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    ticket_number: 'CHM-2026-00412',
    titulo: 'Lâmpada queimada no corredor',
    status: 'aberto',
    updatedAt: new Date('2026-09-15T12:00:00.000Z'),
    conversaId: null,
    assignedToUserId: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  docs = [];
  consulta.filtro = undefined;
  consulta.ordem = undefined;
  mockListarRascunhos.mockResolvedValue({ ok: true, rascunhos: [] });
});

// ── a consulta · AC-2 ────────────────────────────────────────────

describe('lerChamadosDaLateral · consulta', () => {
  it('filtra pelo solicitante e ordena por data de mudança, com desempate por _id', async () => {
    // Act
    await lerChamadosDaLateral(VIEWER);

    // Assert: é essa ordenação que o índice precisa cobrir
    expect(consulta.ordem).toEqual({ updatedAt: -1, _id: -1 });
    expect(consulta.filtro).toMatchObject({ solicitanteId: expect.anything() });
  });

  it('pede um a mais do que a página, que é como se sabe se há próxima', async () => {
    // Act
    await lerChamadosDaLateral(VIEWER);

    // Assert
    expect(consulta.limite).toBe(CHAMADOS_POR_PAGINA + 1);
  });

  it('monta o cursor composto, para data igual não repetir nem esconder chamado', async () => {
    // Arrange
    const em = new Date('2026-06-15T14:12:00.288Z');
    const id = new Types.ObjectId().toHexString();

    // Act
    await lerChamadosDaLateral(VIEWER, { em: em.toISOString(), id });

    // Assert
    expect(consulta.filtro).toMatchObject({
      $or: [{ updatedAt: { $lt: em } }, { updatedAt: em, _id: { $lt: expect.anything() } }],
    });
  });

  it('ignora cursor inválido em vez de montar um filtro quebrado', async () => {
    // Act
    await lerChamadosDaLateral(VIEWER, { em: 'não é data', id: 'não é id' });

    // Assert
    expect(consulta.filtro).not.toHaveProperty('$or');
  });
});

// ── páginas · AC-2 ───────────────────────────────────────────────

describe('lerChamadosDaLateral · paginação', () => {
  it('devolve a página cheia e avisa que há mais quando vem o extra', async () => {
    // Arrange
    docs = Array.from({ length: CHAMADOS_POR_PAGINA + 1 }, () => chamado());

    // Act
    const r = await lerChamadosDaLateral(VIEWER);

    // Assert
    expect(r.itens).toHaveLength(CHAMADOS_POR_PAGINA);
    expect(r.temMais).toBe(true);
  });

  it('avisa que acabou quando vem menos que a página', async () => {
    // Arrange
    docs = Array.from({ length: 3 }, () => chamado());

    // Act
    const r = await lerChamadosDaLateral(VIEWER);

    // Assert
    expect(r.itens).toHaveLength(3);
    expect(r.temMais).toBe(false);
  });

  it('aguenta lista vazia', async () => {
    // Act
    const r = await lerChamadosDaLateral(VIEWER);

    // Assert
    expect(r).toEqual({ itens: [], temMais: false });
  });
});

// ── a linha do chamado · AC-2, AC-10 ─────────────────────────────

describe('lerChamadosDaLateral · cada linha', () => {
  it('leva ao endereço da conversa quando o chamado tem uma', async () => {
    // Arrange
    const conversaId = new Types.ObjectId();
    docs = [chamado({ conversaId })];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert
    expect(item.href).toBe(`/conversas/${String(conversaId)}`);
  });

  it('leva ao endereço do chamado quando não há conversa, como no formulário', async () => {
    // Arrange
    const doc = chamado({ conversaId: null });
    docs = [doc];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert
    expect(item.href).toBe(`/conversas/${String(doc._id)}`);
  });

  it('diz quem está atendendo quando há técnico no chamado em atendimento', async () => {
    // Arrange
    docs = [chamado({ status: 'em atendimento', assignedToUserId: { name: 'Maurício Lima' } })];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert: só o primeiro nome, que é o que cabe na linha
    expect(item.apoio).toBe('#CHM-2026-00412 · Maurício está atendendo');
  });

  it('mostra só o número quando não há técnico, sem repetir a situação da marca', async () => {
    // Arrange
    docs = [chamado({ status: 'aberto', assignedToUserId: null })];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert
    expect(item.apoio).toBe('#CHM-2026-00412');
  });

  it('não promete atendimento quando o técnico existe mas o chamado está parado', async () => {
    // Arrange
    docs = [chamado({ status: 'aguardando_terceiros', assignedToUserId: { name: 'Ana' } })];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert
    expect(item.apoio).toBe('#CHM-2026-00412');
  });

  it('traduz a situação para o rótulo que a pessoa lê', async () => {
    // Arrange
    docs = [chamado({ status: 'em atendimento' })];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert
    expect(item.situacao).toBe('Em atendimento');
    expect(item.statusChave).toBe('em atendimento');
  });

  it('aguenta chamado sem título e sem número, sem quebrar a linha', async () => {
    // Arrange
    docs = [chamado({ titulo: '   ', ticket_number: undefined })];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert
    expect(item.titulo).toBe('Chamado sem título');
    expect(item.apoio).toBe('Sem número');
  });

  it('manda a data em ISO, para o cliente formatar no fuso dele', async () => {
    // Arrange
    docs = [chamado({ updatedAt: new Date('2026-09-15T12:00:00.000Z') })];

    // Act
    const [item] = (await lerChamadosDaLateral(VIEWER)).itens;

    // Assert
    expect(item.em).toBe('2026-09-15T12:00:00.000Z');
    expect(item.tipo).toBe('chamado');
    expect(item.confirmando).toBe(false);
  });
});

// ── o cursor da próxima página · AC-2 ────────────────────────────

describe('cursorDe', () => {
  it('aponta para o último chamado exibido', async () => {
    // Arrange
    const ultimo = chamado({ updatedAt: new Date('2026-01-01T00:00:00.000Z') });
    docs = [chamado(), ultimo];

    // Act
    const { itens } = await lerChamadosDaLateral(VIEWER);
    const cursor = cursorDe(itens);

    // Assert
    expect(cursor).toEqual({ em: '2026-01-01T00:00:00.000Z', id: String(ultimo._id) });
  });

  it('devolve nulo quando não há chamado para continuar', () => {
    // Act & Assert
    expect(cursorDe([])).toBeNull();
  });
});

// ── a lateral inteira · AC-2 ─────────────────────────────────────

describe('montarLateral', () => {
  it('põe os rascunhos num bloco e os chamados noutro', async () => {
    // Arrange
    mockListarRascunhos.mockResolvedValue({
      ok: true,
      rascunhos: [
        {
          id: '6aad5286df6f201a25eda5f1',
          previa: 'O ar da sala 302 está pingando',
          mensagensCount: 2,
          ultimaMensagemEm: new Date('2026-09-18T12:00:00.000Z'),
          expiresAt: null,
          confirmando: false,
        },
      ],
    });
    docs = [chamado()];

    // Act
    const lateral = await montarLateral(VIEWER);

    // Assert
    expect(lateral.rascunhos).toHaveLength(1);
    expect(lateral.chamados).toHaveLength(1);
    expect(lateral.rascunhos[0]).toMatchObject({
      tipo: 'rascunho',
      titulo: 'O ar da sala 302 está pingando',
      situacao: 'Rascunho',
      apoio: 'Ainda não virou chamado',
      href: '/conversas/6aad5286df6f201a25eda5f1',
      statusChave: null,
    });
  });

  it('marca `Confirmando` o rascunho que está virando chamado', async () => {
    // Arrange
    mockListarRascunhos.mockResolvedValue({
      ok: true,
      rascunhos: [
        {
          id: '6aad5286df6f201a25eda5f1',
          previa: 'relato',
          mensagensCount: 2,
          ultimaMensagemEm: new Date(),
          expiresAt: null,
          confirmando: true,
        },
      ],
    });

    // Act
    const lateral = await montarLateral(VIEWER);

    // Assert
    expect(lateral.rascunhos[0].situacao).toBe('Confirmando');
    expect(lateral.rascunhos[0].confirmando).toBe(true);
  });

  it('não derruba a tela quando os rascunhos falham de ler', async () => {
    // Arrange
    mockListarRascunhos.mockResolvedValue({ ok: false, reason: 'erro' });
    docs = [chamado()];

    // Act
    const lateral = await montarLateral(VIEWER);

    // Assert: a lista de chamados continua aparecendo
    expect(lateral.rascunhos).toEqual([]);
    expect(lateral.chamados).toHaveLength(1);
  });

  it('aguenta rascunho sem prévia, que é o caso do reparo', async () => {
    // Arrange
    mockListarRascunhos.mockResolvedValue({
      ok: true,
      rascunhos: [
        {
          id: '6aad5286df6f201a25eda5f1',
          previa: '  ',
          mensagensCount: 0,
          ultimaMensagemEm: new Date(),
          expiresAt: null,
          confirmando: false,
        },
      ],
    });

    // Act
    const lateral = await montarLateral(VIEWER);

    // Assert
    expect(lateral.rascunhos[0].titulo).toBe('Conversa sem texto');
  });
});
