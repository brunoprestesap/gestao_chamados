// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Composer } from '../Composer';

/**
 * A caixa de mensagem (spec 0003). Enter envia, Shift e Enter quebram a linha,
 * os dois contadores ficam à vista, e no teto a caixa dá lugar ao formulário.
 *
 * covers: AC-9 (contadores e teto), AC-8 (rótulo, nome acessível, erro ligado
 * ao campo)
 */

function montar(over: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onEnviar = vi.fn();
  const onTexto = vi.fn();
  render(
    <Composer
      texto=""
      onTexto={onTexto}
      placeholder="Descreva o problema"
      enviando={false}
      contagem={2}
      mensagensMax={30}
      noLimite={false}
      onEnviar={onEnviar}
      {...over}
    />,
  );
  return { onEnviar, onTexto };
}

const campo = () => screen.getByRole('textbox', { name: /mensagem para o assistente/i });

// ── o que a pessoa vê · AC-9 ─────────────────────────────────────

describe('Composer · contadores', () => {
  it('mostra quantas mensagens já foram e qual é o teto', () => {
    // Act
    montar({ contagem: 4 });

    // Assert
    expect(screen.getByText(/4 de 30 mensagens/)).toBeInTheDocument();
  });

  it('conta os caracteres do que está escrito, contra 2.000', () => {
    // Act
    montar({ texto: 'doze chars!!' });

    // Assert
    expect(screen.getByText(/12 \/ 2\.000/)).toBeInTheDocument();
  });

  it('escreve o teto com separador de milhar, como se escreve em português', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByText(/2\.000/)).toBeInTheDocument();
  });

  it('explica como enviar e como quebrar a linha', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByText(/Enter envia/i)).toBeInTheDocument();
  });
});

// ── enviar · AC-9 ────────────────────────────────────────────────

describe('Composer · envio', () => {
  it('envia com Enter', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEnviar } = montar({ texto: 'a lâmpada queimou' });

    // Act
    await user.type(campo(), '{Enter}');

    // Assert
    expect(onEnviar).toHaveBeenCalledWith('a lâmpada queimou');
  });

  it('não envia com Shift e Enter, que é como se quebra a linha', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEnviar } = montar({ texto: 'primeira linha' });

    // Act
    await user.type(campo(), '{Shift>}{Enter}{/Shift}');

    // Assert
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('limpa a caixa depois de enviar, para a próxima mensagem começar do zero', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onTexto } = montar({ texto: 'relato' });

    // Act
    await user.type(campo(), '{Enter}');

    // Assert
    expect(onTexto).toHaveBeenCalledWith('');
  });

  it('não envia caixa vazia nem só com espaço', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEnviar } = montar({ texto: '   ' });

    // Act
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));
    await user.type(campo(), '{Enter}');

    // Assert
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('não envia de novo enquanto a anterior está indo', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEnviar } = montar({ texto: 'relato', enviando: true });

    // Act
    await user.type(campo(), '{Enter}');

    // Assert
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('desabilita o botão de enviar quando não há o que enviar', () => {
    // Act
    montar({ texto: '' });

    // Assert
    expect(screen.getByRole('button', { name: /enviar mensagem/i })).toBeDisabled();
  });

  it('habilita o botão quando há texto', () => {
    // Act
    montar({ texto: 'relato' });

    // Assert
    expect(screen.getByRole('button', { name: /enviar mensagem/i })).toBeEnabled();
  });

  it('repassa cada tecla para quem guarda o texto', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onTexto } = montar();

    // Act
    await user.type(campo(), 'oi');

    // Assert
    expect(onTexto).toHaveBeenCalled();
  });
});

// ── passar do teto de caracteres · AC-9 ──────────────────────────

describe('Composer · texto longo demais', () => {
  it('marca o campo como inválido quando passa de 2.000', () => {
    // Act
    montar({ texto: 'a'.repeat(2001) });

    // Assert
    expect(campo()).toHaveAttribute('aria-invalid', 'true');
  });

  it('barra o envio quando passa do teto', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEnviar } = montar({ texto: 'a'.repeat(2001) });

    // Act
    await user.type(campo(), '{Enter}');

    // Assert
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('deixa passar exatamente no teto', () => {
    // Act
    montar({ texto: 'a'.repeat(2000) });

    // Assert
    expect(campo()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /enviar mensagem/i })).toBeEnabled();
  });
});

// ── teto de mensagens · AC-9 ─────────────────────────────────────

describe('Composer · conversa no limite', () => {
  it('troca a caixa pelo aviso e pelo link do formulário', () => {
    // Act
    montar({ noLimite: true });

    // Assert
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/limite de mensagens/i)).toBeInTheDocument();
  });

  it('o link do formulário leva a Meus Chamados', () => {
    // Act
    montar({ noLimite: true });

    // Assert
    expect(screen.getByRole('link', { name: /abrir por formulário/i })).toHaveAttribute(
      'href',
      '/meus-chamados',
    );
  });
});

// ── acessibilidade · AC-8 ────────────────────────────────────────

describe('Composer · acessibilidade', () => {
  it('a caixa tem rótulo, mesmo sem rótulo visível', () => {
    // Act
    montar();

    // Assert
    expect(campo()).toBeInTheDocument();
  });

  it('o botão só de ícone tem nome acessível', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeInTheDocument();
  });

  it('liga o contador ao campo, para o leitor de tela anunciar o limite', () => {
    // Act
    montar({ texto: 'oi' });

    // Assert
    const descrito = campo().getAttribute('aria-describedby');
    expect(descrito).toBeTruthy();
    expect(document.getElementById(descrito as string)?.textContent).toMatch(/2 \/ 2\.000/);
  });

  it('o marcador de texto não é o único rótulo do campo', () => {
    // Act
    montar({ placeholder: 'Descreva o problema' });

    // Assert: o rótulo existe além do placeholder
    expect(campo()).toHaveAccessibleName(/mensagem para o assistente/i);
  });
});
