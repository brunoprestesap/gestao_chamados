import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockLerConversa = vi.fn();
const mockLerLinhaDoTempo = vi.fn();
vi.mock('@/lib/conversas', () => ({
  lerConversa: (...a: unknown[]) => mockLerConversa(...a),
  lerLinhaDoTempo: (...a: unknown[]) => mockLerLinhaDoTempo(...a),
}));

const mockChamadoFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: { findById: (...a: unknown[]) => mockChamadoFindById(...a) },
}));

const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: { find: (...a: unknown[]) => mockUserFind(...a) },
}));

import { abrirConversa, lerChamadoEmLeitura } from '../leitura';

/**
 * Como `/conversas/[id]` decide o que mostrar (spec 0003): conversa primeiro,
 * chamado depois, e conversa já ligada a chamado cai no modo leitura.
 *
 * covers: AC-10 (modo leitura e ordem de resolução), AC-1 (404 igual para
 * conversa de outra pessoa e para inexistente)
 */

const VIEWER = { userId: '6aad5286df6f201a25eda111', role: 'Solicitante' as const };
const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const CHAMADO_ID = '6aad5286df6f201a25eda5f9';
const USER_ID = '6aad5286df6f201a25eda222';

/** Cadeia de consulta do Mongoose, do jeito que o código encadeia. */
function cadeia(resultado: unknown) {
  const c = { select: () => c, lean: async () => resultado };
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLerLinhaDoTempo.mockResolvedValue({ ok: true, itens: [], truncado: false });
  mockChamadoFindById.mockReturnValue(
    cadeia({
      ticket_number: 'CHM-2026-00412',
      titulo: 'Lâmpada queimada',
      status: 'em atendimento',
      createdAt: new Date('2026-09-17T11:40:00.000Z'),
    }),
  );
  mockUserFind.mockReturnValue(cadeia([]));
});

// ── ordem de resolução · AC-10 ───────────────────────────────────

describe('abrirConversa · ordem de resolução', () => {
  it('abre o rascunho quando o id é de uma conversa sem chamado', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({
      ok: true,
      conversa: {
        id: CONVERSA_ID,
        situacao: 'rascunho',
        chamadoId: null,
        previa: 'O ar da sala 302 pinga',
        mensagensCount: 2,
      },
      mensagens: [
        {
          id: 'm1',
          autor: 'solicitante',
          texto: 'O ar da sala 302 pinga',
          createdAt: new Date('2026-09-18T09:12:00.000Z'),
        },
      ],
    });

    // Act
    const r = await abrirConversa(VIEWER, CONVERSA_ID);

    // Assert
    expect(r.tipo).toBe('rascunho');
    if (r.tipo !== 'rascunho') return;
    expect(r.conversa.mensagens[0].em).toBe('2026-09-18T09:12:00.000Z');
    expect(mockLerLinhaDoTempo).not.toHaveBeenCalled();
  });

  it('cai no modo leitura quando a conversa já virou chamado', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({
      ok: true,
      conversa: { id: CONVERSA_ID, situacao: 'vinculada', chamadoId: CHAMADO_ID },
      mensagens: [],
    });

    // Act
    const r = await abrirConversa(VIEWER, CONVERSA_ID);

    // Assert
    expect(r.tipo).toBe('chamado');
    expect(mockLerLinhaDoTempo).toHaveBeenCalledWith(VIEWER, CHAMADO_ID);
  });

  it('tenta como chamado só quando a conversa não existe', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });

    // Act
    const r = await abrirConversa(VIEWER, CHAMADO_ID);

    // Assert
    expect(r.tipo).toBe('chamado');
    expect(mockLerLinhaDoTempo).toHaveBeenCalledWith(VIEWER, CHAMADO_ID);
  });

  it('para na conversa de outra pessoa, sem tentar como chamado', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({ ok: false, reason: 'sem_permissao' });

    // Act
    const r = await abrirConversa(VIEWER, CONVERSA_ID);

    // Assert: tentar como chamado poderia revelar que o id existe
    expect(r).toEqual({ tipo: 'falha', reason: 'sem_permissao' });
    expect(mockLerLinhaDoTempo).not.toHaveBeenCalled();
  });

  it('falha quando não é conversa nem chamado', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });
    mockLerLinhaDoTempo.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });

    // Act
    const r = await abrirConversa(VIEWER, CHAMADO_ID);

    // Assert
    expect(r).toEqual({ tipo: 'falha', reason: 'nao_encontrada' });
  });
});

// ── o chamado em leitura · AC-10 ─────────────────────────────────

