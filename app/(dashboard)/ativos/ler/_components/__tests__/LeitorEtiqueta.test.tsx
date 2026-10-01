// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Leitura de etiqueta (spec 0011, AC-11 e AC-12): o campo de texto recebe o
 * leitor USB (digita e dá Enter); código encontrado vai para a ficha; não
 * encontrado mostra a mensagem e, para a gestão, o atalho de cadastro. Fora
 * de contexto seguro, a câmera some e a tela explica por quê.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('barcode-detector/ponyfill', () => ({
  prepareZXingModule: vi.fn(),
  BarcodeDetector: class {
    detect() {
      return Promise.resolve([]);
    }
  },
}));

import { LeitorEtiqueta } from '../LeitorEtiqueta';

let fetchMock: ReturnType<typeof vi.fn>;
const resposta = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function contextoSeguro(seguro: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: seguro, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: seguro ? { getUserMedia: vi.fn() } : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(() => resposta({ id: 'abc', codigo: '11997' }));
  vi.stubGlobal('fetch', fetchMock);
  contextoSeguro(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('LeitorEtiqueta', () => {
  it('o leitor USB digita e dá Enter: busca o código normalizado e abre a ficha', async () => {
    const user = userEvent.setup();
    render(<LeitorEtiqueta podeCadastrar={false} />);
    await user.type(screen.getByLabelText('Tombamento ou código MNT'), ' 00011997 {Enter}');
    expect(fetchMock).toHaveBeenCalledWith('/api/ativos/por-codigo/11997', { cache: 'no-store' });
    expect(push).toHaveBeenCalledWith('/ativos/abc');
  });

  it('o campo já vem com foco, para o leitor USB funcionar sem clique', () => {
    render(<LeitorEtiqueta podeCadastrar={false} />);
    expect(screen.getByLabelText('Tombamento ou código MNT')).toHaveFocus();
  });

  it('não cadastrado mostra a mensagem e, para a gestão, o atalho com o código normalizado', async () => {
    fetchMock.mockImplementation(() => resposta({ error: 'Ativo não cadastrado' }, 404));
    const user = userEvent.setup();
    render(<LeitorEtiqueta podeCadastrar />);
    await user.type(screen.getByLabelText('Tombamento ou código MNT'), '000123{Enter}');
    expect(await screen.findByText('Ativo não cadastrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cadastrar este ativo/ })).toHaveAttribute(
      'href',
      '/ativos/novo?tombamento=123',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('sem permissão de cadastro, não mostra o atalho', async () => {
    fetchMock.mockImplementation(() => resposta({}, 404));
    const user = userEvent.setup();
    render(<LeitorEtiqueta podeCadastrar={false} />);
    await user.type(screen.getByLabelText('Tombamento ou código MNT'), '123{Enter}');
    await screen.findByText('Ativo não cadastrado');
    expect(screen.queryByRole('link', { name: /Cadastrar este ativo/ })).not.toBeInTheDocument();
  });

  it('código MNT não cadastrado não oferece o atalho (o sistema é que gera MNT)', async () => {
    fetchMock.mockImplementation(() => resposta({}, 404));
    const user = userEvent.setup();
    render(<LeitorEtiqueta podeCadastrar />);
    await user.type(screen.getByLabelText('Tombamento ou código MNT'), 'mnt-9999{Enter}');
    await screen.findByText('Ativo não cadastrado');
    expect(screen.queryByRole('link', { name: /Cadastrar este ativo/ })).not.toBeInTheDocument();
  });

  it('falha de rede mostra erro em vez de travar', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
    const user = userEvent.setup();
    render(<LeitorEtiqueta podeCadastrar />);
    await user.type(screen.getByLabelText('Tombamento ou código MNT'), '1{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
  });

  it('o botão Abrir ficha fica desabilitado com o campo vazio', () => {
    render(<LeitorEtiqueta podeCadastrar />);
    expect(screen.getByRole('button', { name: /Abrir ficha/ })).toBeDisabled();
  });

  it('fora de contexto seguro (HTTP) esconde a câmera e explica que precisa de HTTPS', () => {
    contextoSeguro(false);
    render(<LeitorEtiqueta podeCadastrar />);
    expect(screen.queryByRole('button', { name: /Abrir câmera/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/A câmera só funciona quando o Sigma é aberto por HTTPS/),
    ).toBeInTheDocument();
  });

  it('em contexto seguro oferece a câmera', () => {
    render(<LeitorEtiqueta podeCadastrar />);
    expect(screen.getByRole('button', { name: /Abrir câmera/ })).toBeInTheDocument();
  });

  // Achado da revisão: dois cliques enquanto o navegador pede permissão
  // abriam dois streams, e o primeiro nunca era parado.
  it('clique duplo em "Abrir câmera" pede a câmera uma vez só', async () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => {}));
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    const user = userEvent.setup();
    render(<LeitorEtiqueta podeCadastrar />);
    const botao = screen.getByRole('button', { name: /Abrir câmera/ });
    await user.dblClick(botao);
    await user.click(botao);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /Abrindo câmera/ })).toBeDisabled();
  });
});
