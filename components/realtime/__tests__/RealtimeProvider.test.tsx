// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Os avisos ao vivo (spec 0008, AC-11 e AC-13): o técnico lê "atribuído a você
 * automaticamente" e a gestão lê o resultado da atribuição no `ticket:new`. O
 * socket é falso: os eventos são disparados à mão nos ouvintes registrados.
 */

const ouvintes = new Map<string, (payload: unknown) => void>();
const socketFalso = {
  on: (evento: string, ouvinte: (payload: unknown) => void) => {
    ouvintes.set(evento, ouvinte);
  },
  disconnect: vi.fn(),
};
vi.mock('socket.io-client', () => ({ io: () => socketFalso }));

const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    info: (...args: unknown[]) => toastInfo(...args),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => routerPush(...args) }),
}));
vi.mock('@/lib/notification-sound', () => ({ playNotificationSound: vi.fn() }));

import { RealtimeProvider } from '../RealtimeProvider';

const TECNICO_ID = '6aad5286df6f201a25eda333';
const SOLICITANTE_ID = '6aad5286df6f201a25eda111';
const PREPOSTO_ID = '6aad5286df6f201a25eda222';

function montar(userId: string) {
  render(
    <RealtimeProvider userId={userId}>
      <span>filho</span>
    </RealtimeProvider>,
  );
}

function disparar(evento: string, payload: unknown) {
  const ouvinte = ouvintes.get(evento);
  if (!ouvinte) throw new Error(`sem ouvinte para ${evento}`);
  act(() => ouvinte(payload));
}

/** O toast leva JSX na descrição; monta para ler o texto que a pessoa lê. */
function descricaoDoToast(): void {
  const descricao = toastSuccess.mock.calls.at(-1)?.[1]?.description as ReactNode;
  render(<div data-testid="descricao">{descricao}</div>);
}

/** Mesma ideia, para o toast informativo do ticket:corrected (toast.info). */
function descricaoDoToastInfo(): void {
  const descricao = toastInfo.mock.calls.at(-1)?.[1]?.description as ReactNode;
  render(<div data-testid="descricao-info">{descricao}</div>);
}

const ATRIBUIDO = {
  ticketId: 'c'.repeat(24),
  ticketNumber: 'CHM-2026-00001',
  title: 'Troca de lâmpada — Sala 302',
  assignedTo: { id: TECNICO_ID, name: 'Carla' },
  at: '2026-09-25T15:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  ouvintes.clear();
});

describe('RealtimeProvider · ticket:assigned (spec 0008, AC-11)', () => {
  it('técnico, atribuição automática: "atribuído a você automaticamente", sem "Atribuído por"', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:assigned', {
      ...ATRIBUIDO,
      assignedBy: { id: 'sistema', name: 'Atribuição automática' },
    });

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe(
      'Chamado #CHM-2026-00001 atribuído a você automaticamente',
    );
    descricaoDoToast();
    expect(screen.getByText('Atribuído automaticamente pelo Sigma')).toBeInTheDocument();
    expect(screen.queryByText(/Atribuído por:/)).not.toBeInTheDocument();
  });

  it('técnico, atribuição de um Preposto: o aviso de sempre, inalterado (AC-18)', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:assigned', {
      ...ATRIBUIDO,
      assignedBy: { id: PREPOSTO_ID, name: 'Paulo' },
    });

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe('Novo chamado #CHM-2026-00001 atribuído a você');
    descricaoDoToast();
    expect(screen.getByText('Atribuído por: Paulo')).toBeInTheDocument();
  });

  it('solicitante: o mesmo evento vira "Técnico atribuído", com o nome do técnico (spec 0005)', () => {
    // Arrange
    montar(SOLICITANTE_ID);

    // Act
    disparar('ticket:assigned', {
      ...ATRIBUIDO,
      assignedBy: { id: 'sistema', name: 'Atribuição automática' },
    });

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe('Técnico atribuído ao chamado #CHM-2026-00001');
    descricaoDoToast();
    expect(screen.getByText('Técnico responsável: Carla')).toBeInTheDocument();
  });

  it('técnico: o botão Abrir do toast automático leva ao chamado atribuído', () => {
    // Arrange
    montar(TECNICO_ID);
    disparar('ticket:assigned', {
      ...ATRIBUIDO,
      assignedBy: { id: 'sistema', name: 'Atribuição automática' },
    });
    const acao = toastSuccess.mock.calls[0][1].action;

    // Act
    acao.onClick();

    // Assert
    expect(acao.label).toBe('Abrir');
    expect(routerPush).toHaveBeenCalledExactlyOnceWith(
      `/chamados-atribuidos/${ATRIBUIDO.ticketId}`,
    );
  });

  it('técnico, atribuição automática sem número do chamado: o título sai sem espaço duplo', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:assigned', {
      ...ATRIBUIDO,
      ticketNumber: undefined,
      assignedBy: { id: 'sistema', name: 'Atribuição automática' },
    });

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe('Chamado atribuído a você automaticamente');
  });

  it('aviso antigo, sem autor no payload: cai no texto de Preposto e não quebra', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:assigned', ATRIBUIDO);

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe('Novo chamado #CHM-2026-00001 atribuído a você');
    descricaoDoToast();
    expect(screen.getByText('Atribuído por: Preposto')).toBeInTheDocument();
    expect(screen.queryByText(/automaticamente/)).not.toBeInTheDocument();
  });
});

