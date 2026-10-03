// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Abrir e encerrar a campanha pela tela (spec 0012, AC-1): o nome é
 * obrigatório, a recusa do servidor ("já existe uma aberta") aparece ligada
 * ao campo, e encerrar pede confirmação porque não tem volta.
 *
 * covers: AC-1
 */

const refresh = vi.hoisted(() => vi.fn());
const acoes = vi.hoisted(() => ({
  abrirCampanhaAction: vi.fn(),
  encerrarCampanhaAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../actions', () => acoes);

import { AbrirCampanha, EncerrarCampanha } from '../GestaoCampanha';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AbrirCampanha', () => {
  it('o botão só libera com um nome escrito', async () => {
    const user = userEvent.setup();
    render(<AbrirCampanha />);
    const botao = screen.getByRole('button', { name: 'Abrir campanha' });
    expect(botao).toBeDisabled();
    await user.type(screen.getByLabelText('Nome da campanha'), '   ');
    expect(botao).toBeDisabled();
    await user.type(screen.getByLabelText('Nome da campanha'), 'Vistoria inicial');
    expect(botao).toBeEnabled();
  });

  it('abre a campanha, avisa, limpa o campo e atualiza a página', async () => {
    const user = userEvent.setup();
    acoes.abrirCampanhaAction.mockResolvedValueOnce({ ok: true, id: 'c1' });
    render(<AbrirCampanha />);
    await user.type(screen.getByLabelText('Nome da campanha'), 'Vistoria inicial');
    await user.click(screen.getByRole('button', { name: 'Abrir campanha' }));

    expect(acoes.abrirCampanhaAction).toHaveBeenCalledWith({ nome: 'Vistoria inicial' });
    expect(toast.success).toHaveBeenCalledWith('Campanha aberta.');
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText('Nome da campanha')).toHaveValue('');
  });

  it('com outra campanha aberta, mostra o motivo ligado ao campo', async () => {
    const user = userEvent.setup();
    acoes.abrirCampanhaAction.mockResolvedValueOnce({
      ok: false,
      error: 'Já existe uma campanha aberta: Vistoria inicial',
    });
    render(<AbrirCampanha />);
    const campo = screen.getByLabelText('Nome da campanha');
    await user.type(campo, 'Outra');
    await user.click(screen.getByRole('button', { name: 'Abrir campanha' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Já existe uma campanha aberta: Vistoria inicial');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAttribute('aria-describedby', alerta.id);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('EncerrarCampanha', () => {
  it('pede confirmação dizendo o nome e que não reabre', async () => {
    const user = userEvent.setup();
    render(<EncerrarCampanha id="c1" nome="Vistoria inicial" />);
    await user.click(screen.getByRole('button', { name: 'Encerrar campanha' }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Encerrar “Vistoria inicial”?');
    expect(dialogo).toHaveTextContent('Campanha encerrada não reabre.');
    expect(acoes.encerrarCampanhaAction).not.toHaveBeenCalled();
  });

  it('Cancelar não encerra', async () => {
    const user = userEvent.setup();
    render(<EncerrarCampanha id="c1" nome="Vistoria inicial" />);
    await user.click(screen.getByRole('button', { name: 'Encerrar campanha' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(acoes.encerrarCampanhaAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirmar encerra a campanha e atualiza a página', async () => {
    const user = userEvent.setup();
    acoes.encerrarCampanhaAction.mockResolvedValueOnce({ ok: true });
    render(<EncerrarCampanha id="c1" nome="Vistoria inicial" />);
    await user.click(screen.getByRole('button', { name: 'Encerrar campanha' }));
    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));

    expect(acoes.encerrarCampanhaAction).toHaveBeenCalledWith({ id: 'c1' });
    expect(toast.success).toHaveBeenCalledWith('Campanha encerrada.');
    expect(refresh).toHaveBeenCalled();
  });

  it('se o servidor recusar, avisa o erro e não atualiza', async () => {
    const user = userEvent.setup();
    acoes.encerrarCampanhaAction.mockResolvedValueOnce({
      ok: false,
      error: 'Esta campanha não está aberta.',
    });
    render(<EncerrarCampanha id="c1" nome="Vistoria inicial" />);
    await user.click(screen.getByRole('button', { name: 'Encerrar campanha' }));
    await user.click(await screen.findByRole('button', { name: 'Encerrar' }));
    expect(toast.error).toHaveBeenCalledWith('Esta campanha não está aberta.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
