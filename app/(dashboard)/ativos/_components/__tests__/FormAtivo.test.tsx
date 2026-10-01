// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cadastro e edição do ativo (spec 0011, AC-4 a AC-6): a origem decide se há
 * tombamento; na edição, código, origem e tombamento não aparecem para editar.
 */

const push = vi.hoisted(() => vi.fn());
const acoes = vi.hoisted(() => ({ criarAtivoAction: vi.fn(), editarAtivoAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('../../actions', () => acoes);

import { FormAtivo, type ValoresAtivo } from '../FormAtivo';

const CATS = [{ id: 'c1', nome: 'Climatização', criticidadePadrao: 'media' as const }];
const LOCAIS = [{ id: 'l1', caminho: 'Sede/3º andar' }];
const VAZIO: ValoresAtivo = {
  origemCodigo: 'patrimonio',
  tombamento: '',
  descricao: '',
  categoriaId: '',
  localizacaoId: '',
  tierManutencao: '',
  fabricante: '',
  modelo: '',
  numeroSerie: '',
  dataInstalacao: '',
  criticidade: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

async function selecionar(user: ReturnType<typeof userEvent.setup>, rotulo: RegExp, opcao: string) {
  await user.click(screen.getByRole('combobox', { name: rotulo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

describe('FormAtivo · cadastro', () => {
  it('patrimoniado mostra o tombamento; interno esconde', async () => {
    const user = userEvent.setup();
    render(<FormAtivo modo="novo" inicial={VAZIO} categorias={CATS} locais={LOCAIS} />);
    expect(screen.getByLabelText(/Tombamento/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Interno/ }));
    expect(screen.getByRole('radio', { name: /Interno/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText(/Tombamento/)).not.toBeInTheDocument();
  });

  it('vem com o tombamento do atalho de leitura já preenchido', () => {
    render(
      <FormAtivo
        modo="novo"
        inicial={{ ...VAZIO, tombamento: '123' }}
        categorias={CATS}
        locais={LOCAIS}
      />,
    );
    expect(screen.getByLabelText(/Tombamento/)).toHaveValue('123');
  });

  it('avisa a criticidade da categoria e envia sem criticidade quando a pessoa não escolhe', async () => {
    const user = userEvent.setup();
    acoes.criarAtivoAction.mockResolvedValue({ ok: true, id: 'novo', codigo: '123' });
    render(
      <FormAtivo
        modo="novo"
        inicial={{ ...VAZIO, tombamento: '123' }}
        categorias={CATS}
        locais={LOCAIS}
      />,
    );
    await user.type(screen.getByLabelText(/Descrição/), 'Split');
    await selecionar(user, /Categoria/, 'Climatização');
    expect(screen.getByText(/Sem escolha, vale a da categoria: média/)).toBeInTheDocument();
    await selecionar(user, /Tier de manutenção/, 'Tier A');
    await user.click(screen.getByRole('button', { name: /Cadastrar ativo/ }));
    expect(acoes.criarAtivoAction).toHaveBeenCalledWith(
      expect.objectContaining({
        origemCodigo: 'patrimonio',
        tombamento: '123',
        categoriaId: 'c1',
        tierManutencao: 'A',
        criticidade: '',
        localizacaoId: '',
      }),
    );
    expect(push).toHaveBeenCalledWith('/ativos/novo');
  });

  it('interno não envia tombamento', async () => {
    const user = userEvent.setup();
    acoes.criarAtivoAction.mockResolvedValue({ ok: false, error: 'x' });
    render(
      <FormAtivo
        modo="novo"
        inicial={{ ...VAZIO, tombamento: '999' }}
        categorias={CATS}
        locais={LOCAIS}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Interno/ }));
    await user.click(screen.getByRole('button', { name: /Cadastrar ativo/ }));
    expect(acoes.criarAtivoAction.mock.calls[0][0].tombamento).toBeUndefined();
  });

  it('mostra o erro do servidor, como o código repetido (AC-5)', async () => {
    const user = userEvent.setup();
    acoes.criarAtivoAction.mockResolvedValue({
      ok: false,
      error: 'Já existe um ativo com o código 123',
    });
    render(
      <FormAtivo
        modo="novo"
        inicial={{ ...VAZIO, tombamento: '123' }}
        categorias={CATS}
        locais={LOCAIS}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Cadastrar ativo/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um ativo com o código 123',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('sem locais, explica onde cadastrar a árvore', () => {
    render(<FormAtivo modo="novo" inicial={VAZIO} categorias={CATS} locais={[]} />);
    expect(screen.getByText(/Ainda não há locais/)).toBeInTheDocument();
  });
});

describe('FormAtivo · edição (AC-6)', () => {
  const atual: ValoresAtivo = {
    ...VAZIO,
    tombamento: '11997',
    descricao: 'Split',
    categoriaId: 'c1',
    localizacaoId: 'l1',
    tierManutencao: 'A',
    criticidade: 'alta',
  };

  it('mostra o código só para leitura, sem campo de tombamento nem de origem', () => {
    render(
      <FormAtivo
        modo="editar"
        ativoId="a1"
        codigo="11997"
        inicial={atual}
        categorias={CATS}
        locais={LOCAIS}
      />,
    );
    expect(screen.getByText('11997')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tombamento/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('salva com id e criticidade, e volta para a ficha', async () => {
    const user = userEvent.setup();
    acoes.editarAtivoAction.mockResolvedValue({ ok: true });
    render(
      <FormAtivo
        modo="editar"
        ativoId="a1"
        codigo="11997"
        inicial={atual}
        categorias={CATS}
        locais={LOCAIS}
      />,
    );
    await user.type(screen.getByLabelText('Fabricante'), 'Marca X');
    await user.click(screen.getByRole('button', { name: /Salvar alterações/ }));
    expect(acoes.editarAtivoAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'a1',
        criticidade: 'alta',
        fabricante: 'Marca X',
        localizacaoId: 'l1',
      }),
    );
    expect(push).toHaveBeenCalledWith('/ativos/a1');
  });
});
