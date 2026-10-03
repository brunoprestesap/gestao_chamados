// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Envio do export do SICAM (spec 0012, AC-17 e AC-21): arquivo acima de 10 MB
 * é recusado antes de subir; o erro do servidor aparece ligado ao campo; com
 * uma importação pendente, a tela diz de quando e de quem e só troca com a
 * confirmação; deu certo, vai para a revisão.
 *
 * covers: AC-17, AC-21
 */

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { EnviarImportacao } from '../EnviarImportacao';

const fetchMock = vi.fn();

function resposta(status: number, corpo: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

function arquivo(bytes = 10, nome = 'SICAM.CSV') {
  const f = new File(['x'], nome, { type: 'text/csv' });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

async function escolherEEnviar(user: ReturnType<typeof userEvent.setup>, f: File) {
  await user.upload(screen.getByLabelText(/Arquivo do SICAM/), f);
  await user.click(screen.getByRole('button', { name: 'Enviar e revisar' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EnviarImportacao', () => {
  it('sem arquivo, o botão fica desabilitado', () => {
    render(<EnviarImportacao />);
    expect(screen.getByRole('button', { name: 'Enviar e revisar' })).toBeDisabled();
  });

  it('mostra o nome do arquivo escolhido', async () => {
    const user = userEvent.setup();
    render(<EnviarImportacao />);
    await user.upload(screen.getByLabelText(/Arquivo do SICAM/), arquivo(2048, 'export.csv'));
    expect(screen.getByText('export.csv')).toBeInTheDocument();
  });

  it('arquivo acima de 10 MB é recusado sem subir nada', async () => {
    const user = userEvent.setup();
    render(<EnviarImportacao />);
    await escolherEEnviar(user, arquivo(10 * 1024 * 1024 + 1));
    expect(screen.getByRole('alert')).toHaveTextContent('Arquivo maior que 10 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deu certo: sobe o arquivo e vai para a revisão', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(resposta(201, { id: 'imp1' }));
    render(<EnviarImportacao />);
    await escolherEEnviar(user, arquivo());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ativos/importacoes');
    expect((init.body as FormData).get('arquivo')).toBeInstanceOf(File);
    expect((init.body as FormData).get('substituirPendente')).toBeNull();
    expect(push).toHaveBeenCalledWith('/ativos/importar/imp1');
  });

  it('o erro do servidor (cabeçalho inválido) aparece ligado ao campo', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      resposta(400, { error: 'O arquivo não parece um export do SICAM: falta a coluna Saída' }),
    );
    render(<EnviarImportacao />);
    await escolherEEnviar(user, arquivo());

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('falta a coluna Saída');
    expect(screen.getByLabelText(/Arquivo do SICAM/)).toHaveAttribute(
      'aria-describedby',
      alerta.id,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('413 sem corpo legível ainda diz que passou de 10 MB', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => {
        throw new Error('html');
      },
    } as unknown as Response);
    render(<EnviarImportacao />);
    await escolherEEnviar(user, arquivo());
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo maior que 10 MB');
  });

  it('sem conexão, pede para tentar de novo', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<EnviarImportacao />);
    await escolherEEnviar(user, arquivo());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sem conexão com o servidor. Tente de novo.',
    );
  });

  it('com pendente, mostra de quando e de quem, e só troca ao confirmar', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        resposta(409, {
          pendente: {
            id: 'antiga',
            criadaEm: '2026-10-01T13:00:00.000Z',
            autorNome: 'Admin Fictício',
          },
        }),
      )
      .mockResolvedValueOnce(resposta(201, { id: 'nova' }));
    render(<EnviarImportacao />);
    await escolherEEnviar(user, arquivo());

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent(
      /Existe uma importação pendente de 01\/10\/2026.*enviada por Admin Fictício/,
    );
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Descartar a pendente e continuar' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1].body as FormData).get('substituirPendente')).toBe('true');
    expect(push).toHaveBeenCalledWith('/ativos/importar/nova');
  });

  it('com pendente, "Ver a pendente" leva até ela sem enviar de novo', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      resposta(409, {
        pendente: { id: 'antiga', criadaEm: '2026-10-01T13:00:00.000Z', autorNome: 'Admin' },
      }),
    );
    render(<EnviarImportacao />);
    await escolherEEnviar(user, arquivo());
    await user.click(await screen.findByRole('button', { name: 'Ver a pendente' }));
    expect(push).toHaveBeenCalledWith('/ativos/importar/antiga');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
