// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O painel "Serviço, prioridade e técnico" do detalhe do chamado (spec 0009,
 * AC-4, AC-5). A leitura vem da rota `decisoes-ia` (mockada aqui, com teste
 * próprio em `route.test.ts`); confirmar chama `confirmarDecisoesIaAction`
 * (mockada, com teste próprio em `gestao/__tests__/actions.test.ts`).
 */

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockConfirmarDecisoesIaAction = vi.fn();
vi.mock('@/app/(dashboard)/gestao/actions', () => ({
  confirmarDecisoesIaAction: (...args: unknown[]) => mockConfirmarDecisoesIaAction(...args),
}));

import { RevisaoIaPainel } from '../RevisaoIaPainel';

const CHAMADO_ID = 'a'.repeat(24);

const VALOR_VAZIO = {
  catalogServiceId: null,
  subtypeId: null,
  tipoServico: null,
  prioridade: null,
  tecnicoId: null,
};

function campoServico(overrides: Record<string, unknown> = {}) {
  return {
    campo: 'servico',
    atual: { ...VALOR_VAZIO, catalogServiceId: 'x'.repeat(24), rotulo: 'Troca de lâmpada' },
    decisao: {
      decididoPor: 'ia',
      efeito: 'aplicado',
      valorIa: { ...VALOR_VAZIO, rotulo: 'Troca de lâmpada' },
      valorFinal: { ...VALOR_VAZIO, rotulo: 'Troca de lâmpada' },
      confianca: 0.92,
      motivo: 'Lâmpada queimada é troca de lâmpada.',
      situacao: 'sem_revisao',
      revisadaEm: null,
      correcoes: [],
    },
    divergente: false,
    ...overrides,
  };
}

function campoPrioridade(overrides: Record<string, unknown> = {}) {
  return {
    campo: 'prioridade',
    atual: { ...VALOR_VAZIO, prioridade: 'NORMAL', rotulo: 'NORMAL' },
    decisao: null,
    divergente: false,
    ...overrides,
  };
}

function campoTecnico(overrides: Record<string, unknown> = {}) {
  return {
    campo: 'tecnico',
    atual: { ...VALOR_VAZIO, rotulo: 'Não atribuído' },
    decisao: null,
    divergente: false,
    ...overrides,
  };
}

function mockFetchCampos(campos: unknown[]) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ campos }) }) as Response);
}

