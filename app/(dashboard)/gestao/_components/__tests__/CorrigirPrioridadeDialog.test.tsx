// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A correção mínima da prioridade de um chamado já `validado` (spec 0007,
 * AC-11, AC-12). A ação recusa fora da janela; esta tela só mostra a
 * mensagem que a ação devolve, sem repetir a checagem aqui — cobrança dessa
 * lógica em `gestao/__tests__/actions.test.ts` e `update-ticket-priority.db.test.ts`.
 */

const mockUpdateTicketPriorityAction = vi.fn();
vi.mock('@/app/(dashboard)/gestao/actions', () => ({
  updateTicketPriorityAction: (...args: unknown[]) => mockUpdateTicketPriorityAction(...args),
}));

import { CorrigirPrioridadeDialog } from '../CorrigirPrioridadeDialog';

const CHAMADO_ID = 'a'.repeat(24);

async function escolherPrioridade(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: rotulo }));
}

describe('CorrigirPrioridadeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // O Radix Select usa APIs de ponteiro e rolagem que o jsdom não tem.
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('com a prioridade atual selecionada, o botão fica desabilitado; trocar habilita', async () => {
    const user = userEvent.setup();

    render(
      <CorrigirPrioridadeDialog
        open
        onOpenChange={vi.fn()}
        chamadoId={CHAMADO_ID}
        currentPriority="NORMAL"
        onSuccess={vi.fn()}
      />,
    );

    const botao = screen.getByRole('button', { name: 'Corrigir Prioridade' });
    expect(botao).toBeDisabled();

    await escolherPrioridade(user, 'Alta');
    expect(botao).toBeEnabled();
  });

  it('mostra o formulário com a prioridade atual, observações e as ações', () => {
    render(
      <CorrigirPrioridadeDialog
        open
        onOpenChange={vi.fn()}
        chamadoId={CHAMADO_ID}
        currentPriority="NORMAL"
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Corrigir Prioridade' })).toBeInTheDocument();
    expect(screen.getByText('Nova prioridade *')).toBeInTheDocument();
    expect(screen.getByLabelText('Observações da correção')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('envia a correção com a prioridade escolhida e as observações digitadas, e fecha em sucesso', async () => {
    const user = userEvent.setup();
    mockUpdateTicketPriorityAction.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CorrigirPrioridadeDialog
        open
        onOpenChange={onOpenChange}
        chamadoId={CHAMADO_ID}
        currentPriority="NORMAL"
        onSuccess={onSuccess}
      />,
    );

    await escolherPrioridade(user, 'Alta');
    await user.type(screen.getByLabelText('Observações da correção'), 'Risco elétrico confirmado');
    await user.click(screen.getByRole('button', { name: 'Corrigir Prioridade' }));

    await waitFor(() => {
      expect(mockUpdateTicketPriorityAction).toHaveBeenCalledWith({
        chamadoId: CHAMADO_ID,
        finalPriority: 'ALTA',
        classificationNotes: 'Risco elétrico confirmado',
      });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mostra o erro da action e não fecha o diálogo (ex.: janela fechou por atribuição concorrente, AC-12)', async () => {
    const user = userEvent.setup();
    mockUpdateTicketPriorityAction.mockResolvedValue({
      ok: false,
      error: 'Não é mais possível corrigir a prioridade: o chamado já tem técnico atribuído.',
    });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CorrigirPrioridadeDialog
        open
        onOpenChange={onOpenChange}
        chamadoId={CHAMADO_ID}
        currentPriority="NORMAL"
        onSuccess={onSuccess}
      />,
    );

    await escolherPrioridade(user, 'Alta');
    await user.click(screen.getByRole('button', { name: 'Corrigir Prioridade' }));

    expect(
      await screen.findByText(
        'Não é mais possível corrigir a prioridade: o chamado já tem técnico atribuído.',
      ),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cancelar fecha sem chamar a action', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CorrigirPrioridadeDialog
        open
        onOpenChange={onOpenChange}
        chamadoId={CHAMADO_ID}
        currentPriority="ALTA"
        onSuccess={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockUpdateTicketPriorityAction).not.toHaveBeenCalled();
  });

  it('sem prioridade atual definida, assume NORMAL como padrão do formulário', async () => {
    const user = userEvent.setup();
    mockUpdateTicketPriorityAction.mockResolvedValue({ ok: true });

    render(
      <CorrigirPrioridadeDialog
        open
        onOpenChange={vi.fn()}
        chamadoId={CHAMADO_ID}
        currentPriority={null}
        onSuccess={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Corrigir Prioridade' }));

    await waitFor(() => {
      expect(mockUpdateTicketPriorityAction).toHaveBeenCalledWith(
        expect.objectContaining({ finalPriority: 'NORMAL' }),
      );
    });
  });
});
