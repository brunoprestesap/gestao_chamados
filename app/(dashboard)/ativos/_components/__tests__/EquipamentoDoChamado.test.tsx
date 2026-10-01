// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EquipamentoDoChamado } from '../EquipamentoDoChamado';

/**
 * A linha "Equipamento" do sheet do chamado (spec 0011, AC-16): sem
 * `onVincular` só mostra; com ele, vincula, troca e remove.
 */

const ATIVO = { id: 'a1', codigo: '11997', descricao: 'Split 12000' };
const ITEM = { id: 'a2', codigo: '11998', descricao: 'Nobreak', categoriaNome: 'Nobreak' };

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items: [ITEM] }))),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('EquipamentoDoChamado', () => {
  it('sem ativo e sem permissão de vincular, não desenha nada', () => {
    const { container } = render(<EquipamentoDoChamado ativo={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('só mostra o equipamento, com link para a ficha, quando não pode vincular', () => {
    render(<EquipamentoDoChamado ativo={ATIVO} />);
    expect(screen.getByRole('link', { name: '11997' })).toHaveAttribute('href', '/ativos/a1');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('vincula um equipamento escolhido na busca', async () => {
    const user = userEvent.setup();
    const onVincular = vi.fn().mockResolvedValue({ ok: true });
    render(<EquipamentoDoChamado ativo={null} onVincular={onVincular} />);
    expect(screen.getByText('Nenhum equipamento vinculado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Vincular/ }));
    await user.type(screen.getByRole('combobox'), '119');
    await user.click(await screen.findByRole('option', { name: /11998/ }));
    expect(onVincular).toHaveBeenCalledWith(ITEM);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('remove o equipamento atual com null', async () => {
    const user = userEvent.setup();
    const onVincular = vi.fn().mockResolvedValue({ ok: true });
    render(<EquipamentoDoChamado ativo={ATIVO} onVincular={onVincular} />);
    await user.click(screen.getByRole('button', { name: /Trocar/ }));
    await user.click(screen.getByRole('button', { name: 'Remover equipamento' }));
    expect(onVincular).toHaveBeenCalledWith(null);
  });

  it('mostra o erro do servidor e continua editando', async () => {
    const user = userEvent.setup();
    const onVincular = vi.fn().mockResolvedValue({ ok: false, error: 'Chamado fechado.' });
    render(<EquipamentoDoChamado ativo={ATIVO} onVincular={onVincular} />);
    await user.click(screen.getByRole('button', { name: /Trocar/ }));
    await user.click(screen.getByRole('button', { name: 'Remover equipamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chamado fechado.');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('cancelar sai da edição sem chamar o servidor', async () => {
    const user = userEvent.setup();
    const onVincular = vi.fn();
    render(<EquipamentoDoChamado ativo={ATIVO} onVincular={onVincular} />);
    await user.click(screen.getByRole('button', { name: /Trocar/ }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onVincular).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Trocar/ })).toBeInTheDocument();
  });
});
