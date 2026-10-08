// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// jsdom não implementa ResizeObserver; o ScrollArea/Tabs do Radix precisam dele pra montar.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class StubResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = StubResizeObserver;
}

/**
 * O botão "Corrigir Prioridade" (spec 0007, AC-11, AC-12) e o selo "Validado
 * automaticamente pela IA" (AC-15) no painel de detalhe da gestão. A lógica
 * do próprio selo já tem teste em `components/chamado/__tests__/SeloValidadoIa.test.tsx`;
 * aqui confere só a fiação: quando o painel mostra o selo e o botão.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../CotacaoApprovalCard', () => ({ CotacaoApprovalCard: () => null }));
// `CommentThread`/`HistoryTimeline`/`AttachmentGallery` só montam nas outras
// abas (a inicial é `detalhes`), mas o import estático deles já puxa módulos
// de servidor (`next/server`, `lib/db.ts`) que não rodam fora do Next. Mocka
// os três direto: nada deles é exercitado por este arquivo.
vi.mock('@/app/(dashboard)/meus-chamados/[id]/_components/CommentThread', () => ({
  CommentThread: () => null,
}));
vi.mock('@/app/(dashboard)/meus-chamados/[id]/_components/HistoryTimeline', () => ({
  HistoryTimeline: () => null,
}));
vi.mock('@/app/(dashboard)/meus-chamados/[id]/_components/AttachmentGallery', () => ({
  AttachmentGallery: () => null,
}));
// `RevisaoIaPainel` (spec 0009) chama `confirmarDecisoesIaAction`, cujo módulo
// puxa `lib/db.ts` na importação. Tem teste próprio em `RevisaoIaPainel.test.tsx`.
vi.mock('../RevisaoIaPainel', () => ({ RevisaoIaPainel: () => null }));
// A seção de custo (spec 0018) chama Server Actions, cujo módulo puxa `lib/dal`.
vi.mock('../CustoChamadoSecao', () => ({
  CustoChamadoSecao: () => <section aria-label="Custo do chamado" />,
}));

import type { ChamadoDTO } from '../../../meus-chamados/_components/ChamadoCard';
import { ChamadoDetailSheet } from '../ChamadoDetailSheet';

function chamado(overrides: Partial<ChamadoDTO> = {}): ChamadoDTO {
  return {
    _id: 'a'.repeat(24),
    ticket_number: 'CHM-2026-00001',
    titulo: 'Lâmpada queimada',
    descricao: 'A lâmpada da sala 302 queimou.',
    status: 'validado',
    solicitanteId: null,
    unitId: null,
    assignedToUserId: null,
    assignedToUserName: null,
    localExato: 'Sala 302',
    tipoServico: 'Manutenção Predial',
    naturezaAtendimento: 'Padrão',
    grauUrgencia: 'Normal',
    telefoneContato: '',
    subtypeId: null,
    catalogServiceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ChamadoDetailSheet · Corrigir Prioridade (AC-11; janela alargada e papel pela spec 0009, AC-7, AC-10)', () => {
  it('mostra o botão quando validado, sem técnico atribuído e o gestor pode corrigir', () => {
    const onCorrigirPrioridade = vi.fn();
    render(
      <ChamadoDetailSheet
        chamado={chamado()}
        open
        onOpenChange={vi.fn()}
        onCorrigirPrioridade={onCorrigirPrioridade}
        userRole="Preposto"
      />,
    );

    expect(screen.getByRole('button', { name: /Corrigir Prioridade/i })).toBeInTheDocument();
  });

  it('mostra o botão mesmo com técnico atribuído — quem trava a descida é o papel, não a visibilidade (spec 0009, AC-7, revoga o AC-12 da 0007)', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ assignedToUserId: 'b'.repeat(24), assignedToUserName: 'João Técnico' })}
        open
        onOpenChange={vi.fn()}
        onCorrigirPrioridade={vi.fn()}
        userRole="Preposto"
      />,
    );

    expect(screen.getByRole('button', { name: /Corrigir Prioridade/i })).toBeInTheDocument();
  });

  it('mostra o botão também em atendimento — a janela alargou (spec 0009, AC-7)', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ status: 'em atendimento' })}
        open
        onOpenChange={vi.fn()}
        onCorrigirPrioridade={vi.fn()}
        userRole="Preposto"
      />,
    );

    expect(screen.getByRole('button', { name: /Corrigir Prioridade/i })).toBeInTheDocument();
  });

  it('esconde o botão fora da janela (aberto, ainda não classificado)', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ status: 'aberto' })}
        open
        onOpenChange={vi.fn()}
        onCorrigirPrioridade={vi.fn()}
        userRole="Preposto"
      />,
    );

    expect(screen.queryByRole('button', { name: /Corrigir Prioridade/i })).not.toBeInTheDocument();
  });

  it('esconde o botão para quem não é Preposto/Admin', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado()}
        open
        onOpenChange={vi.fn()}
        onCorrigirPrioridade={vi.fn()}
        userRole="Solicitante"
      />,
    );

    expect(screen.queryByRole('button', { name: /Corrigir Prioridade/i })).not.toBeInTheDocument();
  });

  it('esconde o botão quando nenhum onCorrigirPrioridade foi passado', () => {
    render(<ChamadoDetailSheet chamado={chamado()} open onOpenChange={vi.fn()} userRole="Admin" />);

    expect(screen.queryByRole('button', { name: /Corrigir Prioridade/i })).not.toBeInTheDocument();
  });

  it('clicar no botão fecha o painel e aciona onCorrigirPrioridade com o chamado', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCorrigirPrioridade = vi.fn();
    const c = chamado();

    render(
      <ChamadoDetailSheet
        chamado={c}
        open
        onOpenChange={onOpenChange}
        onCorrigirPrioridade={onCorrigirPrioridade}
        userRole="Preposto"
      />,
    );

    await user.click(screen.getByRole('button', { name: /Corrigir Prioridade/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(onCorrigirPrioridade).toHaveBeenCalledWith(c));
  });
});

describe('ChamadoDetailSheet · selo "Validado automaticamente pela IA" (AC-15)', () => {
  it('mostra o selo quando validadoPelaIa é true, mesmo depois de uma correção de prioridade', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ validadoPelaIa: true })}
        open
        onOpenChange={vi.fn()}
        userRole="Preposto"
      />,
    );

    expect(screen.getByText('Validado automaticamente pela IA')).toBeInTheDocument();
  });

  it('não mostra o selo quando o chamado não nasceu validado pela IA', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ validadoPelaIa: false })}
        open
        onOpenChange={vi.fn()}
        userRole="Preposto"
      />,
    );

    expect(screen.queryByText('Validado automaticamente pela IA')).not.toBeInTheDocument();
  });
});

describe('ChamadoDetailSheet · atribuição automática (spec 0008, AC-15, AC-16)', () => {
  const atribuido = {
    resultado: 'atribuido' as const,
    motivo: null,
    tecnicoNome: 'Carla',
    em: '2026-09-25T15:00:00.000Z',
  };
  const semTecnico = {
    resultado: 'sem_tecnico' as const,
    motivo: 'sem_vaga' as const,
    tecnicoNome: null,
    em: '2026-09-25T15:00:00.000Z',
  };

  function abrir(dto: ChamadoDTO, userRole: string | null) {
    render(<ChamadoDetailSheet chamado={dto} open onOpenChange={vi.fn()} userRole={userRole} />);
  }

  it('atribuído: o Preposto lê "Atribuído automaticamente a Fulano"', () => {
    abrir(chamado({ status: 'em atendimento', atribuicaoAutomatica: atribuido }), 'Preposto');

    expect(screen.getByText('Atribuição automática')).toBeInTheDocument();
    expect(screen.getByText('Atribuído automaticamente a Carla')).toBeInTheDocument();
  });

  it('mostra o técnico que a regra escolheu, mesmo que o Preposto tenha trocado depois', () => {
    abrir(
      chamado({
        status: 'em atendimento',
        assignedToUserId: 'b'.repeat(24),
        assignedToUserName: 'Diego',
        atribuicaoAutomatica: atribuido,
      }),
      'Admin',
    );

    expect(screen.getByText('Atribuído automaticamente a Carla')).toBeInTheDocument();
    expect(screen.getByText('Diego')).toBeInTheDocument();
  });

  it.each([
    ['sem_especialidade', 'Sem técnico automático: nenhum técnico ativo com a especialidade'],
    ['sem_vaga', 'Sem técnico automático: todos os técnicos no limite de carga'],
    ['erro', 'Sem técnico automático: falha na atribuição automática'],
  ] as const)('sem técnico por %s: o detalhe mostra o motivo em português', (motivo, texto) => {
    abrir(chamado({ atribuicaoAutomatica: { ...semTecnico, motivo } }), 'Preposto');

    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it('o detalhe continua mostrando o motivo depois que o Preposto atribui à mão', () => {
    abrir(
      chamado({
        status: 'em atendimento',
        assignedToUserId: 'b'.repeat(24),
        assignedToUserName: 'Diego',
        atribuicaoAutomatica: semTecnico,
      }),
      'Preposto',
    );

    expect(
      screen.getByText('Sem técnico automático: todos os técnicos no limite de carga'),
    ).toBeInTheDocument();
  });

  it('chamado sem o campo (formulário, desligado) não mostra a linha', () => {
    abrir(chamado(), 'Preposto');

    expect(screen.queryByText('Atribuição automática')).not.toBeInTheDocument();
  });

  it.each(['Solicitante', 'Técnico', null])(
    'nunca mostra o resultado nem o motivo para %s, mesmo que o dado chegue por engano (AC-16)',
    (papel) => {
      abrir(chamado({ atribuicaoAutomatica: semTecnico }), papel);

      expect(screen.queryByText('Atribuição automática')).not.toBeInTheDocument();
      expect(screen.queryByText(/Sem técnico automático/)).not.toBeInTheDocument();
      expect(screen.queryByText(/limite de carga/)).not.toBeInTheDocument();
    },
  );
});

/**
 * O equipamento no painel (spec 0011, AC-16): o controle de vincular só
 * aparece quando a tela passa `onVincularAtivo` (só a gestão passa), nunca
 * pelo `isManager`, e nunca em chamado encerrado, cancelado ou recusado.
 */
