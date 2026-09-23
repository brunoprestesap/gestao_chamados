// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom não implementa ResizeObserver; o Checkbox do Radix precisa dele pra montar.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class StubResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = StubResizeObserver;
}

// ── Mocks ────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const mockSalvar = vi.fn();
vi.mock('@/app/(dashboard)/configuracoes/ia-confianca/actions', () => ({
  salvarIaAutonomiaConfigAction: (...a: unknown[]) => mockSalvar(...a),
}));

import type { IaAutonomiaConfigLida } from '@/lib/ia-confianca/config';

import { IaConfiancaForm } from '../IaConfiancaForm';

/**
 * O formulário único de configuração (spec 0006).
 *
 * covers: AC-4 (aceitar a sugestão), AC-5 (formulário único, uma gravação),
 * AC-10 (validação de faixa, em branco vira null)
 */

const CONFIG_BASE: IaAutonomiaConfigLida = {
  servico: { limiteConfianca: null, amostraMinima: 30 },
  prioridade: { limiteConfianca: null, amostraMinima: 30 },
  autonomiaAtiva: false,
};

const submeter = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /salvar configuração/i }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSalvar.mockResolvedValue({ ok: true });
});

// ── renderização das duas seções ──────────────────────────────────

describe('IaConfiancaForm · seções', () => {
  it('mostra as duas seções, serviço e prioridade', () => {
    // Act
    render(
      <IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: null, prioridade: null }} />,
    );

    // Assert
    expect(screen.getByText('Serviço')).toBeInTheDocument();
    expect(screen.getByText('Prioridade')).toBeInTheDocument();
  });

  it('só mostra "Usar sugestão" pro campo que tem sugestão', () => {
    // Act
    render(<IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: 0.9, prioridade: null }} />);

    // Assert
    expect(screen.getAllByRole('button', { name: /usar sugestão/i })).toHaveLength(1);
  });
});

// ── aceitar a sugestão · AC-4 ──────────────────────────────────────

describe('IaConfiancaForm · aceitar a sugestão', () => {
  it('preenche o limite do campo com o valor sugerido', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: 0.9, prioridade: null }} />);

    // Act
    await user.click(screen.getByRole('button', { name: /usar sugestão/i }));

    // Assert
    const inputServico = screen.getAllByLabelText(/limite de confiança/i)[0];
    expect(inputServico).toHaveValue(0.9);
  });
});

// ── validação de faixa · AC-10 ─────────────────────────────────────

describe('IaConfiancaForm · validação', () => {
  // Os inputs também têm min/max/step nativos do HTML iguais ao Zod; sem
  // desligar a validação nativa, o navegador bloqueia o submit antes do
  // React Hook Form rodar, e a mensagem em português do Zod nunca aparece
  // (o valor errado nunca é gravado de qualquer jeito).
  function desligarValidacaoNativa() {
    document.querySelector('form')!.noValidate = true;
  }

  it('recusa um limite de confiança fora de 0 a 1, sem gravar', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: null, prioridade: null }} />,
    );
    desligarValidacaoNativa();
    const inputServico = screen.getAllByLabelText(/limite de confiança/i)[0];

    // Act
    await user.clear(inputServico);
    await user.type(inputServico, '1.5');
    await submeter(user);

    // Assert
    expect(await screen.findByText(/deve ser entre 0 e 1/i)).toBeInTheDocument();
    expect(mockSalvar).not.toHaveBeenCalled();
  });

  it('recusa amostra mínima 0, sem gravar', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: null, prioridade: null }} />,
    );
    desligarValidacaoNativa();
    const inputAmostra = screen.getAllByLabelText(/amostra mínima/i)[0];

    // Act
    await user.clear(inputAmostra);
    await user.type(inputAmostra, '0');
    await submeter(user);

    // Assert
    expect(await screen.findByText(/deve ser pelo menos 1/i)).toBeInTheDocument();
    expect(mockSalvar).not.toHaveBeenCalled();
  });

  it('deixar o limite em branco grava null, sem erro', async () => {
    // Arrange: já nasce em branco (config.servico.limiteConfianca é null)
    const user = userEvent.setup();
    render(
      <IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: null, prioridade: null }} />,
    );

    // Act
    await submeter(user);

    // Assert
    expect(mockSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        servico: { limiteConfianca: null, amostraMinima: 30 },
      }),
    );
  });
});

// ── gravação única · AC-5 ───────────────────────────────────────────

describe('IaConfiancaForm · gravação', () => {
  it('salva os três campos numa única chamada, inclusive o interruptor', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: null, prioridade: null }} />,
    );

    // Act
    await user.click(screen.getByRole('checkbox', { name: /autonomia da ia ativa/i }));
    await submeter(user);

    // Assert
    expect(mockSalvar).toHaveBeenCalledTimes(1);
    expect(mockSalvar).toHaveBeenCalledWith(expect.objectContaining({ autonomiaAtiva: true }));
  });

  it('ao salvar com sucesso, avisa e atualiza a página', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: null, prioridade: null }} />,
    );

    // Act
    await submeter(user);

    // Assert
    expect(await screen.findByRole('button', { name: /salvar configuração/i })).toBeEnabled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Configuração salva.');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('quando a gravação falha, mostra o erro e não atualiza a página', async () => {
    // Arrange
    mockSalvar.mockResolvedValue({ ok: false, error: 'Erro ao salvar configuração.' });
    const user = userEvent.setup();
    render(
      <IaConfiancaForm config={CONFIG_BASE} sugestoes={{ servico: null, prioridade: null }} />,
    );

    // Act
    await submeter(user);

    // Assert
    expect(await screen.findByRole('button', { name: /salvar configuração/i })).toBeEnabled();
    expect(mockToastError).toHaveBeenCalledWith('Erro ao salvar configuração.');
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
