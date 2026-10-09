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
  limiteCorretivos12m: null,
  limiteReincidencia90d: null,
  limiteCustoPercentual12m: null,
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

const TIPOS_DOCUMENTO = [
  { chave: 'pmoc', nome: 'PMOC', isActive: true },
  { chave: 'art', nome: 'ART', isActive: true },
  { chave: 'laudo_spda', nome: 'Laudo de SPDA', isActive: true },
  { chave: 'garantia', nome: 'Garantia', isActive: false },
];

describe('GerirCategorias', () => {
  it('valor antigo sem tipo leva o selo "não reconhecido" (spec 0013, AC-2)', () => {
    render(
      <GerirCategorias
        categorias={[{ ...CLIMA, exigeDocumento: ['pmoc', 'Laudo velho', 'garantia'] }]}
        subtipos={SUBTIPOS}
        tiposDocumento={TIPOS_DOCUMENTO}
      />,
    );
    const linha = screen.getByRole('row', { name: /Climatização/ });
    expect(linha).toHaveTextContent('PMOC');
    expect(within(linha).getByText('não reconhecido')).toBeInTheDocument();
    expect(within(linha).getByText('desativado')).toBeInTheDocument();
  });

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

  it('criar envia as chaves dos tipos marcados e campos vazios como vazio', async () => {
    const user = userEvent.setup();
    acoes.criarCategoriaAtivoAction.mockResolvedValue({ ok: true, id: 'n' });
    render(
      <GerirCategorias categorias={[]} subtipos={SUBTIPOS} tiposDocumento={TIPOS_DOCUMENTO} />,
    );
    await user.click(screen.getByRole('button', { name: /Nova categoria/ }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByLabelText('Chave')).not.toHaveAttribute('readonly');
    await user.type(within(d).getByLabelText('Chave'), 'nobreak');
    await user.type(within(d).getByLabelText('Nome'), 'Nobreak');
    await user.click(within(d).getByRole('checkbox', { name: 'ART' }));
    await user.click(within(d).getByRole('checkbox', { name: 'Laudo de SPDA' }));
    // Tipo desativado não aparece para marcar.
    expect(within(d).queryByRole('checkbox', { name: 'Garantia' })).not.toBeInTheDocument();
    await user.click(within(d).getByRole('button', { name: 'Salvar' }));
    expect(acoes.criarCategoriaAtivoAction).toHaveBeenCalledWith({
      chave: 'nobreak',
      nome: 'Nobreak',
      criticidadePadrao: 'media',
      periodicidadePreventivaDias: '',
      exigeDocumento: ['art', 'laudo_spda'],
      vidaUtilAnos: '',
      limiteCorretivos12m: '',
      limiteReincidencia90d: '',
      limiteCustoPercentual12m: '',
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

/**
 * Os limites dos candidatos à substituição (spec 0015): o padrão aparece como
 * dica no campo vazio, o valor gravado volta no formulário e a lista mostra
 * "padrão" quando a categoria não tem limite próprio.
 *
 * covers: AC-6
 */
describe('GerirCategorias: limites de substituição', () => {
  it('a lista mostra a vida útil e os limites, com "padrão" quando vazios', () => {
    render(
      <GerirCategorias
        categorias={[
          CLIMA,
          { ...VELHA, isActive: true, limiteCorretivos12m: 2, vidaUtilAnos: null },
        ]}
        subtipos={SUBTIPOS}
      />,
    );
    const linhaClima = screen.getByRole('row', { name: /Climatização/ });
    expect(within(linhaClima).getByText('vida útil 10 anos')).toBeInTheDocument();
    expect(
      within(linhaClima).getByText(/padrão em 12 meses · padrão em\s*90 dias/),
    ).toBeInTheDocument();
    const linhaVelha = screen.getByRole('row', { name: /Velha/ });
    expect(within(linhaVelha).getByText('sem vida útil')).toBeInTheDocument();
    expect(within(linhaVelha).getByText(/2 em 12 meses · padrão em\s*90 dias/)).toBeInTheDocument();
  });

  it('os campos vazios mostram o padrão como dica e ficam ligados à explicação', async () => {
    const user = userEvent.setup();
    render(<GerirCategorias categorias={[CLIMA]} subtipos={SUBTIPOS} />);
    await user.click(screen.getByRole('button', { name: 'Editar Climatização' }));
    const d = screen.getByRole('dialog');
    const corretivos = within(d).getByLabelText('Corretivos em 12 meses para sinalizar');
    const reincidencia = within(d).getByLabelText('Corretivos em 90 dias para sinalizar');
    expect(corretivos).toHaveValue(null);
    expect(corretivos).toHaveAttribute('placeholder', 'padrão: 4');
    expect(reincidencia).toHaveAttribute('placeholder', 'padrão: 3');
    expect(corretivos).toHaveAccessibleDescription(/Vazio usa o padrão/);
  });

  it('editar abre com os limites gravados e envia o que foi digitado', async () => {
    const user = userEvent.setup();
    acoes.editarCategoriaAtivoAction.mockResolvedValue({ ok: true });
    render(
      <GerirCategorias
        categorias={[{ ...CLIMA, limiteCorretivos12m: 6, limiteReincidencia90d: 2 }]}
        subtipos={SUBTIPOS}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Editar Climatização' }));
    const d = screen.getByRole('dialog');
    const corretivos = within(d).getByLabelText('Corretivos em 12 meses para sinalizar');
    expect(corretivos).toHaveValue(6);
    await user.clear(corretivos);
    await user.type(corretivos, '8');
    await user.clear(within(d).getByLabelText('Corretivos em 90 dias para sinalizar'));
    await user.click(within(d).getByRole('button', { name: 'Salvar' }));
    expect(acoes.editarCategoriaAtivoAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', limiteCorretivos12m: '8', limiteReincidencia90d: '' }),
    );
  });

  it('o erro de limite inválido do servidor aparece no diálogo', async () => {
    const user = userEvent.setup();
    acoes.editarCategoriaAtivoAction.mockResolvedValue({
      ok: false,
      error: 'Limite de corretivos inválido.',
    });
    render(<GerirCategorias categorias={[CLIMA]} subtipos={SUBTIPOS} />);
    await user.click(screen.getByRole('button', { name: 'Editar Climatização' }));
    await user.type(screen.getByLabelText('Corretivos em 12 meses para sinalizar'), '0');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Limite de corretivos inválido.');
  });
});