describe('ChamadoDetailSheet · equipamento (spec 0011, AC-16)', () => {
  const ativo = { id: 'b'.repeat(24), codigo: '11997', descricao: 'Split 12000' };

  it('sem onVincularAtivo só mostra o equipamento, mesmo com userRole null', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ ativo })}
        open
        onOpenChange={vi.fn()}
        userRole={null}
      />,
    );
    expect(screen.getByRole('link', { name: '11997' })).toHaveAttribute(
      'href',
      `/ativos/${ativo.id}`,
    );
    expect(screen.queryByRole('button', { name: /^(Trocar|Vincular)$/ })).not.toBeInTheDocument();
  });

  it('com onVincularAtivo e chamado aberto, oferece trocar', () => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ ativo })}
        open
        onOpenChange={vi.fn()}
        onVincularAtivo={vi.fn()}
        userRole="Preposto"
      />,
    );
    expect(screen.getByRole('button', { name: /Trocar/ })).toBeInTheDocument();
  });

  it.each(['encerrado', 'cancelado', 'recusado'] as const)(
    'chamado %s não oferece vincular',
    (status) => {
      render(
        <ChamadoDetailSheet
          chamado={chamado({ ativo, status })}
          open
          onOpenChange={vi.fn()}
          onVincularAtivo={vi.fn()}
          userRole="Admin"
        />,
      );
      expect(screen.getByText('11997')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^(Trocar|Vincular)$/ })).not.toBeInTheDocument();
    },
  );

  it('remover repassa o chamado e null', async () => {
    const user = userEvent.setup();
    const onVincularAtivo = vi.fn().mockResolvedValue({ ok: true });
    const c = chamado({ ativo });
    render(
      <ChamadoDetailSheet
        chamado={c}
        open
        onOpenChange={vi.fn()}
        onVincularAtivo={onVincularAtivo}
        userRole="Admin"
      />,
    );
    await user.click(screen.getByRole('button', { name: /Trocar/ }));
    await user.click(screen.getByRole('button', { name: 'Remover equipamento' }));
    await waitFor(() => expect(onVincularAtivo).toHaveBeenCalledWith(c, null));
  });
});

describe('ChamadoDetailSheet · seção Custo (spec 0018, AC-18)', () => {
  it.each(['Admin', 'Preposto'])('%s com o callback vê a seção', (role) => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ status: 'em atendimento' })}
        open
        onOpenChange={vi.fn()}
        onCustoAlterado={vi.fn()}
        userRole={role}
      />,
    );
    expect(screen.getByRole('region', { name: 'Custo do chamado' })).toBeInTheDocument();
  });

  it.each(['Técnico', 'Solicitante'])('%s nunca vê a seção, mesmo com o callback', (role) => {
    render(
      <ChamadoDetailSheet
        chamado={chamado({ status: 'em atendimento' })}
        open
        onOpenChange={vi.fn()}
        onCustoAlterado={vi.fn()}
        userRole={role}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Custo do chamado' })).not.toBeInTheDocument();
  });

  it('sem o callback a seção não aparece', () => {
    render(<ChamadoDetailSheet chamado={chamado()} open onOpenChange={vi.fn()} userRole="Admin" />);
    expect(screen.queryByRole('region', { name: 'Custo do chamado' })).not.toBeInTheDocument();
  });
});
