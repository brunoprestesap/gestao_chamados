// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Categorias de ativo, tela do Admin (spec 0011, AC-3). */

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const acoes = vi.hoisted(() => ({
  criarCategoriaAtivoAction: vi.fn(),
  editarCategoriaAtivoAction: vi.fn(),
  desativarCategoriaAtivoAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../actions', () => acoes);

import { type CategoriaLinha, GerirCategorias } from '../GerirCategorias';

const CLIMA: CategoriaLinha = {
  id: 'c1',
  chave: 'climatizacao',
  nome: 'Climatização',
  criticidadePadrao: 'media',
  periodicidadePreventivaDias: 90,
  exigeDocumento: ['PMOC'],
  vidaUtilAnos: 10,
  serviceSubTypeId: 's1',
  isActive: true,
  totalAtivos: 37,
};
const VELHA: CategoriaLinha = {
  ...CLIMA,
  id: 'c2',
  chave: 'velha',
  nome: 'Velha',
  isActive: false,
  totalAtivos: 2,
};
const SUBTIPOS = [{ id: 's1', rotulo: 'Ar-Condicionado / Split' }];

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

describe('GerirCategorias', () => {
  it('lista a categoria com preventiva, documentos, subtipo e total de ativos', () => {
    render(<GerirCategorias categorias={[CLIMA]} subtipos={SUBTIPOS} />);
    const linha = screen.getByRole('row', { name: /Climatização/ });
    expect(linha).toHaveTextContent('a cada 90 dias');
    expect(linha).toHaveTextContent('PMOC');
    expect(linha).toHaveTextContent('Ar-Condicionado / Split');
    expect(linha).toHaveTextContent('37');
  });

  it('categoria desativada aparece marcada e sem ações', () => {
    render(<GerirCategorias categorias={[VELHA]} subtipos={SUBTIPOS} />);
    const linha = screen.getByRole('row', { name: /Velha/ });
    expect(within(linha).getByText('Desativada')).toBeInTheDocument();
    expect(within(linha).queryByRole('button')).not.toBeInTheDocument();
  });

  it('criar envia os documentos separados por vírgula e campos vazios como vazio', async () => {
    const user = userEvent.setup();
    acoes.criarCategoriaAtivoAction.mockResolvedValue({ ok: true, id: 'n' });
    render(<GerirCategorias categorias={[]} subtipos={SUBTIPOS} />);
    await user.click(screen.getByRole('button', { name: /Nova categoria/ }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByLabelText('Chave')).not.toHaveAttribute('readonly');
    await user.type(within(d).getByLabelText('Chave'), 'nobreak');
    await user.type(within(d).getByLabelText('Nome'), 'Nobreak');
    await user.type(within(d).getByLabelText('Documentos exigidos'), 'ART, laudo');
    await user.click(within(d).getByRole('button', { name: 'Salvar' }));
    expect(acoes.criarCategoriaAtivoAction).toHaveBeenCalledWith({
      chave: 'nobreak',
      nome: 'Nobreak',
      criticidadePadrao: 'media',
      periodicidadePreventivaDias: '',
      exigeDocumento: ['ART', ' laudo'],
      vidaUtilAnos: '',
      serviceSubTypeId: '',
    });
  });

  it('editar abre com os valores atuais e envia com o id', async () => {
    const user = userEvent.setup();
    acoes.editarCategoriaAtivoAction.mockResolvedValue({ ok: true });
    render(<GerirCategorias categorias={[CLIMA]} subtipos={SUBTIPOS} />);
    await user.click(screen.getByRole('button', { name: 'Editar Climatização' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByLabelText('Preventiva a cada (dias)')).toHaveValue(90);
    expect(within(d).getByLabelText('Chave')).toHaveAttribute('readonly');
    expect(within(d).getByText('A chave não muda depois de criada.')).toBeInTheDocument();
    expect(within(d).getByRole('combobox', { name: /Subtipo/ })).toHaveTextContent(
      'Ar-Condicionado / Split',
    );
    await user.click(within(d).getByRole('button', { name: 'Salvar' }));
    expect(acoes.editarCategoriaAtivoAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c1',
        chave: 'climatizacao',
        serviceSubTypeId: 's1',
        vidaUtilAnos: '10',
      }),
    );
  });

  it('mostra o erro de chave ou nome repetidos no diálogo', async () => {
    const user = userEvent.setup();
    acoes.criarCategoriaAtivoAction.mockResolvedValue({
      ok: false,
      error: 'Já existe uma categoria com essa chave ou esse nome.',
    });
    render(<GerirCategorias categorias={[]} subtipos={SUBTIPOS} />);
    await user.click(screen.getByRole('button', { name: /Nova categoria/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma categoria');
  });

  it('desativar avisa que os ativos continuam', async () => {
    const user = userEvent.setup();
    acoes.desativarCategoriaAtivoAction.mockResolvedValue({ ok: true });
    render(<GerirCategorias categorias={[CLIMA]} subtipos={SUBTIPOS} />);
    await user.click(screen.getByRole('button', { name: 'Desativar Climatização' }));
    expect(acoes.desativarCategoriaAtivoAction).toHaveBeenCalledWith({ id: 'c1' });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Os ativos dela continuam'));
  });
});
