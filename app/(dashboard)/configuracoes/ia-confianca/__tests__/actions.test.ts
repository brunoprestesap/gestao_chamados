import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mockRevalidatePath(...a) }));

const mockRequireAdmin = vi.fn();
vi.mock('@/lib/dal', () => ({ requireAdmin: () => mockRequireAdmin() }));

const mockSalvarConfig = vi.fn();
vi.mock('@/lib/ia-confianca/config', () => ({
  salvarConfig: (...a: unknown[]) => mockSalvarConfig(...a),
}));

import { salvarIaAutonomiaConfigAction } from '@/app/(dashboard)/configuracoes/ia-confianca/actions';

/** `salvarIaAutonomiaConfigAction`: autorização, validação e gravação (spec 0006, AC-5, AC-8, AC-10). */

const ADMIN_ID = '507f1f77bcf86cd799439011';

const valido = {
  servico: { limiteConfianca: 0.9, amostraMinima: 30 },
  prioridade: { limiteConfianca: null, amostraMinima: 30 },
  autonomiaAtiva: false,
  atribuicaoAutomaticaAtiva: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ userId: ADMIN_ID, role: 'Admin' });
  mockSalvarConfig.mockResolvedValue(undefined);
});

describe('salvarIaAutonomiaConfigAction', () => {
  it('salva a configuração válida e revalida a página (AC-5)', async () => {
    const result = await salvarIaAutonomiaConfigAction(valido);

    expect(result).toEqual({ ok: true });
    expect(mockSalvarConfig).toHaveBeenCalledWith(valido, ADMIN_ID);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/configuracoes/ia-confianca');
  });

  it('em branco grava null normalmente (AC-10)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = { ...valido, servico: { limiteConfianca: '', amostraMinima: 30 } } as any;

    const result = await salvarIaAutonomiaConfigAction(raw);

    expect(result).toEqual({ ok: true });
    expect(mockSalvarConfig).toHaveBeenCalledWith(
      expect.objectContaining({ servico: { limiteConfianca: null, amostraMinima: 30 } }),
      ADMIN_ID,
    );
  });

  it('recusa limite de confiança fora de 0 a 1 sem gravar nada (AC-10)', async () => {
    const raw = { ...valido, servico: { limiteConfianca: 1.5, amostraMinima: 30 } };

    const result = await salvarIaAutonomiaConfigAction(raw);

    expect(result.ok).toBe(false);
    expect(mockSalvarConfig).not.toHaveBeenCalled();
  });

  it('recusa amostra mínima menor que 1 sem gravar nada (AC-10)', async () => {
    const raw = { ...valido, prioridade: { limiteConfianca: null, amostraMinima: 0 } };

    const result = await salvarIaAutonomiaConfigAction(raw);

    expect(result.ok).toBe(false);
    expect(mockSalvarConfig).not.toHaveBeenCalled();
  });

  it('grava a atribuição automática ligada, separada da autonomia (spec 0008, AC-5)', async () => {
    const ligada = { ...valido, autonomiaAtiva: true, atribuicaoAutomaticaAtiva: true };

    const result = await salvarIaAutonomiaConfigAction(ligada);

    expect(result).toEqual({ ok: true });
    expect(mockSalvarConfig).toHaveBeenCalledWith(ligada, ADMIN_ID);
  });

  it('recusa um envio sem o interruptor da atribuição automática, sem gravar nada (spec 0008)', async () => {
    const semCampo: Record<string, unknown> = { ...valido };
    delete semCampo.atribuicaoAutomaticaAtiva;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await salvarIaAutonomiaConfigAction(semCampo as any);

    expect(result.ok).toBe(false);
    expect(mockSalvarConfig).not.toHaveBeenCalled();
  });

  it('fora do Admin, devolve o mesmo NEXT_REDIRECT das demais ações restritas (AC-8)', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'));

    const result = await salvarIaAutonomiaConfigAction(valido);

    expect(result).toEqual({ ok: false, error: 'NEXT_REDIRECT' });
    expect(mockSalvarConfig).not.toHaveBeenCalled();
  });
});
