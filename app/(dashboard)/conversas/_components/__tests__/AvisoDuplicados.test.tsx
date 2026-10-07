// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockAcompanhar = vi.fn();
vi.mock('../../actions', () => ({
  acompanharChamadoAction: (...a: unknown[]) => mockAcompanhar(...a),
}));

import type { DuplicadoDoCartao } from '@/shared/conversas/conversa.schemas';

import { AvisoDuplicados } from '../AvisoDuplicados';

/**
 * O aviso de chamado duplicado no cartão (spec 0017). Uma linha por parecido,
 * a ação certa para cada tipo de item, a corrida com o fim e o cartão
 * substituído sem ação.
 *
 * covers: AC-7, AC-9, AC-10
 */

const CONVERSA = '6aad5286df6f201a25eda5f1';
const CARTAO = '6aad5286df6f201a25eda5f5';
const TITULO = 'Parece que já existe um chamado para isso';

const item = (extra: Partial<DuplicadoDoCartao> = {}): DuplicadoDoCartao => ({
  chamadoId: '6aad5286df6f201a25edf001',
  ticketNumber: 'CHM-2026-00001',
  rotuloServico: 'REPARO DE SPLIT',
  localExato: 'sala 205 norte',
  ativoCodigo: 'MNT-0001',
  status: 'em atendimento',
  abertoEm: new Date().toISOString(),
  proprio: false,
  jaTemAcesso: false,
  ...extra,
});

function renderizar(
  duplicados: DuplicadoDoCartao[],
  extra: Partial<Parameters<typeof AvisoDuplicados>[0]> = {},
) {
  const onDesatualizado = vi.fn();
  render(
    <AvisoDuplicados
      duplicados={duplicados}
      conversaId={CONVERSA}
      cartaoId={CARTAO}
      atual
      bloqueado={false}
      onDesatualizado={onDesatualizado}
      {...extra}
    />,
  );
  return { onDesatualizado };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAcompanhar.mockResolvedValue({
    ok: true,
    chamadoId: '6aad5286df6f201a25edf001',
    rascunhoDescartado: true,
  });
});

describe('AvisoDuplicados · a lista (AC-7)', () => {
  it('é uma região com título próprio e uma linha por parecido, com número, serviço, local, equipamento, status e idade', () => {
    renderizar([item()]);

    const regiao = screen.getByRole('region', { name: TITULO });
    const linhas = within(regiao).getAllByRole('listitem');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toHaveTextContent(
      '#CHM-2026-00001 · REPARO DE SPLIT · sala 205 norte · MNT-0001 · Em atendimento · aberto hoje',
    );
  });

  it('o HTML do servidor sai sem a idade, que depende do relógio e do fuso de quem lê', () => {
    // Act
    const html = renderToString(
      <AvisoDuplicados
        duplicados={[item()]}
        conversaId={CONVERSA}
        cartaoId={CARTAO}
        atual
        bloqueado={false}
        onDesatualizado={vi.fn()}
      />,
    );

    // Assert
    expect(html).toContain('#CHM-2026-00001 · REPARO DE SPLIT');
    expect(html).not.toContain('aberto');
  });

  it('pula o local e o equipamento quando não vêm', () => {
    renderizar([item({ localExato: null, ativoCodigo: null })]);
    expect(screen.getByRole('listitem')).toHaveTextContent(
      '#CHM-2026-00001 · REPARO DE SPLIT · Em atendimento · aberto hoje',
    );
  });

  it('nunca afirma que é o mesmo problema ou o mesmo equipamento', () => {
    renderizar([item()]);
    expect(screen.getByRole('region', { name: TITULO })).not.toHaveTextContent(
      /mesmo equipamento|é o mesmo problema/i,
    );
  });

  it('item de outra pessoa tem "Acompanhar este" com o número no nome acessível', () => {
    renderizar([item()]);
    expect(
      screen.getByRole('button', { name: /^Acompanhar este\s*#CHM-2026-00001$/ }),
    ).toBeEnabled();
  });

  it('item próprio diz que a pessoa já abriu e só navega para o chamado', () => {
    renderizar([item({ proprio: true })]);
    expect(screen.getByText('Você já abriu este chamado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver meu chamado/i })).toHaveAttribute(
      'href',
      '/conversas/6aad5286df6f201a25edf001',
    );
    expect(screen.queryByRole('button', { name: /acompanhar/i })).not.toBeInTheDocument();
  });

  it('item de quem já tem acesso tem "Ver chamado", sem acompanhar', () => {
    renderizar([item({ jaTemAcesso: true })]);
    expect(screen.getByRole('link', { name: /^ver chamado/i })).toHaveAttribute(
      'href',
      '/conversas/6aad5286df6f201a25edf001',
    );
    expect(screen.queryByRole('button', { name: /acompanhar/i })).not.toBeInTheDocument();
  });

  it('cartão substituído: sem dica, sem link e com o botão desabilitado', () => {
    renderizar([item(), item({ chamadoId: '6aad5286df6f201a25edf002', proprio: true })], {
      atual: false,
    });
    expect(screen.queryByText(/se for o mesmo problema/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /acompanhar/i })).toBeDisabled();
  });

  it('cartão bloqueado (confirmando ou esperando resposta) desabilita o acompanhar', () => {
    renderizar([item()], { bloqueado: true });
    expect(screen.getByRole('button', { name: /acompanhar/i })).toBeDisabled();
  });
});

describe('AvisoDuplicados · acompanhar (AC-9, AC-10)', () => {
  it('manda só conversa, cartão e chamado, e navega para a vista do chamado', async () => {
    const user = userEvent.setup();
    renderizar([item()]);

    await user.click(screen.getByRole('button', { name: /acompanhar/i }));

    expect(mockAcompanhar).toHaveBeenCalledWith({
      conversaId: CONVERSA,
      cartaoId: CARTAO,
      chamadoId: '6aad5286df6f201a25edf001',
    });
    expect(mockPush).toHaveBeenCalledWith('/conversas/6aad5286df6f201a25edf001');
  });

  it('chamado que terminou antes do clique mostra a frase da spec num alerta, sem navegar', async () => {
    const user = userEvent.setup();
    mockAcompanhar.mockResolvedValue({ ok: false, reason: 'chamado_encerrado' });
    renderizar([item()]);

    await user.click(screen.getByRole('button', { name: /acompanhar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esse chamado já foi concluído ou encerrado. Se o problema continua, abra o seu.',
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /acompanhar/i })).toBeEnabled();
  });

  it('cartão desatualizado avisa a tela para recarregar o ponteiro', async () => {
    const user = userEvent.setup();
    mockAcompanhar.mockResolvedValue({ ok: false, reason: 'cartao_desatualizado' });
    const { onDesatualizado } = renderizar([item()]);

    await user.click(screen.getByRole('button', { name: /acompanhar/i }));

    expect(onDesatualizado).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('rede fora vira a frase de falha de rede', async () => {
    const user = userEvent.setup();
    mockAcompanhar.mockRejectedValue(new Error('offline'));
    renderizar([item()]);

    await user.click(screen.getByRole('button', { name: /acompanhar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/verifique a conexão/i);
  });
});
