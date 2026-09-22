import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({ verifySession: () => mockVerifySession() }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

const mockFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: { findById: (...a: unknown[]) => ({ lean: () => mockFindById(...a) }) },
}));

const mockServicoSugerido = vi.fn();
vi.mock('@/lib/conversas', () => ({
  servicoSugeridoPelaIa: (...a: unknown[]) => mockServicoSugerido(...a),
}));

import { GET } from '@/app/api/meus-chamados/[id]/route';

/**
 * O detalhe do chamado com a marca do chat (spec 0004).
 *
 * covers: AC-15 (canal e serviço sugerido no detalhe, sem prioridade sugerida)
 */

const CHAMADO_ID = new Types.ObjectId().toHexString();
const SOLICITANTE_ID = new Types.ObjectId().toHexString();

function chamado(extra: Record<string, unknown> = {}) {
  return {
    _id: CHAMADO_ID,
    titulo: 'Troca de lâmpada — Sala 302',
    status: 'aberto',
    solicitanteId: SOLICITANTE_ID,
    tipoServico: 'Manutenção Predial',
    createdAt: new Date('2026-09-18T10:00:00Z'),
    updatedAt: new Date('2026-09-18T10:00:00Z'),
    ...extra,
  };
}

const pedido = () =>
  [new Request('http://localhost'), { params: Promise.resolve({ id: CHAMADO_ID }) }] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySession.mockResolvedValue({ userId: SOLICITANTE_ID, role: 'Solicitante' });
  mockServicoSugerido.mockResolvedValue(new Set());
});

describe('GET /api/meus-chamados/[id] · marca do chat', () => {
  it('diz que veio do chat e que a IA sugeriu o serviço', async () => {
    // Arrange
    mockFindById.mockResolvedValue(chamado({ canalAbertura: 'chat' }));
    mockServicoSugerido.mockResolvedValue(new Set([CHAMADO_ID]));

    // Act
    const corpo = await (await GET(...pedido())).json();

    // Assert
    expect(corpo.item).toMatchObject({ canalAbertura: 'chat', servicoSugeridoIa: true });
    expect(mockServicoSugerido).toHaveBeenCalledWith([CHAMADO_ID]);
  });

  it('chamado do formulário, ou antigo sem canal, sai como formulário sem consultar decisões', async () => {
    // Arrange
    mockFindById.mockResolvedValue(chamado());

    // Act
    const corpo = await (await GET(...pedido())).json();

    // Assert
    expect(corpo.item).toMatchObject({ canalAbertura: 'formulario', servicoSugeridoIa: false });
    expect(mockServicoSugerido).not.toHaveBeenCalled();
  });

  it('chamado do chat sem serviço devolve os ids nulos, para a tela mostrar a definir', async () => {
    // Arrange
    mockFindById.mockResolvedValue(
      chamado({ canalAbertura: 'chat', catalogServiceId: null, subtypeId: null }),
    );

    // Act
    const corpo = await (await GET(...pedido())).json();

    // Assert
    expect(corpo.item.catalogServiceId).toBeNull();
    expect(corpo.item.subtypeId).toBeNull();
  });
});
