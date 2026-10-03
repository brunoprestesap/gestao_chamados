// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemRevisao } from '@/lib/ativos/importacao/revisao';

/**
 * A revisão da importação do SICAM (spec 0012, AC-22): novos e alterados
 * começam marcados, sumidos desmarcados; novo sem categoria ativa não marca
 * até escolher uma; "marcar todos" por grupo; muitos sumidos pedem uma
 * confirmação a mais; Aplicar manda exatamente o que está marcado.
 *
 * covers: AC-22, AC-24 (seleção enviada), AC-25 (descartar)
 */

const refresh = vi.hoisted(() => vi.fn());
const acoes = vi.hoisted(() => ({
  aplicarImportacaoAction: vi.fn(),
  descartarImportacaoAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../actions', () => acoes);

import { RevisaoImportacao } from '../RevisaoImportacao';

const CATEGORIAS = [
  { id: 'cat-clima', nome: 'Climatização' },
  { id: 'cat-copa', nome: 'Copa: cocção' },
];

const ITENS: ItemRevisao[] = [
  {
    grupo: 'novo',
    codigo: '100',
    descricao: 'SPLIT 9000 BTUS',
    tier: 'A',
    categoriaSugerida: 'climatizacao',
    categoriaSugeridaId: 'cat-clima',
    bloqueio: null,
  },
  {
    grupo: 'novo',
    codigo: '200',
    descricao: 'FORNO ELÉTRICO 40L',
    tier: 'B',
    categoriaSugerida: 'copa_coccao',
    categoriaSugeridaId: null,
    bloqueio: 'Categoria copa_coccao não cadastrada',
  },
  {
    grupo: 'alterado',
    codigo: '300',
    descricao: 'SPLIT SALA 3',
    retornou: false,
    campos: [{ campo: 'setor', rotulo: 'setor', antes: 'SETOR VELHO', depois: 'SETOR NOVO' }],
  },
  {
    grupo: 'alterado',
    codigo: '400',
    descricao: 'SPLIT SALA 4',
    retornou: true,
    campos: [],
  },
  { grupo: 'sumido', codigo: '500', descricao: 'SPLIT SUMIU', local: 'Sede/Sala 5' },
  { grupo: 'sumido', codigo: '600', descricao: 'BEBEDOURO SUMIU', local: 'sem local' },
];

const RESULTADO_OK = {
  ok: true,
  resultado: {
    aplicados: { novos: 1, alterados: 2, sumidos: 0 },
    pulados: { novos: 1, alterados: 0, sumidos: 2 },
    concluida: true,
  },
};

function montar(muitosSumidos = false) {
  render(
    <RevisaoImportacao
      id="imp1"
      itens={ITENS}
      categorias={CATEGORIAS}
      muitosSumidos={muitosSumidos}
    />,
  );
}

const caixa = (codigo: string) => screen.getByRole('checkbox', { name: `Marcar ${codigo}` });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RevisaoImportacao: estado inicial', () => {
  it('novo com categoria e alterados começam marcados; sumidos, desmarcados', () => {
    montar();
    expect(caixa('100')).toBeChecked();
    expect(caixa('300')).toBeChecked();
    expect(caixa('400')).toBeChecked();
    expect(caixa('500')).not.toBeChecked();
    expect(caixa('600')).not.toBeChecked();
  });

  it('novo sem categoria cadastrada chega desmarcado, travado e com o aviso', () => {
    montar();
    expect(caixa('200')).not.toBeChecked();
    expect(caixa('200')).toBeDisabled();
    expect(screen.getByText('Categoria copa_coccao não cadastrada')).toBeInTheDocument();
  });

  it('o seletor de categoria do novo começa pela sugerida', () => {
    montar();
    expect(screen.getByLabelText('Categoria do ativo 100')).toHaveValue('cat-clima');
    expect(screen.getByLabelText('Categoria do ativo 200')).toHaveValue('');
  });

  it('alterado mostra antes e depois; o que voltou mostra "Retornou"', () => {
    montar();
    expect(screen.getByText('SETOR VELHO')).toBeInTheDocument();
    expect(screen.getByText('SETOR NOVO')).toBeInTheDocument();
    expect(screen.getByText('Retornou')).toBeInTheDocument();
    expect(
      screen.getByText('Voltou ao export do SICAM: a marca de ausente sai.'),
    ).toBeInTheDocument();
  });

  it('sumido mostra o local, ou "sem local"', () => {
    montar();
    expect(screen.getByText('Sede/Sala 5')).toBeInTheDocument();
    expect(screen.getByText('sem local')).toBeInTheDocument();
  });

  it('o aviso de muitos sumidos só aparece quando o servidor indica', () => {
    montar(false);
    expect(
      screen.queryByText(/Muitos sumidos: o arquivo pode estar incompleto/),
    ).not.toBeInTheDocument();
  });
});

describe('RevisaoImportacao: seleção', () => {
  it('escolher uma categoria para o novo bloqueado libera e marca a linha', async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(screen.getByLabelText('Categoria do ativo 200'), 'cat-copa');
    expect(caixa('200')).toBeEnabled();
    expect(caixa('200')).toBeChecked();
    expect(screen.queryByText('Categoria copa_coccao não cadastrada')).not.toBeInTheDocument();
  });

  it('"Marcar todos" dos sumidos marca e desmarca o grupo inteiro', async () => {
    const user = userEvent.setup();
    montar();
    const todos = screen.getByRole('checkbox', { name: 'Marcar todos os sumidos' });
    await user.click(todos);
    expect(caixa('500')).toBeChecked();
    expect(caixa('600')).toBeChecked();
    await user.click(todos);
    expect(caixa('500')).not.toBeChecked();
    expect(caixa('600')).not.toBeChecked();
  });

  it('"Marcar todos" dos novos não marca o que está sem categoria', async () => {
    const user = userEvent.setup();
    montar();
    const todos = screen.getByRole('checkbox', { name: 'Marcar todos os novos' });
    await user.click(caixa('100'));
    await user.click(todos);
    expect(caixa('100')).toBeChecked();
    expect(caixa('200')).not.toBeChecked();
  });

  it('a contagem do rodapé acompanha a seleção', async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.getByText(/itens marcados/).closest('p')).toHaveTextContent('3 itens marcados');
    await user.click(caixa('500'));
    expect(screen.getByText(/itens marcados/).closest('p')).toHaveTextContent('4 itens marcados');
  });
});

