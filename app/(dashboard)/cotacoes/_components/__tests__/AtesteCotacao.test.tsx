// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O ateste na tela da cotação (spec 0019, fatia 2): o selo de prazo, os
 * botões de cada papel e a nota fiscal, que passa por uma conferência antes
 * de gravar porque não se troca depois.
 *
 * covers: AC-21, AC-22
 */

const m = vi.hoisted(() => ({
  registrarRecebimentoAction: vi.fn(),
  registrarNotaFiscalAction: vi.fn(),
  enviarArquivo: vi.fn(),
}));
vi.mock('../../actions', () => ({
  registrarRecebimentoAction: m.registrarRecebimentoAction,
  registrarNotaFiscalAction: m.registrarNotaFiscalAction,
}));
vi.mock('../apoio', async (original) => ({
  ...(await original<typeof import('../apoio')>()),
  enviarArquivo: m.enviarArquivo,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { Acoes } from '@/lib/material/leitura';
import type { CotacaoDTO } from '@/lib/material/serializar';

import { AtesteCotacao } from '../AtesteCotacao';

const semAcao: Acoes = {
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
  executar: false,
  receberProvisorio: false,
  receberDefinitivo: false,
  registrarNotaFiscal: false,
  gerarPdf: false,
};

const base: CotacaoDTO = {
  id: 'c1',
  numero: 'COT-2026-0001',
  chamadoId: 'ch1',
  situacao: 'executada',
  emTramite: false,
  versao: 7,
  visao: 'trf1',
  criadaEm: '2026-10-10T12:00:00Z',
  atualizadaEm: '2026-10-10T12:00:00Z',
  ultimoMotivo: null,
  recebimentoProvisorio: null,
  recebimentoDefinitivo: null,
  notaFiscal: null,
  prazoAteste: { etapa: 'provisorio', venceEm: '2026-10-15', atrasado: true },
};

beforeEach(() => vi.clearAllMocks());

describe('AtesteCotacao', () => {
  it('mostra o selo de atraso e o botão do provisório ao gestor (AC-21)', () => {
    render(
      <AtesteCotacao
        cotacao={base}
        acoes={{ ...semAcao, receberProvisorio: true }}
        onAlterado={vi.fn()}
      />,
    );
    expect(screen.getByText('Recebimento provisório atrasado (prazo 15/10/2026)')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Registrar recebimento provisório' })).toBeVisible();
  });

  it('não aparece antes da execução', () => {
    const { container } = render(
      <AtesteCotacao
        cotacao={{ ...base, situacao: 'autorizada', prazoAteste: null }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('o provisório só grava depois de confirmar no diálogo (AC-21)', async () => {
    const user = userEvent.setup();
    const onAlterado = vi.fn();
    m.registrarRecebimentoAction.mockResolvedValue({ ok: true, situacao: 'executada', versao: 8 });
    render(
      <AtesteCotacao
        cotacao={base}
        acoes={{ ...semAcao, receberProvisorio: true }}
        onAlterado={onAlterado}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar recebimento provisório' }));
    expect(m.registrarRecebimentoAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(m.registrarRecebimentoAction).toHaveBeenCalledWith({
        id: 'c1',
        versao: 7,
        etapa: 'provisorio',
      }),
    );
    await waitFor(() => expect(onAlterado).toHaveBeenCalled());
  });

  it('a nota fiscal passa pela conferência antes de gravar (AC-22)', async () => {
    const user = userEvent.setup();
    m.enviarArquivo.mockResolvedValue({ ok: true, arquivoId: 'a'.repeat(24) });
    m.registrarNotaFiscalAction.mockResolvedValue({ ok: true, situacao: 'atestada', versao: 10 });
    render(
      <AtesteCotacao
        cotacao={{ ...base, situacao: 'atestada', visao: 'contratada', prazoAteste: undefined }}
        acoes={{ ...semAcao, registrarNotaFiscal: true }}
        onAlterado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    const conferir = screen.getByRole('button', { name: 'Conferir' });
    expect(conferir).toBeDisabled();

    await user.type(screen.getByLabelText('Número'), '4321');
    await user.type(screen.getByLabelText('Data de emissão'), '2026-10-18');
    await user.upload(
      screen.getByLabelText('Arquivo'),
      new File(['%PDF-1.4'], 'nf.pdf', { type: 'application/pdf' }),
    );
    await screen.findByText('Anexado: nf.pdf');
    await user.click(conferir);

    expect(screen.getByRole('status')).toHaveTextContent(
      'nota nº 4321, emitida em 18/10/2026, arquivo nf.pdf',
    );
    expect(m.registrarNotaFiscalAction).not.toHaveBeenCalled();

    // Corrigir volta ao formulário com o que já foi digitado.
    await user.click(screen.getByRole('button', { name: 'Corrigir' }));
    expect(screen.getByLabelText('Número')).toHaveValue('4321');
    await user.click(screen.getByRole('button', { name: 'Conferir' }));

    await user.click(screen.getByRole('button', { name: 'Confirmar e registrar' }));
    await waitFor(() =>
      expect(m.registrarNotaFiscalAction).toHaveBeenCalledWith({
        id: 'c1',
        versao: 7,
        numero: '4321',
        data: '2026-10-18',
        arquivoId: 'a'.repeat(24),
      }),
    );
  });

  it('o campo de data não aceita dia futuro', async () => {
    const user = userEvent.setup();
    render(
      <AtesteCotacao
        cotacao={{ ...base, situacao: 'atestada', visao: 'contratada' }}
        acoes={{ ...semAcao, registrarNotaFiscal: true }}
        onAlterado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    expect(screen.getByLabelText('Data de emissão')).toHaveAttribute(
      'max',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });
});