describe('RevisaoIaPainel (spec 0009, AC-4, AC-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o valor atual de cada campo', async () => {
    vi.stubGlobal('fetch', mockFetchCampos([campoServico(), campoPrioridade(), campoTecnico()]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    expect(await screen.findByText('Troca de lâmpada')).toBeInTheDocument();
    expect(screen.getByText('NORMAL')).toBeInTheDocument();
    expect(screen.getByText('Não atribuído')).toBeInTheDocument();
  });

  it('mostra confiança quando decididoPor é ia, e "regra" quando é regra', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchCampos([
        campoServico(),
        campoPrioridade({
          decisao: {
            decididoPor: 'regra',
            efeito: 'aplicado',
            valorIa: { ...VALOR_VAZIO, prioridade: 'ALTA', rotulo: 'ALTA' },
            valorFinal: { ...VALOR_VAZIO, prioridade: 'ALTA', rotulo: 'ALTA' },
            confianca: null,
            motivo: 'Regra de urgência.',
            situacao: 'sem_revisao',
            revisadaEm: null,
            correcoes: [],
          },
        }),
        campoTecnico(),
      ]),
    );

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    expect(await screen.findByText(/92% de confiança/)).toBeInTheDocument();
    expect(screen.getByText(/\(regra\)/)).toBeInTheDocument();
  });

  it('numa decisão corrigida, "A IA escolheu" mostra o valor original da IA (valorIa), não o valor corrigido (valorFinal)', async () => {
    // Regressão: /check verify achou isto ao vivo no CHM-2026-00673 (a IA
    // escolheu NORMAL, o Preposto corrigiu para ALTA, e o painel mostrava
    // "A IA escolheu: ALTA", contradizendo a própria linha de correção logo
    // abaixo, que dizia "corrigiu de NORMAL para ALTA").
    vi.stubGlobal(
      'fetch',
      mockFetchCampos([
        campoServico(),
        campoPrioridade({
          decisao: {
            decididoPor: 'ia',
            efeito: 'aplicado',
            valorIa: { ...VALOR_VAZIO, prioridade: 'NORMAL', rotulo: 'NORMAL' },
            valorFinal: { ...VALOR_VAZIO, prioridade: 'ALTA', rotulo: 'ALTA' },
            confianca: 0.8,
            motivo: 'Fechadura travada não causa risco imediato.',
            situacao: 'corrigida',
            revisadaEm: '2026-09-24T14:45:19.770Z',
            correcoes: [
              {
                anterior: { ...VALOR_VAZIO, prioridade: 'NORMAL', rotulo: 'NORMAL' },
                novo: { ...VALOR_VAZIO, prioridade: 'ALTA', rotulo: 'ALTA' },
                userNome: 'Preposto E2E',
                origem: 'gestao',
                motivo: 'Verificação ao vivo: risco maior do que pareceu na abertura.',
                em: '2026-09-24T14:45:19.767Z',
              },
            ],
          },
        }),
        campoTecnico(),
      ]),
    );

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    // 80% de confiança só existe na linha de prioridade (servico usa 92%),
    // então esse parágrafo identifica a linha sem ambiguidade.
    const escolheuPrioridade = await screen.findByText(
      (_, element) =>
        element?.tagName === 'P' && (element.textContent ?? '').includes('80% de confiança'),
    );
    expect(escolheuPrioridade.textContent).toContain('A IA escolheu: NORMAL');
    expect(escolheuPrioridade.textContent).not.toContain('ALTA');

    // A correção continua mostrando o valor corrigido, só não na linha "A IA escolheu".
    const linhaCorrecao = screen.getByText(
      (_, element) =>
        element?.tagName === 'LI' && (element.textContent ?? '').includes('Preposto E2E'),
    );
    expect(linhaCorrecao.textContent).toContain('NORMAL');
    expect(linhaCorrecao.textContent).toContain('ALTA');
  });

  it('mostra o botão Confirmar só na decisão pendente (efeito aplicado + sem_revisao)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchCampos([
        campoServico(), // pendente
        campoPrioridade(), // sem decisão
        campoTecnico({
          decisao: {
            decididoPor: 'regra',
            efeito: 'aplicado',
            valorIa: { ...VALOR_VAZIO, rotulo: 'João' },
            valorFinal: { ...VALOR_VAZIO, rotulo: 'João' },
            confianca: null,
            motivo: 'Especialidade e carga.',
            situacao: 'confirmada', // já revisada
            revisadaEm: '2026-09-25T12:00:00.000Z',
            correcoes: [],
          },
        }),
      ]),
    );

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    await screen.findByText('Troca de lâmpada');
    expect(screen.getAllByRole('button', { name: 'Confirmar' })).toHaveLength(1);
  });

  it('confirmar chama a action com o campo, mostra sucesso e recarrega', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchCampos([campoServico(), campoPrioridade(), campoTecnico()]));
    mockConfirmarDecisoesIaAction.mockResolvedValue({
      ok: true,
      resultados: [{ campo: 'servico', ok: true }],
    });

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(mockConfirmarDecisoesIaAction).toHaveBeenCalledWith({
        chamadoId: CHAMADO_ID,
        campos: ['servico'],
      }),
    );
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it('recusa (ex.: divergente) mostra erro e não trava a tela', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockFetchCampos([campoServico()]));
    mockConfirmarDecisoesIaAction.mockResolvedValue({
      ok: false,
      error: 'Este valor já mudou desde a última leitura. Atualize a página e tente de novo.',
    });

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('"Confirmar todas" só aparece com mais de uma decisão pendente, e envia sem campos', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      mockFetchCampos([
        campoServico(),
        campoPrioridade({
          decisao: {
            decididoPor: 'ia',
            efeito: 'aplicado',
            valorIa: { ...VALOR_VAZIO, prioridade: 'ALTA', rotulo: 'ALTA' },
            valorFinal: { ...VALOR_VAZIO, prioridade: 'ALTA', rotulo: 'ALTA' },
            confianca: 0.81,
            motivo: 'Risco elétrico.',
            situacao: 'sem_revisao',
            revisadaEm: null,
            correcoes: [],
          },
        }),
        campoTecnico(),
      ]),
    );
    mockConfirmarDecisoesIaAction.mockResolvedValue({
      ok: true,
      resultados: [
        { campo: 'servico', ok: true },
        { campo: 'prioridade', ok: true },
      ],
    });

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    const botaoTodas = await screen.findByRole('button', { name: /Confirmar todas/ });
    await user.click(botaoTodas);

    await waitFor(() =>
      expect(mockConfirmarDecisoesIaAction).toHaveBeenCalledWith({
        chamadoId: CHAMADO_ID,
        campos: undefined,
      }),
    );
  });

  it('divergente mostra o aviso de que o valor mudou', async () => {
    vi.stubGlobal('fetch', mockFetchCampos([campoServico({ divergente: true })]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    expect(await screen.findByText(/já não é o que a decisão registra/)).toBeInTheDocument();
  });

  it('a linha do técnico mostra "Reatribuir" só quando o chamado está em atendimento', async () => {
    const onReatribuirTecnico = vi.fn();
    vi.stubGlobal('fetch', mockFetchCampos([campoServico(), campoPrioridade(), campoTecnico()]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico
        onReatribuirTecnico={onReatribuirTecnico}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    const botao = await screen.findByRole('button', { name: 'Reatribuir' });
    const user = userEvent.setup();
    await user.click(botao);

    expect(onReatribuirTecnico).toHaveBeenCalled();
  });

  it('sem podeReatribuirTecnico, não mostra o botão Reatribuir', async () => {
    vi.stubGlobal('fetch', mockFetchCampos([campoServico(), campoPrioridade(), campoTecnico()]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    await screen.findByText('Troca de lâmpada');
    expect(screen.queryByRole('button', { name: 'Reatribuir' })).not.toBeInTheDocument();
  });

  it('a linha da prioridade mostra "Corrigir" quando podeCorrigirPrioridade (spec 0009, AC-7)', async () => {
    const onCorrigirPrioridade = vi.fn();
    vi.stubGlobal('fetch', mockFetchCampos([campoServico(), campoPrioridade(), campoTecnico()]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade
        onCorrigirPrioridade={onCorrigirPrioridade}
        podeCorrigirServico={false}
      />,
    );

    const botao = await screen.findByRole('button', { name: 'Corrigir' });
    const user = userEvent.setup();
    await user.click(botao);

    expect(onCorrigirPrioridade).toHaveBeenCalled();
  });

  it('sem podeCorrigirPrioridade, não mostra o botão Corrigir', async () => {
    vi.stubGlobal('fetch', mockFetchCampos([campoServico(), campoPrioridade(), campoTecnico()]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    await screen.findByText('Troca de lâmpada');
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
  });

  it('a linha do serviço mostra "Corrigir" quando podeCorrigirServico (spec 0009, AC-11)', async () => {
    const onCorrigirServico = vi.fn();
    vi.stubGlobal('fetch', mockFetchCampos([campoServico(), campoPrioridade(), campoTecnico()]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico
        onCorrigirServico={onCorrigirServico}
      />,
    );

    const botao = await screen.findByRole('button', { name: 'Corrigir' });
    const user = userEvent.setup();
    await user.click(botao);

    expect(onCorrigirServico).toHaveBeenCalled();
  });

  it('sem podeCorrigirServico, não mostra o botão Corrigir na linha do serviço', async () => {
    vi.stubGlobal('fetch', mockFetchCampos([campoServico()]));

    render(
      <RevisaoIaPainel
        chamadoId={CHAMADO_ID}
        podeReatribuirTecnico={false}
        podeCorrigirPrioridade={false}
        podeCorrigirServico={false}
      />,
    );

    await screen.findByText('Troca de lâmpada');
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
  });
});
