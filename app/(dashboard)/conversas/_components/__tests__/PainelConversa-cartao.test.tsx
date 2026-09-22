// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

// ── Mocks ────────────────────────────────────────────────────────

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const mockRevisar = vi.fn();
const mockConfirmar = vi.fn();
vi.mock('../../actions', () => ({
  descartarRascunhoAction: vi.fn(),
  revisarAberturaAction: (...a: unknown[]) => mockRevisar(...a),
  confirmarAberturaAction: (...a: unknown[]) => mockConfirmar(...a),
}));

import { CARTAO_PRONTO_ANUNCIO, CONFIRMACAO_FRASES } from '../../_constants';
import type { ConversaNaTela, MensagemNaTela } from '../../_types';
import { Composer } from '../Composer';
import { PainelConversa } from '../PainelConversa';

/**
 * O cartão resumo e o `Revisar e abrir` dentro da conversa (spec 0004).
 *
 * covers: AC-7 (o botão aparece depois da primeira mensagem e monta o cartão),
 * AC-11 (confirmar leva ao modo leitura), AC-12 (só o cartão atual tem ação),
 * AC-13 (no teto, `Revisar e abrir` é a ação principal), AC-18 (a região ao
 * vivo diz só a frase do cartão, sem mover o foco)
 */

const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const CARTAO_ID = '6aad5286df6f201a25eda5f5';
const CARTAO_VELHO = '6aad5286df6f201a25eda5f6';

const CARTAO: CartaoPayload = {
  modo: 'ia',
  servico: {
    catalogServiceId: '6aad5286df6f201a25edb001',
    subtypeId: '6aad5286df6f201a25edb002',
    tipoServico: 'Manutenção Predial',
    rotuloServico: 'Troca de lâmpada',
    rotuloSubtipo: 'Iluminação',
  },
  unidade: { unitId: '6aad5286df6f201a25edc001', rotulo: 'Fórum Central', andar: '3º andar' },
  localExato: 'Sala 302',
  faltando: [],
};

function mensagem(over: Partial<MensagemNaTela>): MensagemNaTela {
  return {
    id: 'm1',
    autor: 'solicitante',
    tipo: 'texto',
    texto: 'A lâmpada queimou.',
    em: '2026-09-18T10:00:00.000Z',
    ...over,
  };
}

function conversa(over: Partial<ConversaNaTela> = {}): ConversaNaTela {
  return {
    id: CONVERSA_ID,
    situacao: 'rascunho',
    previa: 'A lâmpada queimou.',
    mensagensCount: 1,
    mensagens: [mensagem({})],
    cartaoAtualId: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  mockRevisar.mockResolvedValue({
    ok: true,
    mensagemId: CARTAO_ID,
    cartao: CARTAO,
    substituiId: null,
  });
  mockConfirmar.mockResolvedValue({ ok: true, chamadoId: 'c1', ticketNumber: '2026-0001' });
});

// ── `Revisar e abrir` · AC-7, AC-18 ──────────────────────────────

describe('PainelConversa · Revisar e abrir', () => {
  it('aparece depois da primeira mensagem do solicitante', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(screen.getByRole('button', { name: 'Revisar e abrir' })).toBeInTheDocument();
  });

  it('não aparece na tela de boas vindas, antes de existir conversa', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome="Maria" mensagensMax={30} />);

    // Assert
    expect(screen.queryByRole('button', { name: 'Revisar e abrir' })).not.toBeInTheDocument();
  });

  it('monta o cartão, anuncia só a frase dele e não tira o foco de onde está', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);
    const botao = screen.getByRole('button', { name: 'Revisar e abrir' });

    // Act
    await user.click(botao);

    // Assert
    expect(mockRevisar).toHaveBeenCalledWith(CONVERSA_ID);
    expect(await screen.findByRole('heading', { name: 'Resumo do chamado' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(CARTAO_PRONTO_ANUNCIO);
    expect(botao).toHaveFocus();
  });

  it('mostra a frase da falha, nunca o motivo cru', async () => {
    // Arrange
    const user = userEvent.setup();
    mockRevisar.mockResolvedValue({ ok: false, reason: 'confirmacao_em_andamento' });
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Revisar e abrir' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      CONFIRMACAO_FRASES.confirmacao_em_andamento,
    );
  });
});

// ── cartões na conversa · AC-11, AC-12 ───────────────────────────

describe('PainelConversa · cartões', () => {
  const comDois = () =>
    conversa({
      cartaoAtualId: CARTAO_ID,
      mensagens: [
        mensagem({}),
        mensagem({
          id: CARTAO_VELHO,
          autor: 'ia',
          tipo: 'cartao',
          texto: 'Resumo',
          cartao: CARTAO,
        }),
        mensagem({
          id: CARTAO_ID,
          autor: 'ia',
          tipo: 'cartao',
          texto: 'Resumo',
          cartao: { ...CARTAO, localExato: 'Sala 305' },
        }),
      ],
    });

  it('só o cartão atual tem botão; o outro aparece como substituído', () => {
    // Act
    render(<PainelConversa conversa={comDois()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    const cartoes = screen.getAllByRole('article');
    expect(cartoes).toHaveLength(2);
    expect(within(cartoes[0]).getByText('Substituído')).toBeInTheDocument();
    expect(within(cartoes[0]).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(cartoes[1]).getByRole('button', { name: /confirmar e abrir chamado/i }),
    ).toBeInTheDocument();
  });

  it('confirmar recarrega a mesma rota, que passa ao modo leitura', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<PainelConversa conversa={comDois()} primeiroNome={null} mensagensMax={30} />);

    // Act
    await user.click(screen.getByRole('button', { name: /confirmar e abrir chamado/i }));

    // Assert
    expect(mockConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ conversaId: CONVERSA_ID, cartaoId: CARTAO_ID }),
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it('conversa virando chamado deixa todo cartão sem ação', () => {
    // Act
    render(
      <PainelConversa
        conversa={{ ...comDois(), situacao: 'reservada' }}
        primeiroNome={null}
        mensagensMax={30}
      />,
    );

    // Assert
    expect(screen.queryByRole('button', { name: /confirmar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisar e abrir' })).not.toBeInTheDocument();
  });
});

// ── teto de 30 · AC-13 ───────────────────────────────────────────

describe('Composer · no teto de mensagens', () => {
  it('troca o convite ao formulário por `Revisar e abrir`, com o formulário como alternativa', () => {
    // Arrange
    const onRevisar = vi.fn();

    // Act
    render(
      <Composer
        texto=""
        onTexto={vi.fn()}
        placeholder="x"
        enviando={false}
        contagem={30}
        mensagensMax={30}
        noLimite
        onEnviar={vi.fn()}
        revisar={{ onRevisar, revisando: false, erro: null }}
      />,
    );

    // Assert
    expect(screen.getByText(/revise o resumo e abra o chamado por aqui/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar e abrir' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir por formulário/i })).toHaveAttribute(
      'href',
      '/meus-chamados',
    );
  });

  it('sem conversa ainda, nenhum botão de revisar aparece na caixa', () => {
    // Act
    render(
      <Composer
        texto=""
        onTexto={vi.fn()}
        placeholder="x"
        enviando={false}
        contagem={0}
        mensagensMax={30}
        noLimite={false}
        onEnviar={vi.fn()}
      />,
    );

    // Assert
    expect(screen.queryByRole('button', { name: 'Revisar e abrir' })).not.toBeInTheDocument();
  });
});
