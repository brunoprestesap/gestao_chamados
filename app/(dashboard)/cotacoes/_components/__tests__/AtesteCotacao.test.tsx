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
 * covers: AC-15, AC-21, AC-22
 */

const m = vi.hoisted(() => ({
  registrarRecebimentoAction: vi.fn(),
  registrarNotaFiscalAction: vi.fn(),
  removerArquivoAction: vi.fn(),
  enviarArquivo: vi.fn(),
}));
vi.mock('../../actions', () => ({
  registrarRecebimentoAction: m.registrarRecebimentoAction,
  registrarNotaFiscalAction: m.registrarNotaFiscalAction,
  removerArquivoAction: m.removerArquivoAction,
}));
vi.mock('../apoio', async (original) => ({
  ...(await original<typeof import('../apoio')>()),
  enviarArquivo: m.enviarArquivo,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { Acoes } from '@/lib/material/leitura';
import type { CotacaoDTO } from '@/lib/material/serializar';

import { SeloPrazoAteste } from '../apoio';
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
  referenciasDoFiscal: false,
  recusarUrgencia: false,
  completarPesquisa: false,
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

beforeEach(() => {
  vi.clearAllMocks();
  m.removerArquivoAction.mockResolvedValue({ ok: true });
});

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

  it('o campo de data vai do dia da autorização, em Belém, até hoje (AC-22)', async () => {
    const user = userEvent.setup();
    render(
      <AtesteCotacao
        // 02:00 UTC do dia 10 ainda é o dia 9 em Belém.
        cotacao={{
          ...base,
          situacao: 'atestada',
          visao: 'contratada',
          autorizadoEm: '2026-10-10T02:00:00Z',
        }}
        acoes={{ ...semAcao, registrarNotaFiscal: true }}
        onAlterado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    expect(screen.getByLabelText('Data de emissão')).toHaveAttribute('min', '2026-10-09');
  });

  it('a contratada vê a data do recebimento sem o nome de quem recebeu (AC-21)', () => {
    render(
      <AtesteCotacao
        cotacao={{
          ...base,
          situacao: 'atestada',
          visao: 'contratada',
          prazoAteste: undefined,
          recebimentoProvisorio: { porNome: null, em: '2026-10-12T15:00:00Z' },
          recebimentoDefinitivo: { porNome: null, em: '2026-10-13T15:00:00Z' },
        }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    expect(screen.getByText('12/10/2026, 12:00')).toBeVisible();
    expect(screen.getByText('13/10/2026, 12:00')).toBeVisible();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
    expect(screen.queryByText(/atrasado|até \d/)).not.toBeInTheDocument();
  });

  it('trocar o anexo ou desistir remove o arquivo ainda não ligado à nota (AC-22)', async () => {
    const user = userEvent.setup();
    m.enviarArquivo
      .mockResolvedValueOnce({ ok: true, arquivoId: 'a'.repeat(24) })
      .mockResolvedValueOnce({ ok: true, arquivoId: 'b'.repeat(24) });
    render(
      <AtesteCotacao
        cotacao={{ ...base, situacao: 'atestada', visao: 'contratada' }}
        acoes={{ ...semAcao, registrarNotaFiscal: true }}
        onAlterado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    const pdf = (nome: string) => new File(['%PDF-1.4'], nome, { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Arquivo'), pdf('nf1.pdf'));
    await screen.findByText('Anexado: nf1.pdf');
    expect(m.removerArquivoAction).not.toHaveBeenCalled();

    await user.upload(screen.getByLabelText('Arquivo'), pdf('nf2.pdf'));
    await screen.findByText('Anexado: nf2.pdf');
    expect(m.removerArquivoAction).toHaveBeenCalledWith({ arquivoId: 'a'.repeat(24) });

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() =>
      expect(m.removerArquivoAction).toHaveBeenLastCalledWith({ arquivoId: 'b'.repeat(24) }),
    );
  });

  it('a nota registrada não remove o arquivo dela', async () => {
    const user = userEvent.setup();
    m.enviarArquivo.mockResolvedValue({ ok: true, arquivoId: 'a'.repeat(24) });
    m.registrarNotaFiscalAction.mockResolvedValue({ ok: true, situacao: 'atestada', versao: 10 });
    render(
      <AtesteCotacao
        cotacao={{ ...base, situacao: 'atestada', visao: 'contratada' }}
        acoes={{ ...semAcao, registrarNotaFiscal: true }}
        onAlterado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    await user.type(screen.getByLabelText('Número'), '1');
    await user.type(screen.getByLabelText('Data de emissão'), '2026-10-18');
    await user.upload(
      screen.getByLabelText('Arquivo'),
      new File(['%PDF-1.4'], 'nf.pdf', { type: 'application/pdf' }),
    );
    await screen.findByText('Anexado: nf.pdf');
    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar e registrar' }));
    await waitFor(() => expect(m.registrarNotaFiscalAction).toHaveBeenCalled());
    expect(m.removerArquivoAction).not.toHaveBeenCalled();
  });
});

describe('AtesteCotacao, anexo que sobrou de outra visita', () => {
  const arquivo = (id: string, nome: string, em: string, meu = true) => ({
    id,
    tipo: 'nota_fiscal' as const,
    nomeOriginal: nome,
    tamanho: 10,
    em,
    meu,
  });

  it('reaproveita o anexo mais recente e remove os outros ao reabrir (AC-22)', async () => {
    const user = userEvent.setup();
    m.registrarNotaFiscalAction.mockResolvedValue({ ok: true, situacao: 'atestada', versao: 10 });
    render(
      <AtesteCotacao
        cotacao={{
          ...base,
          situacao: 'atestada',
          visao: 'contratada',
          arquivos: [
            arquivo('a'.repeat(24), 'velha.pdf', '2026-10-17T12:00:00Z'),
            arquivo('c'.repeat(24), 'de-outro.pdf', '2026-10-17T13:00:00Z', false),
            arquivo('b'.repeat(24), 'recente.pdf', '2026-10-18T12:00:00Z'),
          ],
        }}
        acoes={{ ...semAcao, registrarNotaFiscal: true }}
        onAlterado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    expect(screen.getByText('Anexado: recente.pdf')).toBeVisible();
    await waitFor(() =>
      expect(m.removerArquivoAction).toHaveBeenCalledWith({ arquivoId: 'a'.repeat(24) }),
    );
    // O arquivo de outra pessoa nunca sai por aqui.
    expect(m.removerArquivoAction).not.toHaveBeenCalledWith({ arquivoId: 'c'.repeat(24) });
    expect(m.enviarArquivo).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Número'), '12');
    await user.type(screen.getByLabelText('Data de emissão'), '2026-10-18');
    await user.click(screen.getByRole('button', { name: 'Conferir' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar e registrar' }));
    await waitFor(() =>
      expect(m.registrarNotaFiscalAction).toHaveBeenCalledWith(
        expect.objectContaining({ arquivoId: 'b'.repeat(24) }),
      ),
    );
  });

  it('um anexo removido nesta tela não volta ao reabrir antes de a página recarregar', async () => {
    const user = userEvent.setup();
    render(
      <AtesteCotacao
        cotacao={{
          ...base,
          situacao: 'atestada',
          visao: 'contratada',
          arquivos: [arquivo('b'.repeat(24), 'recente.pdf', '2026-10-18T12:00:00Z')],
        }}
        acoes={{ ...semAcao, registrarNotaFiscal: true }}
        onAlterado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() =>
      expect(m.removerArquivoAction).toHaveBeenCalledWith({ arquivoId: 'b'.repeat(24) }),
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    expect(screen.queryByText(/Anexado:/)).not.toBeInTheDocument();
  });
});

describe('SeloPrazoAteste', () => {
  it('lê os rótulos de mensagens.ts, no prazo e atrasado (AC-21)', () => {
    const { rerender } = render(
      <SeloPrazoAteste prazo={{ etapa: 'definitivo', venceEm: '2026-10-20', atrasado: false }} />,
    );
    expect(screen.getByText('Recebimento definitivo até 20/10/2026')).toBeVisible();
    rerender(
      <SeloPrazoAteste prazo={{ etapa: 'definitivo', venceEm: '2026-10-20', atrasado: true }} />,
    );
    expect(screen.getByText('Recebimento definitivo atrasado (prazo 20/10/2026)')).toBeVisible();
  });

  it('sem prazo não mostra nada', () => {
    const { container } = render(<SeloPrazoAteste prazo={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
