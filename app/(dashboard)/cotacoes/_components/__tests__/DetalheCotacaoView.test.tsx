// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O detalhe repaginado (spec 0021, fatia 2): cabeçalho com a jornada, o
 * painel "Sua vez" montado de `acoes`, as abas e o bloco Empenho só no TRF1.
 *
 * covers: AC-5, AC-6, AC-7, AC-8, AC-24
 */

const m = vi.hoisted(() => ({ assumirAction: vi.fn(), refresh: vi.fn() }));
vi.mock('../../actions', () => ({
  acrescentarReferenciaAction: vi.fn(),
  alterarAction: vi.fn(),
  aprovarAction: vi.fn(),
  assumirAction: m.assumirAction,
  cancelarAction: vi.fn(),
  devolverAction: vi.fn(),
  encaminharAction: vi.fn(),
  recusarUrgenciaAction: vi.fn(),
  reprovarAction: vi.fn(),
  retirarReferenciaAction: vi.fn(),
  registrarRecebimentoAction: vi.fn(),
  registrarNotaFiscalAction: vi.fn(),
  removerArquivoAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { Acoes, DetalheCotacao } from '@/lib/material/leitura';
import type { CotacaoDTO } from '@/lib/material/serializar';

import { DetalheCotacaoView } from '../DetalheCotacaoView';

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

const item = {
  id: 'i1',
  descricao: 'Disjuntor bipolar 40 A',
  unidade: 'un',
  quantidade: 2,
  motivo: 'Trocar o queimado',
  doDiagnostico: true,
  precoAplicadoCentavos: 10_00,
  quantidadeExecutada: null,
  valorExecutadoCentavos: null,
  origem: 'orcamento',
  referencias: [],
};

const cotacao: CotacaoDTO = {
  id: 'c1',
  numero: 'COT-2026-0145',
  chamadoId: 'ch1',
  situacao: 'em_analise',
  emTramite: true,
  versao: 3,
  visao: 'trf1',
  criadaEm: '2026-10-15T12:00:00.000Z',
  atualizadaEm: '2026-10-18T12:00:00.000Z',
  ultimoMotivo: null,
  itens: [item],
  valorTotalCentavos: 20_00,
  orcamentos: [
    {
      id: 'o1',
      fornecedor: 'Loja Norte',
      cnpj: '11222333000181',
      data: '2026-10-10',
      validade: '2026-10-12',
      arquivoId: 'a1',
      precos: [{ itemId: 'i1', valorUnitarioCentavos: 10_00 }],
      fase: 'envio',
    },
    {
      id: 'o2',
      fornecedor: 'Loja Sul',
      cnpj: '44555666000181',
      data: '2026-10-10',
      validade: '2026-12-31',
      arquivoId: 'a2',
      precos: [{ itemId: 'i1', valorUnitarioCentavos: 12_00 }],
      fase: 'envio',
    },
  ],
  arquivos: [],
  trilha: [
    {
      id: 'e1',
      de: null,
      para: 'rascunho',
      acao: 'criar',
      autorNome: 'José Técnico',
      papel: 'tecnico',
      motivo: null,
      em: '2026-10-15T12:00:00.000Z',
    },
    {
      id: 'e2',
      de: 'enviada',
      para: 'em_analise',
      acao: 'assumir',
      autorNome: 'Marina Fiscal',
      papel: 'fiscal',
      motivo: null,
      em: '2026-10-18T12:00:00.000Z',
    },
    {
      id: 'e3',
      de: 'em_analise',
      para: 'em_analise',
      acao: 'conciliar',
      autorNome: null,
      papel: 'sistema',
      motivo: null,
      em: '2026-10-19T12:00:00.000Z',
    },
  ],
  etapas: [
    { situacao: 'rascunho', em: '2026-10-15T12:00:00.000Z' },
    { situacao: 'em_analise', em: '2026-10-18T12:00:00.000Z' },
  ],
  montadoPorNome: 'Carlos RT',
  quemAgeAgora: { papel: 'fiscal', nome: 'Marina Fiscal' },
  advertencias: ['reincidencia'],
  empenho: {
    modo: 'elegiveis',
    barras: [
      {
        empenhoId: 'emp1',
        numero: '2026NE000184',
        liquidoCentavos: 1000_00,
        comprometidoCentavos: 200_00,
        estaCotacaoCentavos: null,
        saldoDepoisCentavos: 800_00,
        projecao: null,
      },
    ],
    podemAprovar: null,
  },
};

const chamado = {
  id: 'ch1',
  numero: '#2274',
  titulo: 'Troca do disjuntor',
  status: 'em atendimento',
  ativo: null,
};

function detalhe(over: Partial<DetalheCotacao> = {}): DetalheCotacao {
  return { cotacao, acoes: semAcao, chamado, papeis: ['fiscal'], ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DetalheCotacaoView', () => {
  it('abre com o cabeçalho: número, selo, chamado, quem montou, total e a jornada datada (AC-5)', () => {
    render(<DetalheCotacaoView detalhe={detalhe()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cotação COT-2026-0145' })).toBeVisible();
    expect(screen.getByRole('link', { name: '#2274 · Troca do disjuntor' })).toHaveAttribute(
      'href',
      '/gestao?chamado=ch1',
    );
    expect(screen.getByText('Carlos RT')).toBeVisible();
    const jornada = screen.getByRole('list', { name: 'Jornada da cotação' });
    expect(within(jornada).getByText('15/10')).toBeVisible();
    expect(within(jornada).getByRole('listitem', { current: 'step' })).toHaveTextContent(
      'Em análise',
    );
  });

  it('o fiscal vê a sua vez: a ação principal, os pontos do encaminhar e as secundárias (AC-6)', () => {
    render(
      <DetalheCotacaoView
        detalhe={detalhe({
          acoes: { ...semAcao, encaminhar: true, devolver: true, reprovar: true },
          encaminhar: {
            orcamentosVencidos: ['o1'],
            urgenciaPrecisaAceite: false,
            itensComVariacaoAcima: [],
          },
        })}
      />,
    );
    const painel = screen.getByRole('region', { name: 'Analisar e encaminhar' });
    expect(within(painel).getByText('Você atua como Fiscal.')).toBeVisible();
    expect(within(painel).getByText('Orçamento vencido')).toBeVisible();
    expect(within(painel).getByText(/De Loja Norte: confirme ao encaminhar/)).toBeVisible();
    expect(within(painel).getByText('Reincidência')).toBeVisible();
    expect(within(painel).getByRole('button', { name: 'Encaminhar para aprovação' })).toBeVisible();
    expect(within(painel).getByRole('button', { name: 'Devolver' })).toBeVisible();
    expect(within(painel).getByRole('button', { name: 'Reprovar' })).toBeVisible();
  });

  it('a ação principal dispara a action do servidor', async () => {
    m.assumirAction.mockResolvedValue({ ok: true });
    render(
      <DetalheCotacaoView
        detalhe={detalhe({
          cotacao: { ...cotacao, situacao: 'enviada' },
          acoes: { ...semAcao, assumir: true },
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Assumir análise' }));
    expect(m.assumirAction).toHaveBeenCalledWith({ id: 'c1', versao: 3 });
  });

  it('sem ação para quem lê, o painel diz quem age agora, sem nome fora do TRF1 (AC-6, AC-24)', () => {
    render(
      <DetalheCotacaoView
        detalhe={detalhe({
          cotacao: {
            ...cotacao,
            visao: 'contratada',
            quemAgeAgora: { papel: 'fiscal', nome: null },
            empenho: undefined,
            advertencias: [],
          },
          papeis: ['responsavel_tecnico'],
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Agora é a vez de: Fiscal.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /encaminhar/i })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Empenho' })).toBeNull();
  });

  it('o bloco Empenho do TRF1 mostra a barra com o comprometido e o saldo (AC-8)', () => {
    render(<DetalheCotacaoView detalhe={detalhe()} />);
    const bloco = screen.getByRole('region', { name: 'Empenho' });
    expect(within(bloco).getByText('2026NE000184')).toBeVisible();
    expect(
      within(bloco).getByRole('img', {
        name: /^Empenho 2026NE000184: comprometido R\$\s200,00, saldo depois R\$\s800,00\.$/,
      }),
    ).toBeVisible();
  });

  it('a tabela que rola de lado fica numa caixa rotulada que recebe foco pelo teclado (AC-25, AC-26)', async () => {
    render(<DetalheCotacaoView detalhe={detalhe()} />);
    const itens = screen.getByRole('region', { name: 'Tabela de itens e preços' });
    expect(itens).toHaveAttribute('tabindex', '0');
    expect(within(itens).getByRole('table')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Orçamentos (2)' }));
    const grade = screen.getByRole('region', { name: 'Grade de preços por fornecedor' });
    expect(grade).toHaveAttribute('tabindex', '0');
    expect(within(grade).getByRole('table')).toBeInTheDocument();
  });

  it('as abas trazem os orçamentos em grade, com o menor preço, e a trilha com a conciliação (AC-7)', async () => {
    render(<DetalheCotacaoView detalhe={detalhe()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Orçamentos (2)' }));
    const grade = screen.getByRole('table');
    expect(within(grade).getByText('Loja Norte')).toBeVisible();
    expect(within(grade).getByText('(menor preço)')).toBeInTheDocument();
    expect(within(grade).getByText('R$ 12,00')).toBeVisible();

    await userEvent.click(screen.getByRole('tab', { name: 'Trilha' }));
    expect(screen.getByText('Conciliação do saldo')).toBeVisible();
    expect(screen.getByText(/Marina Fiscal \(Fiscal\)/)).toBeVisible();
  });
});