describe('RevisaoImportacao: aplicar e descartar', () => {
  it('Aplicar manda exatamente o que está marcado, com a categoria de cada novo', async () => {
    const user = userEvent.setup();
    acoes.aplicarImportacaoAction.mockResolvedValueOnce(RESULTADO_OK);
    montar();
    await user.selectOptions(screen.getByLabelText('Categoria do ativo 100'), 'cat-copa');
    await user.click(caixa('400'));
    await user.click(caixa('600'));
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(acoes.aplicarImportacaoAction).toHaveBeenCalledWith({
      id: 'imp1',
      novos: [{ codigo: '100', categoriaId: 'cat-copa' }],
      alterados: ['300'],
      sumidos: ['600'],
      confirmaMuitosSumidos: false,
    });
    expect(toast.success).toHaveBeenCalledWith('Importação aplicada: 3 itens aplicados.');
    expect(refresh).toHaveBeenCalled();
  });

  it('com muitos sumidos e algum marcado, pede confirmação antes de aplicar', async () => {
    const user = userEvent.setup();
    acoes.aplicarImportacaoAction.mockResolvedValueOnce(RESULTADO_OK);
    montar(true);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Muitos sumidos: o arquivo pode estar incompleto.',
    );

    await user.click(caixa('500'));
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(acoes.aplicarImportacaoAction).not.toHaveBeenCalled();

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Marcar 1 como ausentes?');
    await user.click(screen.getByRole('button', { name: 'Conferi, aplicar' }));
    expect(acoes.aplicarImportacaoAction).toHaveBeenCalledWith(
      expect.objectContaining({ sumidos: ['500'], confirmaMuitosSumidos: true }),
    );
  });

  it('com muitos sumidos mas nenhum marcado, aplica direto', async () => {
    const user = userEvent.setup();
    acoes.aplicarImportacaoAction.mockResolvedValueOnce(RESULTADO_OK);
    montar(true);
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(acoes.aplicarImportacaoAction).toHaveBeenCalledWith(
      expect.objectContaining({ sumidos: [], confirmaMuitosSumidos: false }),
    );
  });

  it('se a aplicação parou no meio, avisa para aplicar de novo', async () => {
    const user = userEvent.setup();
    acoes.aplicarImportacaoAction.mockResolvedValueOnce({
      ok: true,
      resultado: { ...RESULTADO_OK.resultado, concluida: false },
    });
    montar();
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(toast.warning).toHaveBeenCalledWith(
      'Parte dos itens ficou para trás. Clique em Aplicar de novo para terminar.',
    );
  });

  it('a recusa do servidor vira toast de erro e a página não atualiza', async () => {
    const user = userEvent.setup();
    acoes.aplicarImportacaoAction.mockResolvedValueOnce({
      ok: false,
      error: 'Esta importação não está mais pendente.',
    });
    montar();
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(toast.error).toHaveBeenCalledWith('Esta importação não está mais pendente.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('Descartar pede confirmação e só então descarta', async () => {
    const user = userEvent.setup();
    acoes.descartarImportacaoAction.mockResolvedValueOnce({ ok: true });
    montar();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(acoes.descartarImportacaoAction).not.toHaveBeenCalled();

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Descartar esta importação?');
    const botoes = screen.getAllByRole('button', { name: 'Descartar' });
    await user.click(botoes[botoes.length - 1]);
    expect(acoes.descartarImportacaoAction).toHaveBeenCalledWith({ id: 'imp1' });
    expect(toast.success).toHaveBeenCalledWith('Importação descartada.');
  });
});
