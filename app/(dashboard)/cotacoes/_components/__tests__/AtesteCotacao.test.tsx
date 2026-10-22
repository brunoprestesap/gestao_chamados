// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O ateste na tela da cotação (spec 0019, fatia 2, repaginado pela spec
 * 0021, fatia 3): as três etapas com estado, prazo e atraso, o autorizado e o
 * aplicado por item, as evidências e a nota fiscal, que passa por uma
 * conferência antes de gravar porque não se troca depois. Os registros abrem
 * pelo painel "Sua vez"; aqui um painel mínimo faz esse papel.
 *
 * covers: AC-15, AC-21, AC-22 (0019); AC-9 (0021)
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

import { useState } from 'react';

import type { Acoes } from '@/lib/material/leitura';
import type { CotacaoDTO } from '@/lib/material/serializar';
import { TEXTO_ACAO_DA_VEZ } from '@/shared/material/mensagens';

import { SeloPrazoAteste } from '../apoio';
import { AtesteCotacao, type PedidoAteste } from '../AtesteCotacao';

/** O painel "Sua vez" reduzido: um botão por ação liberada, que abre o diálogo do ateste. */
function ComPainel({
  cotacao,
  acoes,
  onAlterado,
}: {
  cotacao: CotacaoDTO;
  acoes: Acoes;
  onAlterado: () => void;
}) {
  const [pedido, setPedido] = useState<PedidoAteste | null>(null);
  const botoes = [
    ['receberProvisorio', 'provisorio'],
    ['receberDefinitivo', 'definitivo'],
    ['registrarNotaFiscal', 'nota_fiscal'],
  ] as const;
  return (
    <>
      {botoes
        .filter(([acao]) => acoes[acao])
        .map(([acao, p]) => (
          <button key={acao} type="button" onClick={() => setPedido(p)}>
            {TEXTO_ACAO_DA_VEZ[acao].botao}
          </button>
        ))}
      <AtesteCotacao
        cotacao={cotacao}
        pedido={pedido}
        onPedido={setPedido}
        onAlterado={onAlterado}
      />
    </>
  );
}

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
  it('mostra a etapa atrasada com o prazo e o botão do provisório ao gestor (AC-21, AC-9)', () => {
    render(
      <ComPainel
        cotacao={base}
        acoes={{ ...semAcao, receberProvisorio: true }}
        onAlterado={vi.fn()}
      />,
    );
    expect(screen.getByText('O prazo era 15/10/2026.')).toBeVisible();
    expect(screen.getByText(/^1 · Atrasado/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Registrar recebimento provisório' })).toBeVisible();
  });

  it('não aparece antes da execução', () => {
    const { container } = render(
      <ComPainel
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
      <ComPainel
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
      <ComPainel
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
      <ComPainel
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
      <ComPainel
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
      <ComPainel
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
    expect(screen.getByText('Em 12/10/2026, 12:00.')).toBeVisible();
    expect(screen.getByText('Em 13/10/2026, 12:00.')).toBeVisible();
    expect(screen.queryByText(/, por /)).not.toBeInTheDocument();
    expect(screen.queryByText(/atrasado|prazo/i)).not.toBeInTheDocument();
  });

  it('trocar o anexo ou desistir remove o arquivo ainda não ligado à nota (AC-22)', async () => {
    const user = userEvent.setup();
    m.enviarArquivo
      .mockResolvedValueOnce({ ok: true, arquivoId: 'a'.repeat(24) })
      .mockResolvedValueOnce({ ok: true, arquivoId: 'b'.repeat(24) });
    render(
      <ComPainel
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

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(m.removerArquivoAction).toHaveBeenLastCalledWith({ arquivoId: 'b'.repeat(24) }),
    );
  });

  it('a nota registrada não remove o arquivo dela', async () => {
    const user = userEvent.setup();
    m.enviarArquivo.mockResolvedValue({ ok: true, arquivoId: 'a'.repeat(24) });
    m.registrarNotaFiscalAction.mockResolvedValue({ ok: true, situacao: 'atestada', versao: 10 });
    render(
      <ComPainel
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
      <ComPainel
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
      <ComPainel
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
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(m.removerArquivoAction).toHaveBeenCalledWith({ arquivoId: 'b'.repeat(24) }),
    );
    await user.click(screen.getByRole('button', { name: 'Registrar nota fiscal' }));
    expect(screen.queryByText(/Anexado:/)).not.toBeInTheDocument();
  });
});

describe('AtesteCotacao, etapas, tabela e evidências (spec 0021, AC-9)', () => {
  const item = {
    id: 'i1',
    descricao: 'Primer epóxi',
    unidade: 'kit',
    quantidade: 6,
    motivo: 'piso',
    doDiagnostico: true,
    precoAplicadoCentavos: 28_450,
    quantidadeExecutada: 5,
    valorExecutadoCentavos: 142_250,
  };

  it('as três etapas em ordem: provisório feito, definitivo agora com prazo, nota a seguir', () => {
    render(
      <ComPainel
        cotacao={{
          ...base,
          recebimentoProvisorio: { porNome: 'Gestora', em: '2026-10-12T15:00:00Z' },
          prazoAteste: { etapa: 'definitivo', venceEm: '2099-10-17', atrasado: false },
        }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    const etapas = within(screen.getByRole('list', { name: 'Etapas do ateste' })).getAllByRole(
      'listitem',
    );
    expect(etapas.map((e) => e.textContent)).toEqual([
      expect.stringMatching(/^1 · Registrado.*Recebimento provisório.*por Gestora/),
      expect.stringMatching(/^2 · Agora.*Recebimento definitivo.*Prazo até 17\/10\/2099/),
      expect.stringMatching(/^3 · A seguir.*Nota fiscal/),
    ]);
    expect(etapas[1]).toHaveAttribute('aria-current', 'step');
  });

  it('a nota registrada mostra número, data e o link do arquivo', () => {
    render(
      <ComPainel
        cotacao={{
          ...base,
          situacao: 'atestada',
          prazoAteste: null,
          notaFiscal: {
            porNome: null,
            em: '2026-10-18T12:00:00Z',
            numero: '4321',
            data: '2026-10-18',
            arquivoId: 'f'.repeat(24),
          },
        }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    expect(screen.getByText('Nº 4321, de 18/10/2026.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Arquivo da nota fiscal' })).toHaveAttribute(
      'href',
      `/api/cotacoes/arquivos/${'f'.repeat(24)}`,
    );
  });

  it('autorizado é quantidade vezes o preço aplicado; aplicado é o executado do item', () => {
    render(
      <ComPainel
        cotacao={{
          ...base,
          executadoEm: '2026-10-10T15:00:00Z',
          valorExecutadoCentavos: 142_250,
          itens: [item],
        }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    const tabela = within(screen.getByRole('region', { name: /autorizado e do aplicado/ }));
    const linha = tabela.getByRole('row', { name: /Primer epóxi/ });
    expect(
      within(linha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([
      'Primer epóxikit',
      '6',
      expect.stringMatching(/R\$\s1\.707,00/),
      // A diferença vem também em texto, não só pela cor (AC-26).
      '5abaixo do autorizado',
      expect.stringMatching(/R\$\s1\.422,50/),
    ]);
  });

  it('o total autorizado é o gravado na aprovação, não a soma das linhas', () => {
    render(
      <ComPainel
        cotacao={{
          ...base,
          executadoEm: '2026-10-10T15:00:00Z',
          valorExecutadoCentavos: 142_250,
          valorTotalCentavos: 999_999,
          valorAutorizadoCentavos: 300_000,
          // Um item sem preço não pode sumir do total sem aviso.
          itens: [item, { ...item, id: 'i2', descricao: 'Rolo', precoAplicadoCentavos: null }],
        }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    const tabela = within(screen.getByRole('region', { name: /autorizado e do aplicado/ }));
    expect(tabela.getByRole('row', { name: /Rolo/ })).toHaveTextContent('sem preço');
    expect(tabela.getByRole('row', { name: /^Total/ })).toHaveTextContent(/R\$\s3\.000,00/);
  });

  it('a contratada, sem o autorizado gravado, vê o total da cotação no rodapé', () => {
    render(
      <ComPainel
        cotacao={{
          ...base,
          visao: 'contratada',
          prazoAteste: undefined,
          executadoEm: '2026-10-10T15:00:00Z',
          valorExecutadoCentavos: 142_250,
          valorTotalCentavos: 170_700,
          itens: [{ ...item, quantidadeExecutada: 7 }],
        }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    const tabela = within(screen.getByRole('region', { name: /autorizado e do aplicado/ }));
    expect(tabela.getByRole('row', { name: /Primer/ })).toHaveTextContent('acima do autorizado');
    expect(tabela.getByRole('row', { name: /^Total/ })).toHaveTextContent(/R\$\s1\.707,00/);
  });

  it('evidências viram lista de arquivos com o tipo pela extensão', () => {
    const evid = (id: string, nome: string) => ({
      id,
      tipo: 'evidencia' as const,
      nomeOriginal: nome,
      tamanho: 2048,
      em: '2026-10-10T12:00:00Z',
      meu: false,
    });
    render(
      <ComPainel
        cotacao={{
          ...base,
          arquivos: [evid('e1', 'depois.jpg'), evid('e2', 'medicao.PDF')],
        }}
        acoes={semAcao}
        onAlterado={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Evidências (2)' })).toBeVisible();
    expect(screen.getByRole('link', { name: /depois\.jpg.*Foto · 2 KB/ })).toHaveAttribute(
      'href',
      '/api/cotacoes/arquivos/e1',
    );
    expect(screen.getByRole('link', { name: /medicao\.PDF.*PDF · 2 KB/ })).toBeVisible();
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
