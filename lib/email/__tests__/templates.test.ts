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

  it('sem jaValidado, sem número e sem título: o texto de abertura continua inteiro', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      { ...BASE, ticketNumber: undefined, title: undefined },
      'Ana',
    );

    // Assert
    expect(email.subject).toContain('Novo chamado aberto');
    expect(email.subject).not.toContain('#');
    expect(email.html).toContain('Um novo chamado foi aberto.');
    expect(email.html).not.toContain('undefined');
  });

  it('com jaValidado, avisa que já foi validado automaticamente (AC-13)', () => {
    const email = renderNotificationEmail('ticket:new', { ...BASE, jaValidado: true }, 'Ana');

    expect(email.subject).toBe('Chamado #CHM-2026-00001 validado automaticamente');
    expect(email.html).toContain('validado automaticamente pela IA');
    expect(email.html).toContain('falta atribuir um técnico');
  });
});

/**
 * O texto do e-mail com o resultado da atribuição automática (spec 0008, AC-11
 * e AC-13): a gestão lê quem recebeu, ou por que ninguém recebeu, e o técnico
 * lê que o chamado foi atribuído automaticamente.
 */

describe('renderNotificationEmail, ticket:new com atribuição automática (spec 0008, AC-13)', () => {
  const validado = { ...BASE, jaValidado: true };

  it('atribuído: diz a quem e não diz que falta atribuir', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      { ...validado, atribuicao: { resultado: 'atribuido', tecnicoNome: 'Carla' } },
      'Ana',
    );

    // Assert
    expect(email.subject).toBe('Chamado #CHM-2026-00001 validado e atribuído a Carla');
    expect(email.html).toContain('foi atribuído a Carla');
    expect(email.html).not.toContain('falta atribuir');
  });

  it('atribuído: o nome do técnico entra escapado no HTML', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      { ...validado, atribuicao: { resultado: 'atribuido', tecnicoNome: '<b>Carla</b> & Cia' } },
      'Ana',
    );

    // Assert
    expect(email.html).toContain('&lt;b&gt;Carla&lt;/b&gt; &amp; Cia');
    expect(email.html).not.toContain('<b>Carla</b>');
  });

  it.each([
    ['sem_especialidade', 'nenhum técnico ativo com a especialidade'],
    ['sem_vaga', 'todos os técnicos no limite de carga'],
    ['erro', 'falha na atribuição automática'],
  ] as const)('sem técnico por %s: assunto e motivo em português', (motivo, texto) => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      { ...validado, atribuicao: { resultado: 'sem_tecnico', motivo } },
      'Ana',
    );

    // Assert
    expect(email.subject).toBe('Chamado #CHM-2026-00001 validado, sem técnico disponível');
    expect(email.html).toContain('falta atribuir um técnico');
    expect(email.html).toContain(texto);
  });

  it('sem o resultado, mantém o texto da 0007', () => {
    // Act
    const email = renderNotificationEmail('ticket:new', validado, 'Ana');

    // Assert
    expect(email.subject).toBe('Chamado #CHM-2026-00001 validado automaticamente');
    expect(email.html).toContain('falta atribuir um técnico.');
  });

  it('sem número nem título: o resultado atribuído continua inteiro, sem "undefined"', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      {
        ...validado,
        ticketNumber: undefined,
        title: undefined,
        atribuicao: { resultado: 'atribuido', tecnicoNome: 'Carla' },
      },
      'Ana',
    );

    // Assert
    expect(email.subject).toBe('Chamado validado e atribuído a Carla');
    expect(email.html).toContain('O chamado foi aberto e validado automaticamente pela IA.');
    expect(email.html).toContain('foi atribuído a Carla.');
    expect(email.html).not.toContain('undefined');
  });

  it('sem número nem título: o resultado sem técnico continua inteiro, com o motivo', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      {
        ...validado,
        ticketNumber: undefined,
        title: undefined,
        atribuicao: { resultado: 'sem_tecnico', motivo: 'sem_vaga' },
      },
      'Ana',
    );

    // Assert
    expect(email.subject).toBe('Chamado validado, sem técnico disponível');
    expect(email.html).toContain(
      'falta atribuir um técnico (todos os técnicos no limite de carga).',
    );
    expect(email.html).not.toContain('undefined');
  });

  it('sem número nem título e sem o resultado: o texto da 0007 continua inteiro', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      { ...validado, ticketNumber: undefined, title: undefined },
      'Ana',
    );

    // Assert
    expect(email.subject).toBe('Chamado validado automaticamente');
    expect(email.html).toContain('falta atribuir um técnico.');
  });
});

