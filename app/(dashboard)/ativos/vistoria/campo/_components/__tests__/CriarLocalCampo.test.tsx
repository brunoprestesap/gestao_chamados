// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Criar local na tela de campo (spec 0012, AC-14): some sem sinal, cria
 * abaixo do local escolhido pela action da 0011 e entrega o novo local à
 * tela já com o caminho montado; a recusa do servidor aparece no formulário.
 *
 * covers: AC-14
 */

const criar = vi.hoisted(() => vi.fn());
vi.mock('../../../../actions', () => ({ criarLocalizacaoAction: criar }));

import { CriarLocalCampo } from '../CriarLocalCampo';

const PAI = { id: 'p1', nome: '3º andar', tipo: 'andar', parentId: 'pr', caminho: 'Sede/3º andar' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CriarLocalCampo', () => {
  it('sem sinal, não oferece criar e orienta escolher o local mais próximo', () => {
    render(<CriarLocalCampo pai={PAI} online={false} onCriado={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Criar local/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Sem sinal não dá para criar local/)).toBeInTheDocument();
  });

  it('cria abaixo do pai e devolve o local com o caminho completo', async () => {
    const user = userEvent.setup();
    criar.mockResolvedValueOnce({ ok: true, id: 'novo1' });
    const onCriado = vi.fn().mockResolvedValue(undefined);
    render(<CriarLocalCampo pai={PAI} online onCriado={onCriado} />);

    await user.click(screen.getByRole('button', { name: 'Criar local abaixo de 3º andar' }));
    await user.selectOptions(screen.getByLabelText('Tipo'), 'area_tecnica');
    await user.type(screen.getByLabelText('Nome'), '  Casa de máquinas ');
    await user.click(screen.getByRole('button', { name: 'Criar local' }));

    expect(criar).toHaveBeenCalledWith({
      nome: '  Casa de máquinas ',
      tipo: 'area_tecnica',
      parentId: 'p1',
    });
    expect(onCriado).toHaveBeenCalledWith({
      id: 'novo1',
      nome: 'Casa de máquinas',
      tipo: 'area_tecnica',
      parentId: 'p1',
      caminho: 'Sede/3º andar/Casa de máquinas',
    });
    // Depois de criar, o formulário fecha e volta o botão.
    expect(
      await screen.findByRole('button', { name: 'Criar local abaixo de 3º andar' }),
    ).toBeInTheDocument();
  });

  it('nome em branco não deixa enviar', async () => {
    const user = userEvent.setup();
    render(<CriarLocalCampo pai={PAI} online onCriado={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Criar local abaixo/ }));
    expect(screen.getByRole('button', { name: 'Criar local' })).toBeDisabled();
    await user.type(screen.getByLabelText('Nome'), '   ');
    expect(screen.getByRole('button', { name: 'Criar local' })).toBeDisabled();
  });

  it('a recusa do servidor aparece no formulário e nada é entregue à tela', async () => {
    const user = userEvent.setup();
    criar.mockResolvedValueOnce({ ok: false, error: 'Já existe um local com esse nome aqui.' });
    const onCriado = vi.fn();
    render(<CriarLocalCampo pai={PAI} online onCriado={onCriado} />);
    await user.click(screen.getByRole('button', { name: /Criar local abaixo/ }));
    await user.type(screen.getByLabelText('Nome'), 'Sala 1');
    await user.click(screen.getByRole('button', { name: 'Criar local' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um local com esse nome aqui.',
    );
    expect(onCriado).not.toHaveBeenCalled();
  });

  it('queda de conexão vira mensagem de tentar de novo', async () => {
    const user = userEvent.setup();
    criar.mockRejectedValueOnce(new Error('Failed to fetch'));
    render(<CriarLocalCampo pai={PAI} online onCriado={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Criar local abaixo/ }));
    await user.type(screen.getByLabelText('Nome'), 'Sala 1');
    await user.click(screen.getByRole('button', { name: 'Criar local' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sem conexão com o servidor. Tente de novo.',
    );
  });

  it('Cancelar fecha o formulário', async () => {
    const user = userEvent.setup();
    render(<CriarLocalCampo pai={PAI} online onCriado={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Criar local abaixo/ }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar local abaixo/ })).toBeInTheDocument();
  });
});
