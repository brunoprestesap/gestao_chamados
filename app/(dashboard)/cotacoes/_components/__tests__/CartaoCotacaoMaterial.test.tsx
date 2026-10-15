// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O cartão da cotação de material na tela do técnico (spec 0019, AC-10).
 * Anexar evidência recarrega só o cartão: recarregar a tela inteira desmonta
 * o diálogo de execução no meio do registro.
 *
 * covers: AC-10
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
