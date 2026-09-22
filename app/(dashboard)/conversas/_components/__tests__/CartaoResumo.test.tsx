// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

// ── Mocks ────────────────────────────────────────────────────────

const mockConfirmar = vi.fn();
vi.mock('../../actions', () => ({
  confirmarAberturaAction: (...a: unknown[]) => mockConfirmar(...a),
}));

import { CONFIRMACAO_FRASES } from '../../_constants';
import { CartaoResumo } from '../CartaoResumo';
import { UnidadesProvider } from '../unidades-contexto';

/**
 * O cartão resumo do chamado (spec 0004). Só o cartão atual tem ação; o
 * serviço vem do banco e não se edita; unidade e local se ajustam antes de
 * confirmar.
 *
 * covers: AC-5 (o que o cartão mostra e o que não mostra), AC-6 (unidade do
 * perfil ou obrigatória), AC-9 (tipo no modo manual), AC-10 (o que vai para a
 * confirmação), AC-12 (substituído, desatualizado e espera pela resposta),
 * AC-18 (rótulos visíveis, erro ligado ao campo, alvos de 44 pixels)
 */

const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const CARTAO_ID = '6aad5286df6f201a25eda5f5';
const UNIDADE_ID = '6aad5286df6f201a25edc001';

const CARTAO_IA: CartaoPayload = {
  modo: 'ia',
  servico: {
    catalogServiceId: '6aad5286df6f201a25edb001',
    subtypeId: '6aad5286df6f201a25edb002',
    tipoServico: 'Manutenção Predial',
    rotuloServico: 'Troca de lâmpada',
    rotuloSubtipo: 'Iluminação',
  },
  unidade: { unitId: UNIDADE_ID, rotulo: 'Fórum Central', andar: '3º andar' },
  localExato: 'Sala 302',
  faltando: [],
};

const CARTAO_MANUAL: CartaoPayload = {
  modo: 'manual',
  servico: null,
  unidade: null,
  localExato: null,
  faltando: ['tipo', 'unidade', 'local'],
};

const UNIDADES = [
  { id: UNIDADE_ID, nome: 'Fórum Central', andar: '3º andar' },
  { id: '6aad5286df6f201a25edc002', nome: 'Anexo', andar: 'Térreo' },
];

const onConfirmado = vi.fn();
const onDesatualizado = vi.fn();

function montar(props: Partial<React.ComponentProps<typeof CartaoResumo>> = {}) {
  return render(
    <UnidadesProvider unidades={UNIDADES}>
      <CartaoResumo
        mensagemId={CARTAO_ID}
        conversaId={CONVERSA_ID}
        cartao={CARTAO_IA}
        atual
        aguardandoResposta={false}
        onConfirmado={onConfirmado}
        onDesatualizado={onDesatualizado}
        {...props}
      />
    </UnidadesProvider>,
  );
}

const botaoConfirmar = () => screen.getByRole('button', { name: /confirmar e abrir chamado/i });

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirmar.mockResolvedValue({ ok: true, chamadoId: 'c1', ticketNumber: '2026-0001' });
});

// ── modo ia · AC-5, AC-6, AC-10 ──────────────────────────────────

describe('CartaoResumo · modo ia', () => {
  it('mostra o serviço, o subtipo, a unidade do perfil, o local e o aviso da descrição', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByRole('heading', { name: 'Resumo do chamado' })).toBeInTheDocument();
    expect(screen.getByText('Troca de lâmpada')).toBeInTheDocument();
    expect(screen.getByText('Iluminação · Manutenção Predial')).toBeInTheDocument();
    expect(screen.getByLabelText(/local exato/i)).toHaveValue('Sala 302');
    expect(screen.getByRole('combobox', { name: /unidade/i })).toHaveTextContent('Fórum Central');
    expect(screen.getByText(/vira a descrição do chamado/i)).toBeInTheDocument();
  });

  it('não mostra confiança, motivo nem prioridade', () => {
    // Act
    const { container } = montar();

    // Assert
    expect(container.textContent).not.toMatch(/confiança|motivo|prioridade/i);
  });

  it('não deixa editar o serviço: quem quer outro, conta na conversa', () => {
    // Act
    montar();

    // Assert
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText(/conte na conversa o que mudou/i)).toBeInTheDocument();
  });

  it('confirma com a conversa, o cartão, a unidade e o local, sem tipo', async () => {
    // Arrange
    const user = userEvent.setup();
    montar();

    // Act
    await user.clear(screen.getByLabelText(/local exato/i));
    await user.type(screen.getByLabelText(/local exato/i), '  Sala 302, fundo  ');
    await user.click(botaoConfirmar());

    // Assert
    expect(mockConfirmar).toHaveBeenCalledWith({
      conversaId: CONVERSA_ID,
      cartaoId: CARTAO_ID,
      unitId: UNIDADE_ID,
      localExato: 'Sala 302, fundo',
    });
    expect(onConfirmado).toHaveBeenCalledTimes(1);
  });

  it('com local vazio, mostra o erro ligado ao campo e não confirma', async () => {
    // Arrange
    const user = userEvent.setup();
    montar();

    // Act
    await user.clear(screen.getByLabelText(/local exato/i));
    await user.click(botaoConfirmar());

    // Assert
    const campo = screen.getByLabelText(/local exato/i);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Informe o local exato');
    expect(campo).toHaveFocus();
    expect(mockConfirmar).not.toHaveBeenCalled();
  });
});

