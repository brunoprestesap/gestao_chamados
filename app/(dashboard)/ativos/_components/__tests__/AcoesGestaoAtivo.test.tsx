// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mudar status e validar o cadastro na ficha (spec 0011, AC-6 e AC-7): o
 * status que exige observação trava o Salvar até ela ser escrita; validar sem
 * local fica desabilitado e explica por quê.
 */

const refresh = vi.hoisted(() => vi.fn());
const acoes = vi.hoisted(() => ({
  alterarStatusAtivoAction: vi.fn(),
  validarAtivoAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../actions', () => acoes);

import { AcoesGestaoAtivo } from '../AcoesGestaoAtivo';

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

async function escolherStatus(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.click(screen.getByRole('button', { name: /Mudar status/ }));
  await user.click(screen.getByRole('combobox', { name: 'Novo status' }));
  await user.click(await screen.findByRole('option', { name: rotulo }));
}

describe('AcoesGestaoAtivo', () => {
  it('Baixado exige observação: Salvar só libera depois de escrever', async () => {
    const user = userEvent.setup();
    acoes.alterarStatusAtivoAction.mockResolvedValue({ ok: true });
    render(<AcoesGestaoAtivo id="a1" status="em_operacao" statusCadastro="importado" temLocal />);
    await escolherStatus(user, 'Baixado');
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(screen.getByLabelText(/Observação \(obrigatória\)/)).toBeInTheDocument();
    expect(salvar).toBeDisabled();
    await user.type(screen.getByLabelText(/Observação/), 'Laudo 12/2026');
    await user.click(salvar);
    expect(acoes.alterarStatusAtivoAction).toHaveBeenCalledWith({
      id: 'a1',
      status: 'baixado',
      observacao: 'Laudo 12/2026',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('Em manutenção não exige observação', async () => {
    const user = userEvent.setup();
    render(<AcoesGestaoAtivo id="a1" status="em_operacao" statusCadastro="importado" temLocal />);
    await escolherStatus(user, 'Em manutenção');
    expect(screen.getByLabelText(/Observação \(opcional\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('não deixa salvar o mesmo status', async () => {
    const user = userEvent.setup();
    render(<AcoesGestaoAtivo id="a1" status="inoperante" statusCadastro="importado" temLocal />);
    await user.click(screen.getByRole('button', { name: /Mudar status/ }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('mostra o erro do servidor dentro do diálogo', async () => {
    const user = userEvent.setup();
    acoes.alterarStatusAtivoAction.mockResolvedValue({ ok: false, error: 'Ativo inexistente.' });
    render(<AcoesGestaoAtivo id="a1" status="em_operacao" statusCadastro="importado" temLocal />);
    await escolherStatus(user, 'Em manutenção');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ativo inexistente.');
  });

  it('validar fica desabilitado sem local e explica o motivo', () => {
    render(
      <AcoesGestaoAtivo id="a1" status="em_operacao" statusCadastro="importado" temLocal={false} />,
    );
    expect(screen.getByRole('button', { name: /Validar cadastro/ })).toBeDisabled();
    expect(screen.getByText('Para validar, defina o local em Editar.')).toBeInTheDocument();
  });

  it('validar com local chama a action', async () => {
    const user = userEvent.setup();
    acoes.validarAtivoAction.mockResolvedValue({ ok: true });
    render(<AcoesGestaoAtivo id="a1" status="em_operacao" statusCadastro="em_vistoria" temLocal />);
    await user.click(screen.getByRole('button', { name: /Validar cadastro/ }));
    expect(acoes.validarAtivoAction).toHaveBeenCalledWith({ id: 'a1' });
  });

  it('ativo já validado não mostra o botão de validar', () => {
    render(<AcoesGestaoAtivo id="a1" status="em_operacao" statusCadastro="validado" temLocal />);
    expect(screen.queryByRole('button', { name: /Validar cadastro/ })).not.toBeInTheDocument();
  });
});