describe('RealtimeProvider · ticket:new (spec 0008, AC-13)', () => {
  const NOVO = {
    ticketId: 'c'.repeat(24),
    ticketNumber: 'CHM-2026-00001',
    title: 'Troca de lâmpada — Sala 302',
    openedBy: { id: SOLICITANTE_ID, name: 'Maria' },
    at: '2026-09-25T15:00:00.000Z',
  };

  it('validado e atribuído: o título diz a quem', () => {
    // Arrange
    montar(PREPOSTO_ID);

    // Act
    disparar('ticket:new', {
      ...NOVO,
      jaValidado: true,
      atribuicao: { resultado: 'atribuido', tecnicoNome: 'Carla' },
    });

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe(
      'Chamado #CHM-2026-00001 validado e atribuído a Carla',
    );
  });

  it.each([
    ['sem_especialidade', 'Motivo: nenhum técnico ativo com a especialidade'],
    ['sem_vaga', 'Motivo: todos os técnicos no limite de carga'],
    ['erro', 'Motivo: falha na atribuição automática'],
  ] as const)('validado sem técnico por %s: título e motivo em português', (motivo, texto) => {
    // Arrange
    montar(PREPOSTO_ID);

    // Act
    disparar('ticket:new', {
      ...NOVO,
      jaValidado: true,
      atribuicao: { resultado: 'sem_tecnico', motivo },
    });

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe(
      'Chamado #CHM-2026-00001 validado, sem técnico disponível',
    );
    descricaoDoToast();
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it('sem o número do chamado, o título sai sem espaço duplo, em cada resultado', () => {
    // Arrange
    montar(PREPOSTO_ID);
    const semNumero = { ...NOVO, ticketNumber: undefined, jaValidado: true };

    // Act
    disparar('ticket:new', {
      ...semNumero,
      atribuicao: { resultado: 'atribuido', tecnicoNome: 'Carla' },
    });
    disparar('ticket:new', {
      ...semNumero,
      atribuicao: { resultado: 'sem_tecnico', motivo: 'sem_vaga' },
    });
    disparar('ticket:new', semNumero);

    // Assert
    expect(toastSuccess.mock.calls.map((c) => c[0])).toEqual([
      'Chamado validado e atribuído a Carla',
      'Chamado validado, sem técnico disponível',
      'Chamado validado automaticamente',
    ]);
  });

  it('sem o resultado (passo desligado ou não tentado): o texto da 0007', () => {
    // Arrange
    montar(PREPOSTO_ID);

    // Act
    disparar('ticket:new', { ...NOVO, jaValidado: true });

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe('Chamado #CHM-2026-00001 validado automaticamente');
    descricaoDoToast();
    expect(screen.queryByText(/Motivo:/)).not.toBeInTheDocument();
  });

  it('chamado aberto comum: o texto de sempre', () => {
    // Arrange
    montar(PREPOSTO_ID);

    // Act
    disparar('ticket:new', NOVO);

    // Assert
    expect(toastSuccess.mock.calls[0][0]).toBe('Novo chamado #CHM-2026-00001 aberto');
  });
});

describe('RealtimeProvider · ticket:corrected (spec 0009, AC-14)', () => {
  const CORRIGIDO = {
    ticketId: 'c'.repeat(24),
    ticketNumber: 'CHM-2026-00001',
    title: 'Troca de lâmpada — Sala 302',
    campo: 'prioridade' as const,
    finalPriority: 'ALTA' as const,
    correctedBy: { id: PREPOSTO_ID, name: 'Paulo' },
    at: '2026-09-25T15:00:00.000Z',
  };

  it('prioridade: o título diz o rótulo da prioridade nova', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:corrected', CORRIGIDO);

    // Assert
    expect(toastInfo.mock.calls[0][0]).toBe(
      'Prioridade do chamado #CHM-2026-00001 mudou para Alta',
    );
  });

  it('serviço: o título não leva prioridade nenhuma', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:corrected', { ...CORRIGIDO, campo: 'servico', finalPriority: undefined });

    // Assert
    expect(toastInfo.mock.calls[0][0]).toBe('O serviço do chamado #CHM-2026-00001 mudou');
  });

  it('mostra o título do chamado e quem corrigiu, nunca o motivo', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:corrected', CORRIGIDO);

    // Assert
    descricaoDoToastInfo();
    expect(screen.getByText('Troca de lâmpada — Sala 302')).toBeInTheDocument();
    expect(screen.getByText('Corrigido por: Paulo')).toBeInTheDocument();
    expect(screen.queryByText(/[Mm]otivo/)).not.toBeInTheDocument();
  });

  it('sem correctedBy.name, cai no texto genérico "Preposto"', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:corrected', { ...CORRIGIDO, correctedBy: { id: PREPOSTO_ID } });

    // Assert
    descricaoDoToastInfo();
    expect(screen.getByText('Corrigido por: Preposto')).toBeInTheDocument();
  });

  it('o botão Abrir leva ao chamado do técnico, não à conversa do solicitante', () => {
    // Arrange
    montar(TECNICO_ID);
    disparar('ticket:corrected', CORRIGIDO);
    const acao = toastInfo.mock.calls[0][1].action;

    // Act
    acao.onClick();

    // Assert
    expect(acao.label).toBe('Abrir');
    expect(routerPush).toHaveBeenCalledExactlyOnceWith(
      `/chamados-atribuidos/${CORRIGIDO.ticketId}`,
    );
  });

  it('sem número do chamado, o título não deixa espaço duplo', () => {
    // Arrange
    montar(TECNICO_ID);

    // Act
    disparar('ticket:corrected', { ...CORRIGIDO, ticketNumber: undefined });

    // Assert
    expect(toastInfo.mock.calls[0][0]).toBe('Prioridade do chamado mudou para Alta');
  });
});
