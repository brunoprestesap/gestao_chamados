// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A árvore de locais (spec 0011, AC-1 e AC-2): só prédio na raiz; abaixo de
 * um nó, os outros tipos; ao mover, o próprio nó e a subárvore dele não
 * aparecem como destino.
 */

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const acoes = vi.hoisted(() => ({
  criarLocalizacaoAction: vi.fn(),
  editarLocalizacaoAction: vi.fn(),
  desativarLocalizacaoAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../../actions', () => acoes);

import type { NoArvore } from '@/lib/ativos/localizacao';

import { GerirLocalizacoes } from '../GerirLocalizacoes';

const no = (
  id: string,
  nome: string,
  tipo: NoArvore['tipo'],
  parentId: string | null,
  caminho: string,
): NoArvore => ({
  id,
  nome,
  tipo,
  parentId,
  caminho,
  unitId: null,
});
const NOS = [
  no('p1', 'Sede', 'predio', null, 'Sede'),
  no('a1', '3º andar', 'andar', 'p1', 'Sede/3º andar'),
  no('s1', 'Sala 302', 'sala', 'a1', 'Sede/3º andar/Sala 302'),
  no('p2', 'Anexo', 'predio', null, 'Anexo'),
];

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

describe('GerirLocalizacoes', () => {
  it('sem locais, mostra o estado vazio pedindo o prédio', () => {
    render(<GerirLocalizacoes nos={[]} unidades={[]} />);
    expect(screen.getByText('Comece pelo prédio')).toBeInTheDocument();
  });

  it('novo prédio só oferece o tipo Prédio e envia sem pai', async () => {
    const user = userEvent.setup();
    acoes.criarLocalizacaoAction.mockResolvedValue({ ok: true, id: 'x' });
    render(<GerirLocalizacoes nos={NOS} unidades={[]} />);
    await user.click(screen.getByRole('button', { name: /Novo prédio/ }));
    const d = screen.getByRole('dialog');
    await user.click(within(d).getByRole('combobox', { name: 'Tipo' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Prédio']);
    await user.keyboard('{Escape}');
    await user.type(within(d).getByLabelText('Nome'), 'Fórum');
    await user.click(within(d).getByRole('button', { name: 'Salvar' }));
    expect(acoes.criarLocalizacaoAction).toHaveBeenCalledWith({
      nome: 'Fórum',
      tipo: 'predio',
      parentId: '',
      unitId: '',
    });
  });

  it('abaixo de um prédio, não oferece Prédio e sugere Andar', async () => {
    const user = userEvent.setup();
    render(<GerirLocalizacoes nos={NOS} unidades={[]} />);
    await user.click(screen.getByRole('button', { name: 'Adicionar local abaixo de Sede' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Andar');
    await user.click(within(d).getByRole('combobox', { name: 'Tipo' }));
    const tipos = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(tipos).not.toContain('Prédio');
    expect(tipos).toEqual(expect.arrayContaining(['Andar', 'Sala', 'Área técnica']));
  });

  it('ao mover um andar, ele e as salas dele não aparecem como destino (AC-2)', async () => {
    const user = userEvent.setup();
    render(<GerirLocalizacoes nos={NOS} unidades={[]} />);
    await user.click(screen.getByRole('button', { name: 'Editar 3º andar' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Fica dentro de' }),
    );
    const destinos = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(destinos).toEqual(['Sede', 'Anexo']);
  });

  it('editar prédio não oferece mudar o pai', async () => {
    const user = userEvent.setup();
    render(<GerirLocalizacoes nos={NOS} unidades={[]} />);
    await user.click(screen.getByRole('button', { name: 'Editar Sede' }));
    expect(
      within(screen.getByRole('dialog')).queryByText('Fica dentro de'),
    ).not.toBeInTheDocument();
  });

  it('mostra o erro do servidor no diálogo, como o nome repetido', async () => {
    const user = userEvent.setup();
    acoes.criarLocalizacaoAction.mockResolvedValue({
      ok: false,
      error: 'Já existe um local com esse nome aqui.',
    });
    render(<GerirLocalizacoes nos={NOS} unidades={[]} />);
    await user.click(screen.getByRole('button', { name: /Novo prédio/ }));
    await user.type(screen.getByLabelText('Nome'), 'SEDE');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um local com esse nome aqui.',
    );
  });

  it('Salvar fica desabilitado com nome vazio', async () => {
    const user = userEvent.setup();
    render(<GerirLocalizacoes nos={NOS} unidades={[]} />);
    await user.click(screen.getByRole('button', { name: /Novo prédio/ }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('desativar com filho mostra o motivo da recusa', async () => {
    const user = userEvent.setup();
    acoes.desativarLocalizacaoAction.mockResolvedValue({ ok: false, error: 'tem filhos' });
    render(<GerirLocalizacoes nos={NOS} unidades={[]} />);
    await user.click(screen.getByRole('button', { name: 'Desativar Sede' }));
    expect(acoes.desativarLocalizacaoAction).toHaveBeenCalledWith({ id: 'p1' });
    expect(toast.error).toHaveBeenCalledWith('tem filhos');
  });
});