// ── modo manual e unidade obrigatória · AC-6, AC-9 ───────────────

describe('CartaoResumo · modo manual', () => {
  it('pede o tipo entre as três opções', () => {
    // Act
    montar({ cartao: CARTAO_MANUAL });

    // Assert
    const grupo = screen.getByRole('radiogroup', { name: /tipo de serviço/i });
    expect(grupo).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual([
      'Manutenção Predial',
      'Ar-Condicionado',
      'Elevador',
    ]);
  });

  it('sem tipo, mostra o erro ligado ao grupo e leva o foco à primeira opção', async () => {
    // Arrange
    const user = userEvent.setup();
    montar({ cartao: CARTAO_MANUAL });

    // Act
    await user.click(botaoConfirmar());

    // Assert
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription('Escolha o tipo de serviço');
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    expect(mockConfirmar).not.toHaveBeenCalled();
  });

  it('sem unidade no perfil, a unidade é obrigatória', async () => {
    // Arrange
    const user = userEvent.setup();
    montar({ cartao: CARTAO_MANUAL });

    // Act
    await user.click(screen.getByRole('radio', { name: /elevador/i }));
    await user.type(screen.getByLabelText(/local exato/i), 'Hall');
    await user.click(botaoConfirmar());

    // Assert
    const unidade = screen.getByRole('combobox', { name: /unidade/i });
    expect(unidade).toHaveAttribute('aria-invalid', 'true');
    expect(unidade).toHaveAccessibleDescription('Escolha a unidade');
    expect(mockConfirmar).not.toHaveBeenCalled();
  });

  it('manda o tipo escolhido junto na confirmação', async () => {
    // Arrange
    const user = userEvent.setup();
    montar({
      cartao: { ...CARTAO_MANUAL, unidade: CARTAO_IA.unidade, faltando: ['tipo', 'local'] },
    });

    // Act
    await user.click(screen.getByRole('radio', { name: /elevador/i }));
    await user.type(screen.getByLabelText(/local exato/i), 'Hall');
    await user.click(botaoConfirmar());

    // Assert
    expect(mockConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoServico: 'Elevador', unitId: UNIDADE_ID, localExato: 'Hall' }),
    );
  });
});

// ── estados · AC-12, AC-18 ───────────────────────────────────────

describe('CartaoResumo · estados', () => {
  it('cartão substituído: marca em texto, sem campos e sem botão', () => {
    // Act
    montar({ atual: false });

    // Assert
    expect(screen.getByText('Substituído')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Sala 302')).toBeInTheDocument();
  });

  it('com a resposta do assistente chegando, confirmar espera e diz por quê', () => {
    // Act
    montar({ aguardandoResposta: true });

    // Assert
    expect(botaoConfirmar()).toBeDisabled();
    expect(botaoConfirmar()).toHaveAccessibleDescription(
      'Espere o assistente terminar de responder para confirmar.',
    );
  });

  it('enquanto confirma, o botão diz que está abrindo e não aceita segundo clique', async () => {
    // Arrange
    const user = userEvent.setup();
    let resolver: (v: unknown) => void = () => undefined;
    mockConfirmar.mockReturnValue(new Promise((r) => (resolver = r)));
    montar();

    // Act
    await user.click(botaoConfirmar());

    // Assert
    const botao = screen.getByRole('button', { name: /abrindo o chamado/i });
    expect(botao).toBeDisabled();
    await user.click(botao);
    expect(mockConfirmar).toHaveBeenCalledTimes(1);
    resolver({ ok: true, chamadoId: 'c1', ticketNumber: '1' });
  });

  it('cartão desatualizado: mostra a frase como alerta e avisa a tela', async () => {
    // Arrange
    const user = userEvent.setup();
    mockConfirmar.mockResolvedValue({ ok: false, reason: 'cartao_desatualizado' });
    montar();

    // Act
    await user.click(botaoConfirmar());

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      CONFIRMACAO_FRASES.cartao_desatualizado,
    );
    expect(onDesatualizado).toHaveBeenCalledTimes(1);
    expect(onConfirmado).not.toHaveBeenCalled();
  });

  it('nenhum motivo aparece cru na tela', async () => {
    // Arrange
    const user = userEvent.setup();
    mockConfirmar.mockResolvedValue({ ok: false, reason: 'dados_invalidos' });
    montar();

    // Act
    await user.click(botaoConfirmar());

    // Assert
    const alerta = await screen.findByRole('alert');
    expect(alerta).not.toHaveTextContent('dados_invalidos');
    expect(alerta).toHaveTextContent(CONFIRMACAO_FRASES.dados_invalidos);
  });

  it('todo alvo tem no mínimo 44 pixels (h-11)', () => {
    // Act
    montar({ cartao: CARTAO_MANUAL });

    // Assert
    expect(botaoConfirmar().className).toContain('h-11');
    expect(screen.getByLabelText(/local exato/i).className).toContain('h-11');
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.closest('label')?.className).toContain('min-h-11');
    }
  });
});
