// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lista e cadastro de contratos (spec 0016): vazio, criar com os campos do
 * formulário, erro do servidor ligado ao diálogo, edição já preenchida,
 * inativar e reativar, e nenhum botão de apagar.
 *
 * covers: AC-1, AC-2, AC-3, AC-4
 */

const refresh = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const acoes = vi.hoisted(() => ({
  criarContratoAction: vi.fn(),
  editarContratoAction: vi.fn(),
  alterarSituacaoContratoAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../actions', () => acoes);

import type { ContratoDoRelatorio } from '@/shared/contratos/relatorio.types';

import { GerirContratos } from '../GerirContratos';

const contrato: ContratoDoRelatorio = {
  id: 'c1',
  numero: '12/2025',
  empresa: 'Refrigeração Amazônia',
  cnpjFormatado: '11.222.333/0001-81',
  processoSei: 'SEI-1',
  objeto: null,
  fiscal: 'Fiscal Fulano',
  tiposServico: ['Ar-Condicionado'],
  vigenciaInicio: '2025-03-01',
  vigenciaFim: '2027-02-28',
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  acoes.criarContratoAction.mockResolvedValue({ ok: true, id: 'novo' });
  acoes.editarContratoAction.mockResolvedValue({ ok: true });
  acoes.alterarSituacaoContratoAction.mockResolvedValue({ ok: true });
});

async function preencher(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Número'), '20/2026');
  await user.type(screen.getByLabelText('Processo SEI'), 'SEI-2');
  await user.type(screen.getByLabelText('Empresa contratada'), 'Elevadores Norte');
  await user.type(screen.getByLabelText('CNPJ'), '11.222.333/0001-81');
  await user.type(screen.getByLabelText('Início da vigência'), '2026-09-15');
  await user.type(screen.getByLabelText('Fim da vigência'), '2027-09-14');
  await user.click(screen.getByRole('checkbox', { name: 'Elevador' }));
}

describe('GerirContratos', () => {
  it('sem contratos, mostra o vazio e o botão de criar (AC-1)', () => {
    render(<GerirContratos contratos={[]} />);

    expect(screen.getByText('Nenhum contrato cadastrado')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo contrato' })).toBeEnabled();
  });

  it('lista número, empresa, tipos, vigência e situação, sem botão de apagar (AC-1)', () => {
    render(<GerirContratos contratos={[contrato]} />);

    expect(screen.getByText('12/2025')).toBeVisible();
    expect(screen.getByText('01/03/2025 a 28/02/2027')).toBeVisible();
    expect(screen.getByText('Ativo')).toBeVisible();
    expect(screen.queryByRole('button', { name: /apagar|excluir/i })).not.toBeInTheDocument();
  });

  it('cria com os campos digitados e os tipos marcados, depois fecha e atualiza (AC-2)', async () => {
    const user = userEvent.setup();
    render(<GerirContratos contratos={[]} />);

    await user.click(screen.getByRole('button', { name: 'Novo contrato' }));
    await preencher(user);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(acoes.criarContratoAction).toHaveBeenCalledWith({
      numero: '20/2026',
      empresa: 'Elevadores Norte',
      cnpj: '11.222.333/0001-81',
      processoSei: 'SEI-2',
      objeto: '',
      fiscal: '',
      vigenciaInicio: '2026-09-15',
      vigenciaFim: '2027-09-14',
      tiposServico: ['Elevador'],
    });
    expect(toast.success).toHaveBeenCalledWith('Contrato cadastrado.');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('erro do servidor aparece no diálogo como alerta e o diálogo continua aberto (AC-3)', async () => {
    acoes.criarContratoAction.mockResolvedValueOnce({
      ok: false,
      error: 'O contrato 12/2025 já cobre Elevador de 01/03/2025 a 28/02/2027.',
    });
    const user = userEvent.setup();
    render(<GerirContratos contratos={[]} />);

    await user.click(screen.getByRole('button', { name: 'Novo contrato' }));
    await preencher(user);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O contrato 12/2025 já cobre Elevador de 01/03/2025 a 28/02/2027.',
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a edição abre preenchida e manda o id junto', async () => {
    const user = userEvent.setup();
    render(<GerirContratos contratos={[contrato]} />);

    await user.click(screen.getByRole('button', { name: 'Editar contrato 12/2025' }));
    expect(screen.getByLabelText('Número')).toHaveValue('12/2025');
    expect(screen.getByLabelText('Fiscal (opcional)')).toHaveValue('Fiscal Fulano');
    expect(screen.getByRole('checkbox', { name: 'Ar-Condicionado' })).toBeChecked();

    await user.clear(screen.getByLabelText('Fim da vigência'));
    await user.type(screen.getByLabelText('Fim da vigência'), '2027-12-31');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(acoes.editarContratoAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', vigenciaFim: '2027-12-31' }),
    );
  });

  it('inativa pelo botão com nome acessível e reativa quando já está inativo (AC-4)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GerirContratos contratos={[contrato]} />);

    await user.click(screen.getByRole('button', { name: 'Inativar contrato 12/2025' }));
    expect(acoes.alterarSituacaoContratoAction).toHaveBeenCalledWith({ id: 'c1', isActive: false });

    rerender(<GerirContratos contratos={[{ ...contrato, isActive: false }]} />);
    await user.click(screen.getByRole('button', { name: 'Reativar contrato 12/2025' }));
    expect(acoes.alterarSituacaoContratoAction).toHaveBeenLastCalledWith({
      id: 'c1',
      isActive: true,
    });
  });

  it('reativação recusada mostra o motivo num toast de erro (AC-3)', async () => {
    acoes.alterarSituacaoContratoAction.mockResolvedValueOnce({
      ok: false,
      error: 'O contrato 9 já cobre …',
    });
    const user = userEvent.setup();
    render(<GerirContratos contratos={[{ ...contrato, isActive: false }]} />);

    await user.click(screen.getByRole('button', { name: 'Reativar contrato 12/2025' }));

    expect(toast.error).toHaveBeenCalledWith('O contrato 9 já cobre …');
  });
});
