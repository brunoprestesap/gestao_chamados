// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Busca e filtros de `/ativos` (spec 0011, AC-10): ficam na URL, voltam para
 * a página 1 a cada mudança, e "Local" junta prédios e "Sem local".
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => '/ativos',
  useSearchParams: () => nav.params,
}));

import { FiltrosAtivos } from '../FiltrosAtivos';

const PREDIOS = [{ id: 'p1', nome: 'Sede' }];
const CATS = [{ id: 'c1', nome: 'Climatização' }];

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

describe('FiltrosAtivos', () => {
  it('a busca vai para a URL depois de uma pausa na digitação', async () => {
    const user = userEvent.setup();
    render(<FiltrosAtivos predios={PREDIOS} categorias={CATS} />);
    await user.type(screen.getByRole('searchbox', { name: /Buscar ativos/ }), '119');
    expect(nav.replace).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 400));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/ativos?q=119');
  });

  it('o filtro de local oferece "Sem local" e os prédios, e tira a página da URL', async () => {
    nav.params = new URLSearchParams('pagina=3&status=baixado');
    const user = userEvent.setup();
    render(<FiltrosAtivos predios={PREDIOS} categorias={CATS} />);
    await user.click(screen.getByRole('combobox', { name: 'Local' }));
    const opcoes = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opcoes).toEqual(['Local: todos', 'Sem local', 'Sede']);
    await user.click(screen.getByRole('option', { name: 'Sem local' }));
    expect(nav.replace).toHaveBeenCalledWith('/ativos?status=baixado&local=sem');
  });

  it('voltar para "todos" tira o filtro da URL', async () => {
    nav.params = new URLSearchParams('categoria=c1');
    const user = userEvent.setup();
    render(<FiltrosAtivos predios={PREDIOS} categorias={CATS} />);
    await user.click(screen.getByRole('combobox', { name: 'Categoria' }));
    await user.click(await screen.findByRole('option', { name: 'Categoria: todos' }));
    expect(nav.replace).toHaveBeenCalledWith('/ativos');
  });

  it('com filtro ativo, "Limpar filtros" volta para a lista inteira', async () => {
    nav.params = new URLSearchParams('q=x&status=baixado');
    const user = userEvent.setup();
    render(<FiltrosAtivos predios={PREDIOS} categorias={CATS} />);
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(nav.replace).toHaveBeenCalledWith('/ativos');
  });

  it('sem filtro, não mostra "Limpar filtros"', () => {
    render(<FiltrosAtivos predios={PREDIOS} categorias={CATS} />);
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
  });
});
