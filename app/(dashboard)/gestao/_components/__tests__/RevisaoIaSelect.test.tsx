// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RevisaoIaSelect } from '../RevisaoIaSelect';

/**
 * O recorte "Revisão da IA" (spec 0009, AC-1 a AC-3): a tradução entre
 * "Todos" (visual) e `null` (o valor real, sem filtro).
 */

describe('RevisaoIaSelect', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('value null mostra "Todos" selecionado', () => {
    render(<RevisaoIaSelect value={null} onValueChange={vi.fn()} />);
    expect(screen.getByText('Todos')).toBeInTheDocument();
  });

  it('value de um recorte mostra o rótulo dele, não a chave', () => {
    render(<RevisaoIaSelect value="sem_revisao" onValueChange={vi.fn()} />);
    expect(screen.queryByText('sem_revisao')).not.toBeInTheDocument();
  });

  it('escolher um recorte chama onValueChange com a chave do recorte', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<RevisaoIaSelect value={null} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Revisão da IA' }));
    const opcoes = await screen.findAllByRole('option');
    await user.click(opcoes[1]); // a primeira depois de "Todos"

    expect(onValueChange).toHaveBeenCalledOnce();
    const chamado = onValueChange.mock.calls[0][0];
    expect(chamado).not.toBeNull();
    expect(typeof chamado).toBe('string');
  });

  it('escolher "Todos" a partir de um recorte já selecionado chama onValueChange(null)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<RevisaoIaSelect value="sem_revisao" onValueChange={onValueChange} />);

    await user.click(screen.getByRole('combobox', { name: 'Revisão da IA' }));
    await user.click(await screen.findByRole('option', { name: 'Todos' }));

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('lista as quatro opções de recorte além de "Todos"', async () => {
    const user = userEvent.setup();
    render(<RevisaoIaSelect value={null} onValueChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: 'Revisão da IA' }));

    expect(await screen.findAllByRole('option')).toHaveLength(5);
  });
});
