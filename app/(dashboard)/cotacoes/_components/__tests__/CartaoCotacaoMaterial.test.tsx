// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O cartão da cotação de material no chamado. Spec 0019, AC-10: anexar
 * evidência recarrega só o cartão, porque recarregar a tela inteira desmonta
 * o diálogo de execução no meio do registro. Spec 0021, AC-16: a versão sai de
 * `cotacao.visao`, e cada uma mostra só o que o servidor mandou.
 *
 * covers: AC-10 (0019), AC-16 (0021)
 */

vi.mock('../../actions', () => ({
  executarAction: vi.fn(),
  removerArquivoAction: vi.fn(),
  criarCotacaoAction: vi.fn(),
  salvarRascunhoAction: vi.fn(),
}));
const enviarArquivo = vi.hoisted(() => vi.fn());
vi.mock('../apoio', async (original) => ({
  ...(await original<typeof import('../apoio')>()),
  enviarArquivo,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CartaoCotacaoMaterial } from '../CartaoCotacaoMaterial';

const cartao = {
  podeCriar: false,
  acoes: {
    editarDiagnostico: false,
    montar: false,
    enviar: false,
    assumir: false,
    devolver: false,
    reprovar: false,
    encaminhar: false,
    aprovar: false,
    alterar: false,
    cancelar: false,
    executar: true,
  },
  cotacao: {
    id: 'c1',
    numero: 'COT-2026-0001',
    chamadoId: 'ch1',
    situacao: 'autorizada',
    emTramite: true,
    versao: 3,
    visao: 'tecnico',
    criadaEm: '2026-10-15T12:00:00Z',
    atualizadaEm: '2026-10-15T12:00:00Z',
    ultimoMotivo: null,
    itens: [
      {
        id: 'i1',
        descricao: 'Disjuntor',
        unidade: 'un',
        quantidade: 2,
        motivo: 'Troca',
        doDiagnostico: true,
        precoAplicadoCentavos: 1000,
        quantidadeExecutada: null,
        valorExecutadoCentavos: null,
      },
    ],
    arquivos: [],
  },
};

describe('CartaoCotacaoMaterial · evidência no diálogo de execução', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => cartao });
    vi.stubGlobal('fetch', fetchMock);
    enviarArquivo.mockResolvedValue({ ok: true, arquivoId: 'a1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('anexar evidência recarrega só o cartão e o diálogo continua aberto', async () => {
    // Arrange
    const onAlterado = vi.fn();
    render(<CartaoCotacaoMaterial chamadoId="ch1" onAlterado={onAlterado} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar execução' }));
    const input = document.getElementById('evid-arquivo') as HTMLInputElement;

    // Act
    fireEvent.change(input, {
      target: { files: [new File(['%PDF-1.4'], 'evid.pdf', { type: 'application/pdf' })] },
    });

    // Assert
    await waitFor(() => expect(enviarArquivo).toHaveBeenCalledOnce());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(onAlterado).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('CartaoCotacaoMaterial · versão por visão (spec 0021, AC-16)', () => {
  const fetchMock = vi.fn();
  const responder = (c: unknown) => fetchMock.mockResolvedValue({ ok: true, json: async () => c });

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const item = (n: number) => ({ ...cartao.cotacao.itens[0], id: `i${n}`, descricao: `Peça ${n}` });

  it('técnico: jornada, a próxima ação e a lista resumida de itens', async () => {
    // Arrange
    responder({
      ...cartao,
      cotacao: { ...cartao.cotacao, itens: [1, 2, 3, 4, 5].map(item), trilha: [] },
    });

    // Act
    render(<CartaoCotacaoMaterial chamadoId="ch1" />);

    // Assert
    expect(await screen.findByText('Aplicar o material')).toBeInTheDocument();
    expect(screen.getByText('Peça 1')).toBeInTheDocument();
    expect(screen.queryByText('Peça 4')).not.toBeInTheDocument();
    expect(screen.getByText('+2 itens')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it('TRF1: itens, valor e quem age agora com o nome do fiscal', async () => {
    // Arrange
    responder({
      podeCriar: false,
      acoes: { ...cartao.acoes, executar: false },
      cotacao: {
        ...cartao.cotacao,
        visao: 'trf1',
        situacao: 'em_analise',
        valorTotalCentavos: 1231540,
        quemAgeAgora: { papel: 'fiscal', nome: 'Ana Ribeiro' },
      },
    });

    // Act
    render(<CartaoCotacaoMaterial chamadoId="ch1" />);

    // Assert
    expect(await screen.findByText(/R\$\s*12\.315,40/)).toBeInTheDocument();
    expect(screen.getByText('Agora é a vez de: Fiscal (Ana Ribeiro).')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir cotação' })).toHaveAttribute(
      'href',
      '/cotacoes/c1',
    );
  });

  it('contratada: a próxima ação dela leva ao detalhe, e quem age vem só pelo papel', async () => {
    // Arrange
    responder({
      podeCriar: false,
      acoes: { ...cartao.acoes, executar: false, montar: true },
      cotacao: {
        ...cartao.cotacao,
        visao: 'contratada',
        situacao: 'devolvida',
        valorTotalCentavos: 5000,
        ultimoMotivo: 'Falta o orçamento da terceira empresa',
        quemAgeAgora: { papel: 'responsavel_tecnico', nome: null },
      },
    });

    // Act
    render(<CartaoCotacaoMaterial chamadoId="ch1" />);

    // Assert
    expect(await screen.findByRole('link', { name: /Ir para a montagem/ })).toHaveAttribute(
      'href',
      '/cotacoes/c1',
    );
    expect(screen.getByText('Agora é a vez de: Responsável técnico.')).toBeInTheDocument();
    expect(screen.getByText(/Falta o orçamento da terceira empresa/)).toBeInTheDocument();
  });

  it.each([
    ['pedido', 'Aguardando material', 'Pedido'],
    ['aprovacao', 'Aguardando material', 'Aprovação'],
    ['instalacao', 'Material aplicado', 'Instalação'],
  ])(
    'solicitante na fase %s: frase e a barra de três fases, sem valor',
    async (fase, titulo, atual) => {
      // Arrange
      responder({
        podeCriar: false,
        acoes: null,
        // O que o servidor manda ao solicitante: só a fase (AC-24).
        cotacao: { id: 'c1', visao: 'solicitante', fase },
      });

      // Act
      render(<CartaoCotacaoMaterial chamadoId="ch1" />);

      // Assert
      expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
      const fases = screen.getByRole('list', { name: 'Fases da compra de material' });
      expect(fases.querySelector('[aria-current="step"]')).toHaveTextContent(atual);
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    },
  );

  it('solicitante com a compra encerrada: só a frase, sem a barra', async () => {
    // Arrange
    responder({
      podeCriar: false,
      acoes: null,
      cotacao: { id: 'c1', visao: 'solicitante', fase: 'encerrada' },
    });

    // Act
    render(<CartaoCotacaoMaterial chamadoId="ch1" />);

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Compra de material encerrada' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
