import { describe, expect, it } from 'vitest';

import { renderNotificationEmail } from '../templates';

/**
 * Texto do e-mail de `ticket:new` (spec 0007, AC-13): o chamado que já nasce
 * `validado` pela IA não pode dizer só "foi aberto", que sugere triagem.
 */

const BASE = {
  ticketId: '6aad5286df6f201a25edd001',
  ticketNumber: 'CHM-2026-00001',
  title: 'Troca de lâmpada',
  openedBy: { id: '6aad5286df6f201a25eda111' },
  at: '2026-09-24T12:00:00.000Z',
};

describe('renderNotificationEmail, ticket:new', () => {
  it('sem jaValidado, mantém o texto de abertura de sempre', () => {
    const email = renderNotificationEmail('ticket:new', BASE, 'Ana');

    expect(email.subject).toBe('Novo chamado aberto: #CHM-2026-00001');
    expect(email.html).toContain('foi aberto: Troca de lâmpada.');
  });

  it('com jaValidado, avisa que já foi validado automaticamente (AC-13)', () => {
    const email = renderNotificationEmail('ticket:new', { ...BASE, jaValidado: true }, 'Ana');

    expect(email.subject).toBe('Chamado #CHM-2026-00001 validado automaticamente');
    expect(email.html).toContain('validado automaticamente pela IA');
    expect(email.html).toContain('falta atribuir um técnico');
  });
});