/**
 * O título do chamado do chat leva o local digitado por quem abriu, e na
 * atribuição automática ele chega ao email do técnico sem um Preposto no meio.
 * Tudo o que entra em HTML é escapado na fronteira do template.
 */

describe('renderNotificationEmail, texto digitado entra escapado no HTML', () => {
  const ATAQUE = '<img src=x onerror="alert(1)"> & <b>x</b>';
  const ATAQUE_ESCAPADO =
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;b&gt;x&lt;/b&gt;';

  it.each([
    ['ticket:new', { ...BASE, jaValidado: true }],
    ['ticket:new', BASE],
    [
      'ticket:new',
      {
        ...BASE,
        jaValidado: true,
        atribuicao: { resultado: 'atribuido' as const, tecnicoNome: 'Carla' },
      },
    ],
    ['ticket:assigned', { ...BASE, assignedTo: { id: 't1', name: 'Carla' } }],
    [
      'ticket:assigned',
      {
        ...BASE,
        assignedTo: { id: 't1', name: 'Carla' },
        assignedBy: { id: 'sistema', name: 'Atribuição automática' },
      },
    ],
  ] as const)('%s: título, número e destinatário nunca entram crus', (tipo, payload) => {
    // Act
    const email = renderNotificationEmail(
      tipo,
      { ...payload, ticketNumber: '<u>1</u>', title: ATAQUE },
      '<script>roubar()</script>',
    );

    // Assert: nada do que foi digitado vira marca de HTML
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<b>x</b>');
    expect(email.html).not.toContain('<u>1</u>');
    expect(email.html).not.toContain('<script>');
    // E o texto continua legível, escapado
    expect(email.html).toContain(ATAQUE_ESCAPADO);
    expect(email.html).toContain('&lt;u&gt;1&lt;/u&gt;');
    expect(email.html).toContain('&lt;script&gt;roubar()&lt;/script&gt;');
  });

  it('o nome do técnico escapado uma vez só, sem "&amp;amp;"', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:new',
      {
        ...BASE,
        jaValidado: true,
        atribuicao: { resultado: 'atribuido', tecnicoNome: 'Carla & Cia' },
      },
      'Ana',
    );

    // Assert
    expect(email.html).toContain('Carla &amp; Cia');
    expect(email.html).not.toContain('&amp;amp;');
  });
});

/**
 * Todo corpo de email termina a frase do título com um ponto. O título do chat
 * carrega o local digitado por quem abriu ("…sala 5."), então um título que já
 * termina em pontuação não pode gerar "5.." no email.
 */

