// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Gerar PDF" (spec 0016): pede ao servidor só o contrato e o mês, fica
 * desabilitado com "Gerando…", baixa com o nome do `Content-Disposition`,
 * atualiza a lista de emissões e mostra o toast certo em cada falha.
 *
 * covers: AC-16, AC-18, AC-19
 */

const refresh = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast }));

import { BotaoGerarPdf } from '../BotaoGerarPdf';

const ID = 'a'.repeat(24);
const fetchMock = vi.fn();
let baixados: string[] = [];

function respostaPdf() {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'Content-Disposition': 'attachment; filename="relatorio-contrato-12-2025-2026-09.pdf"',
    }),
    blob: async () => new Blob(['%PDF']),
  } as unknown as Response;
}

function respostaErro(status: number, corpo: unknown) {
  return {
    ok: false,
    status,
    headers: new Headers(),
    json: async () => corpo,
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  baixados = [];
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    baixados.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BotaoGerarPdf', () => {
  it('manda só contrato e mês, baixa com o nome do servidor e atualiza a lista (AC-16, AC-19)', async () => {
    fetchMock.mockResolvedValueOnce(respostaPdf());
    const user = userEvent.setup();
    render(<BotaoGerarPdf contratoId={ID} mes="2026-09" />);

    await user.click(screen.getByRole('button', { name: 'Gerar PDF' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/relatorios/contrato/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoId: ID, mes: '2026-09' }),
    });
    expect(baixados).toEqual(['relatorio-contrato-12-2025-2026-09.pdf']);
    expect(toast.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('fica desabilitado com "Gerando…" enquanto o servidor monta o PDF', async () => {
    let terminar!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((ok) => (terminar = ok)));
    const user = userEvent.setup();
    render(<BotaoGerarPdf contratoId={ID} mes="2026-09" />);

    await user.click(screen.getByRole('button', { name: 'Gerar PDF' }));

    expect(screen.getByRole('button', { name: 'Gerando…' })).toBeDisabled();
    terminar(respostaPdf());
    expect(await screen.findByRole('button', { name: 'Gerar PDF' })).toBeEnabled();
  });

  it('429 mostra a mensagem do servidor e não baixa nada (AC-16)', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaErro(429, { error: 'Outro relatório está sendo gerado. Tente em alguns segundos.' }),
    );
    const user = userEvent.setup();
    render(<BotaoGerarPdf contratoId={ID} mes="2026-09" />);

    await user.click(screen.getByRole('button', { name: 'Gerar PDF' }));

    expect(toast.error).toHaveBeenCalledWith(
      'Outro relatório está sendo gerado. Tente em alguns segundos.',
    );
    expect(baixados).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('500 mostra o texto fixo, mesmo que o servidor mande outro (AC-18)', async () => {
    fetchMock.mockResolvedValueOnce(respostaErro(500, { error: 'detalhe interno' }));
    const user = userEvent.setup();
    render(<BotaoGerarPdf contratoId={ID} mes="2026-09" />);

    await user.click(screen.getByRole('button', { name: 'Gerar PDF' }));

    expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o PDF. Tente de novo.');
  });

  it('queda de rede também mostra o texto fixo e libera o botão (AC-18)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<BotaoGerarPdf contratoId={ID} mes="2026-09" />);

    await user.click(screen.getByRole('button', { name: 'Gerar PDF' }));

    expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o PDF. Tente de novo.');
    expect(screen.getByRole('button', { name: 'Gerar PDF' })).toBeEnabled();
  });
});
