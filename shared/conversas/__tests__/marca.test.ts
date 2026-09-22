import { describe, expect, it } from 'vitest';

import { MARCA_CHAT, MARCA_CHAT_IA, marcaDeAbertura } from '../marca';

/**
 * A marca do chamado aberto pela conversa (spec 0004).
 *
 * covers: AC-15 (marca com e sem serviço sugerido, nada no formulário)
 */

describe('marcaDeAbertura', () => {
  it('chamado do chat com decisão de serviço', () => {
    expect(marcaDeAbertura('chat', true)).toBe('Aberto pelo chat · serviço sugerido pela IA');
    expect(MARCA_CHAT_IA).toContain(MARCA_CHAT);
  });

  it('chamado do chat sem decisão de serviço', () => {
    expect(marcaDeAbertura('chat', false)).toBe('Aberto pelo chat');
  });

  it('chamado do formulário, ou antigo sem canal, não tem marca', () => {
    expect(marcaDeAbertura('formulario', true)).toBeNull();
    expect(marcaDeAbertura(null, false)).toBeNull();
    expect(marcaDeAbertura(undefined, undefined)).toBeNull();
  });

  it('nunca fala de prioridade, confiança ou motivo', () => {
    expect(`${MARCA_CHAT} ${MARCA_CHAT_IA}`).not.toMatch(/prioridade|confiança|motivo/i);
  });
});