describe('renderNotificationEmail, título que já termina em pontuação', () => {
  const LOCAL = 'Reparo de tomada — Sala 5';
  const TERMINACOES = ['.', '!', '?', '...', '…', ' .', ';', ':', ',', '. ', '.  '];
  const tecnico = { id: 't1', name: 'Carla' };
  const CENARIOS = [
    [
      'ticket:assigned pela gestão',
      'ticket:assigned',
      {
        ...BASE,
        assignedTo: tecnico,
        assignedBy: { id: '6aad5286df6f201a25eda222', name: 'Paulo' },
      },
    ],
    [
      'ticket:assigned automática',
      'ticket:assigned',
      {
        ...BASE,
        assignedTo: tecnico,
        assignedBy: { id: 'sistema', name: 'Atribuição automática' },
      },
    ],
    ['ticket:new sem validação', 'ticket:new', BASE],
    ['ticket:new validado, sem resultado', 'ticket:new', { ...BASE, jaValidado: true }],
    [
      'ticket:new validado e atribuído',
      'ticket:new',
      {
        ...BASE,
        jaValidado: true,
        atribuicao: { resultado: 'atribuido' as const, tecnicoNome: 'Carla' },
      },
    ],
    [
      'ticket:new validado, sem técnico',
      'ticket:new',
      {
        ...BASE,
        jaValidado: true,
        atribuicao: { resultado: 'sem_tecnico' as const, motivo: 'sem_vaga' as const },
      },
    ],
  ] as const;

  it.each(CENARIOS)(
    '%s: o email é o mesmo com ou sem pontuação no fim do título',
    (_nome, tipo, payload) => {
      // Arrange
      const limpo = renderNotificationEmail(tipo, { ...payload, title: LOCAL }, 'Ana').html;

      // Act
      const divergentes = TERMINACOES.filter(
        (fim) =>
          renderNotificationEmail(tipo, { ...payload, title: LOCAL + fim }, 'Ana').html !== limpo,
      );

      // Assert
      expect(divergentes).toEqual([]);
      expect(limpo).not.toContain('5..');
    },
  );

  it('o ponto vai depois de uma aspa escapada sem quebrar a entidade HTML', () => {
    // Act
    const email = renderNotificationEmail('ticket:new', { ...BASE, title: 'Sala "5"' }, 'Ana');

    // Assert: `&quot;` continua inteiro, com o ponto depois dele
    expect(email.html).toContain('Sala &quot;5&quot;.');
    expect(email.html).not.toContain('&quot.');
  });

  it.each(['...', ' . ', '!?'])(
    'título só de pontuação (%j) some, sem deixar ": ." solto',
    (titulo) => {
      // Act
      const email = renderNotificationEmail('ticket:new', { ...BASE, title: titulo }, 'Ana');

      // Assert
      expect(email.html).toContain('foi aberto.');
      expect(email.html).not.toContain('foi aberto:');
    },
  );
});

describe('renderNotificationEmail, ticket:assigned (spec 0008, AC-11)', () => {
  const atribuido = { ...BASE, assignedTo: { id: 't1', name: 'Carla' } };

  it('atribuição do sistema: diz que foi atribuído automaticamente', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:assigned',
      { ...atribuido, assignedBy: { id: 'sistema', name: 'Atribuição automática' } },
      'Carla',
    );

    // Assert
    expect(email.subject).toBe('Chamado #CHM-2026-00001 atribuído a você automaticamente');
    expect(email.html).toContain('atribuído automaticamente pelo Sigma');
  });

  it('atribuição de um Preposto: o texto de sempre, sem a palavra automaticamente', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:assigned',
      { ...atribuido, assignedBy: { id: '6aad5286df6f201a25eda222', name: 'Paulo' } },
      'Carla',
    );

    // Assert
    expect(email.subject).toBe('Chamado #CHM-2026-00001 atribuído a você');
    // O rodapé fixo do e-mail diz "enviado automaticamente"; o que não pode aparecer é a atribuição.
    expect(email.html).not.toContain('atribuído automaticamente');
  });

  it('automática, sem número nem título: o texto continua inteiro, sem "#" nem "undefined"', () => {
    // Act
    const email = renderNotificationEmail(
      'ticket:assigned',
      {
        ...atribuido,
        ticketNumber: undefined,
        title: undefined,
        assignedBy: { id: 'sistema', name: 'Atribuição automática' },
      },
      'Carla',
    );

    // Assert
    expect(email.subject).toContain('atribuído a você automaticamente');
    expect(email.subject).not.toContain('#');
    expect(email.html).toContain('Você recebeu um novo chamado.');
    expect(email.html).toContain('Ele foi atribuído automaticamente pelo Sigma.');
    expect(email.html).not.toContain('undefined');
  });
});
