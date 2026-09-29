// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A correção de prioridade de um chamado validado ou em atendimento (spec
 * 0007, AC-11; janela alargada e motivo obrigatório pela spec 0009, AC-7 a
 * AC-10). A ação recusa fora da janela ou do papel; esta tela só mostra a
 * mensagem que a ação devolve, sem repetir a checagem aqui — cobrança dessa
 * lógica em `gestao/__tests__/actions.test.ts` e `update-ticket-priority.db.test.ts`.
 */

const mockUpdateTicketPriorityAction = vi.fn();
vi.mock('@/app/(dashboard)/gestao/actions', () => ({
  updateTicketPriorityAction: (...args: unknown[]) => mockUpdateTicketPriorityAction(...args),
}));

import { CorrigirPrioridadeDialog } from '../CorrigirPrioridadeDialog';

const CHAMADO_ID = 'a'.repeat(24);
const MOTIVO = 'Risco elétrico confirmado pelo técnico.';

async function escolherPrioridade(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: rotulo }));
}

function renderDialog(props: Partial<ComponentProps<typeof CorrigirPrioridadeDialog>> = {}) {
  return render(
    <CorrigirPrioridadeDialog
      open
      onOpenChange={vi.fn()}
      chamadoId={CHAMADO_ID}
      currentPriority="NORMAL"
      hasTechnician={false}
      isAdmin={false}
      onSuccess={vi.fn()}
      {...props}
    />,
  );
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
    renderDialog();

    const botao = screen.getByRole('button', { name: 'Corrigir Prioridade' });
    expect(botao).toBeDisabled();

    await escolherPrioridade(user, 'Alta');
    expect(botao).toBeEnabled();
  });

  it('mostra o formulário com a prioridade atual, o motivo e as ações', () => {
    renderDialog();

    expect(screen.getByRole('heading', { name: 'Corrigir Prioridade' })).toBeInTheDocument();
    expect(screen.getByText('Nova prioridade *')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('envia a correção com a prioridade escolhida e o motivo digitado, e fecha em sucesso', async () => {
    const user = userEvent.setup();
    mockUpdateTicketPriorityAction.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    renderDialog({ onOpenChange, onSuccess });

    await escolherPrioridade(user, 'Alta');
    await user.type(screen.getByLabelText('Motivo *'), MOTIVO);
    await user.click(screen.getByRole('button', { name: 'Corrigir Prioridade' }));

    await waitFor(() => {
      expect(mockUpdateTicketPriorityAction).toHaveBeenCalledWith({
        chamadoId: CHAMADO_ID,
        finalPriority: 'ALTA',
        motivo: MOTIVO,
      });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('motivo curto: não envia, mostra o erro de validação', async () => {
    const user = userEvent.setup();
    renderDialog();

    await escolherPrioridade(user, 'Alta');
    await user.type(screen.getByLabelText('Motivo *'), 'curto');
    await user.click(screen.getByRole('button', { name: 'Corrigir Prioridade' }));

    expect(await screen.findByText(/pelo menos 10 caracteres/)).toBeInTheDocument();
    expect(mockUpdateTicketPriorityAction).not.toHaveBeenCalled();
  });

  it('mostra o erro da action e não fecha o diálogo (ex.: janela fechou por atribuição concorrente)', async () => {
    const user = userEvent.setup();
    mockUpdateTicketPriorityAction.mockResolvedValue({
      ok: false,
      error: 'Os dados do chamado mudaram desde a última leitura. Atualize a página e tente de novo.',
    });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    renderDialog({ onOpenChange, onSuccess });

    await escolherPrioridade(user, 'Alta');
    await user.type(screen.getByLabelText('Motivo *'), MOTIVO);
    await user.click(screen.getByRole('button', { name: 'Corrigir Prioridade' }));

    expect(
      await screen.findByText(
        'Os dados do chamado mudaram desde a última leitura. Atualize a página e tente de novo.',
      ),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cancelar fecha sem chamar a action', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange, currentPriority: 'ALTA' });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockUpdateTicketPriorityAction).not.toHaveBeenCalled();
  });

  it('sem prioridade atual definida, assume NORMAL como padrão do formulário', async () => {
    const user = userEvent.setup();
    mockUpdateTicketPriorityAction.mockResolvedValue({ ok: true });

    renderDialog({ currentPriority: null });

    await escolherPrioridade(user, 'Alta');
    await user.type(screen.getByLabelText('Motivo *'), MOTIVO);
    await user.click(screen.getByRole('button', { name: 'Corrigir Prioridade' }));

    await waitFor(() => {
      expect(mockUpdateTicketPriorityAction).toHaveBeenCalledWith(
        expect.objectContaining({ finalPriority: 'ALTA' }),
      );
    });
  });

  // ── AC-10: só o Admin baixa a prioridade de um chamado com técnico ──

  it('com técnico e sem ser Admin, avisa e desabilita as prioridades mais baixas', async () => {
    renderDialog({ currentPriority: 'ALTA', hasTechnician: true, isAdmin: false });

    expect(
      screen.getByText(/já tem técnico atribuído: só o Admin pode baixar a prioridade/),
    ).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('combobox'));
    const normal = await screen.findByRole('option', { name: 'Normal' });
    expect(normal).toHaveAttribute('data-disabled');
    const emergencial = screen.getByRole('option', { name: 'Emergencial' });
    expect(emergencial).not.toHaveAttribute('data-disabled');
  });

  it('Admin com técnico: nenhuma prioridade fica desabilitada', async () => {
    const user = userEvent.setup();
    renderDialog({ currentPriority: 'ALTA', hasTechnician: true, isAdmin: true });

    expect(
      screen.queryByText(/só o Admin pode baixar a prioridade/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox'));
    const normal = await screen.findByRole('option', { name: 'Normal' });
    expect(normal).not.toHaveAttribute('data-disabled');
  });

  it('sem técnico: nenhuma prioridade fica desabilitada, mesmo sem ser Admin', async () => {
    const user = userEvent.setup();
    renderDialog({ currentPriority: 'ALTA', hasTechnician: false, isAdmin: false });

    await user.click(screen.getByRole('combobox'));
    const normal = await screen.findByRole('option', { name: 'Normal' });
    expect(normal).not.toHaveAttribute('data-disabled');
  });

  it('mostra o texto curto do efeito no SLA conforme a direção escolhida', async () => {
    const user = userEvent.setup();
    renderDialog({ currentPriority: 'NORMAL' });

    await escolherPrioridade(user, 'Alta');
    expect(screen.getByText(/nunca aumenta o prazo/)).toBeInTheDocument();

    await escolherPrioridade(user, 'Baixa');
    expect(screen.getByText(/prazo cheio da prioridade nova/)).toBeInTheDocument();
  });
});