describe('lerChamadoEmLeitura', () => {
  it('recusa id que nem é ObjectId, sem consultar nada', async () => {
    // Act
    const r = await lerChamadoEmLeitura(VIEWER, 'nao-e-id');

    // Assert
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(mockLerLinhaDoTempo).not.toHaveBeenCalled();
  });

  it('monta o cabeçalho com número, título, situação e data de abertura', async () => {
    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leitura).toMatchObject({
      chamadoId: CHAMADO_ID,
      ticketNumber: 'CHM-2026-00412',
      titulo: 'Lâmpada queimada',
      situacao: 'Em atendimento',
      abertoEm: '2026-09-17T11:40:00.000Z',
    });
  });

  it('falha quando a linha do tempo nega, antes de ler o chamado', async () => {
    // Arrange
    mockLerLinhaDoTempo.mockResolvedValue({ ok: false, reason: 'sem_permissao' });

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'sem_permissao' });
    expect(mockChamadoFindById).not.toHaveBeenCalled();
  });

  it('falha quando o chamado sumiu entre uma leitura e outra', async () => {
    // Arrange
    mockChamadoFindById.mockReturnValue(cadeia(null));

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
  });

  it('resolve o nome de quem agiu numa consulta só, para a tela inteira', async () => {
    // Arrange
    mockLerLinhaDoTempo.mockResolvedValue({
      ok: true,
      truncado: false,
      itens: [
        {
          fonte: 'comentario',
          id: 'c1',
          em: new Date('2026-09-17T13:00:00.000Z'),
          dados: { userId: USER_ID, content: 'passo hoje à tarde', visibility: 'publico' },
        },
        {
          fonte: 'historico',
          id: 'h1',
          em: new Date('2026-09-17T14:00:00.000Z'),
          dados: {
            action: 'atribuicao_tecnico',
            actorType: 'usuario',
            userId: USER_ID,
            observacoes: '',
            statusAnterior: null,
            statusNovo: null,
            decisaoIaId: null,
          },
        },
      ],
    });
    mockUserFind.mockReturnValue(
      cadeia([{ _id: new Types.ObjectId(USER_ID), name: 'Maurício Lima' }]),
    );

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    expect(mockUserFind).toHaveBeenCalledOnce();
    if (!r.ok) return;
    const comentario = r.leitura.itens[0];
    expect(comentario).toMatchObject({ fonte: 'comentario', autorNome: 'Maurício Lima' });
    expect(r.leitura.itens[1]).toMatchObject({
      fonte: 'historico',
      texto: 'Atribuição de Técnico por Maurício Lima',
    });
  });

  it('marca o comentário interno, que só a gestão e o técnico veem', async () => {
    // Arrange
    mockLerLinhaDoTempo.mockResolvedValue({
      ok: true,
      truncado: false,
      itens: [
        {
          fonte: 'comentario',
          id: 'c1',
          em: new Date(),
          dados: { userId: USER_ID, content: 'nota interna', visibility: 'interno' },
        },
      ],
    });

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    if (!r.ok) return;
    expect(r.leitura.itens[0]).toMatchObject({ interno: true });
  });

  it('usa o rótulo do ator quando a ação não tem usuário, como a IA', async () => {
    // Arrange
    mockLerLinhaDoTempo.mockResolvedValue({
      ok: true,
      truncado: false,
      itens: [
        {
          fonte: 'historico',
          id: 'h1',
          em: new Date(),
          dados: {
            action: 'decisao_ia',
            actorType: 'ia',
            userId: null,
            observacoes: 'prioridade NORMAL',
            statusAnterior: null,
            statusNovo: null,
            decisaoIaId: null,
          },
        },
      ],
    });

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    if (!r.ok) return;
    expect(r.leitura.itens[0]).toMatchObject({
      texto: 'Decisão da IA por IA · prioridade NORMAL',
    });
  });

  it('corta observação longa, para a ficha não virar um parágrafo', async () => {
    // Arrange
    mockLerLinhaDoTempo.mockResolvedValue({
      ok: true,
      truncado: false,
      itens: [
        {
          fonte: 'historico',
          id: 'h1',
          em: new Date(),
          dados: {
            action: 'classificacao',
            actorType: 'sistema',
            userId: null,
            observacoes: 'x'.repeat(400),
            statusAnterior: null,
            statusNovo: null,
            decisaoIaId: null,
          },
        },
      ],
    });

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    if (!r.ok) return;
    const item = r.leitura.itens[0];
    expect(item.fonte === 'historico' && item.texto.length).toBeLessThan(240);
    expect(item.fonte === 'historico' && item.texto.endsWith('…')).toBe(true);
  });

  it('repassa o aviso de linha do tempo cortada', async () => {
    // Arrange
    mockLerLinhaDoTempo.mockResolvedValue({ ok: true, itens: [], truncado: true });

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    if (!r.ok) return;
    expect(r.leitura.truncado).toBe(true);
  });

  it('não consulta usuário nenhum quando não há quem resolver', async () => {
    // Act
    await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it('manda a mensagem da conversa como item de leitura, com o autor', async () => {
    // Arrange
    mockLerLinhaDoTempo.mockResolvedValue({
      ok: true,
      truncado: false,
      itens: [
        {
          fonte: 'mensagem',
          id: 'm1',
          em: new Date('2026-09-17T08:38:00.000Z'),
          dados: { autor: 'ia', texto: 'Anotado.', userId: null, tipo: 'texto' },
        },
      ],
    });

    // Act
    const r = await lerChamadoEmLeitura(VIEWER, CHAMADO_ID);

    // Assert
    if (!r.ok) return;
    expect(r.leitura.itens[0]).toEqual({
      fonte: 'mensagem',
      id: 'm1',
      em: '2026-09-17T08:38:00.000Z',
      autor: 'ia',
      texto: 'Anotado.',
    });
  });
});
