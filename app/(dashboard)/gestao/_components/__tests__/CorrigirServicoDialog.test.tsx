// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A correção de serviço (spec 0009, AC-11): tipo → subtipo → serviço em
 * cascata, como a classificação já usa, mais o seletor de técnico que
 * aparece quando o serviço muda e o chamado tem técnico atribuído.
 */

const mockCorrigirServicoAction = vi.fn();
vi.mock('@/app/(dashboard)/gestao/actions', () => ({
  corrigirServicoAction: (...args: unknown[]) => mockCorrigirServicoAction(...args),
}));

import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';

import { CorrigirServicoDialog } from '../CorrigirServicoDialog';

const CHAMADO_ID = 'a'.repeat(24);
const OLD_SERVICE_ID = 'b'.repeat(24);
const NEW_SERVICE_ID = 'c'.repeat(24);
const OLD_SUBTYPE_ID = 'd'.repeat(24);
const NEW_SUBTYPE_ID = 'e'.repeat(24);
const TYPE_ID = 'f'.repeat(24);
const OUTRO_TYPE_ID = '1'.repeat(24);
const TECH_ID = '2'.repeat(24);

function chamado(overrides: Partial<ChamadoDTO> = {}): ChamadoDTO {
  return {
    _id: CHAMADO_ID,
    ticket_number: 'CHM-2026-00001',
    titulo: 'Ar-condicionado com defeito',
    descricao: 'Não gela.',
    status: 'validado',
    solicitanteId: null,
    unitId: null,
    assignedToUserId: null,
    localExato: 'Sala 10',
    tipoServico: 'Manutenção Predial',
    naturezaAtendimento: 'Padrão',
    grauUrgencia: 'Normal',
    telefoneContato: '',
    subtypeId: OLD_SUBTYPE_ID,
    catalogServiceId: OLD_SERVICE_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockFetchCatalogo() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/catalog/types')) {
      return {
        ok: true,
        json: async () => ({
          items: [
            { _id: TYPE_ID, name: 'Manutenção Predial' },
            { _id: OUTRO_TYPE_ID, name: 'Ar-Condicionado' },
          ],
        }),
      } as Response;
    }
    if (url.includes('/api/catalog/subtypes')) {
      const typeId = new URL(url, 'http://localhost').searchParams.get('typeId');
      const items =
        typeId === TYPE_ID
          ? [{ _id: OLD_SUBTYPE_ID, name: 'Elétrica' }]
          : [{ _id: NEW_SUBTYPE_ID, name: 'Refrigeração' }];
      return { ok: true, json: async () => ({ items }) } as Response;
    }
    if (url.includes('/api/catalog/services')) {
      const params = new URL(url, 'http://localhost').searchParams;
      const subtypeId = params.get('subtypeId');
      const items =
        subtypeId === OLD_SUBTYPE_ID
          ? [{ _id: OLD_SERVICE_ID, code: 'ELET-001', name: 'Troca de tomada' }]
          : subtypeId === NEW_SUBTYPE_ID
            ? [{ _id: NEW_SERVICE_ID, code: 'AR-001', name: 'Reparo de ar-condicionado' }]
            : [];
      return { ok: true, json: async () => ({ items }) } as Response;
    }
    if (url.includes('/eligible-technicians-reassign')) {
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              _id: TECH_ID,
              name: 'Carlos',
              username: 'carlos',
              currentLoad: 1,
              maxAssignedTickets: 5,
              isOverloaded: false,
            },
          ],
        }),
      } as Response;
    }
    return { ok: true, json: async () => ({ items: [] }) } as Response;
  });
}

describe('CorrigirServicoDialog (spec 0009, AC-11)', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', mockFetchCatalogo());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('pré-preenche tipo, subtipo e serviço a partir do chamado atual', async () => {
    render(
      <CorrigirServicoDialog open onOpenChange={vi.fn()} chamado={chamado()} onSuccess={vi.fn()} />,
    );

    expect(await screen.findByText('Troca de tomada', { exact: false })).toBeInTheDocument();
  });

  it('com o mesmo serviço selecionado, o botão de corrigir fica desabilitado', async () => {
    render(
      <CorrigirServicoDialog open onOpenChange={vi.fn()} chamado={chamado()} onSuccess={vi.fn()} />,
    );

    await screen.findByText('Troca de tomada', { exact: false });
    expect(screen.getByRole('button', { name: 'Corrigir Serviço' })).toBeDisabled();
  });

  it('escolher um serviço diferente habilita o botão e mostra o seletor de técnico', async () => {
    const user = userEvent.setup();
    render(
      <CorrigirServicoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado({ assignedToUserId: TECH_ID })}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByText('Troca de tomada', { exact: false });

    await user.click(screen.getByLabelText('Tipo *'));
    await user.click(await screen.findByRole('option', { name: 'Ar-Condicionado' }));

    await user.click(screen.getByLabelText('Subtipo *'));
    await user.click(await screen.findByRole('option', { name: 'Refrigeração' }));

    await user.click(screen.getByLabelText('Serviço do Catálogo *'));
    await user.click(await screen.findByRole('option', { name: /Reparo de ar-condicionado/ }));

    expect(screen.getByRole('button', { name: 'Corrigir Serviço' })).toBeEnabled();
    expect(await screen.findByRole('radio', { name: /Carlos/ })).toBeInTheDocument();
  });

  it('sem técnico atribuído, nunca mostra o seletor de técnico mesmo trocando o serviço', async () => {
    const user = userEvent.setup();
    render(
      <CorrigirServicoDialog
        open
        onOpenChange={vi.fn()}
        chamado={chamado({ assignedToUserId: null })}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByText('Troca de tomada', { exact: false });
    await user.click(screen.getByLabelText('Tipo *'));
    await user.click(await screen.findByRole('option', { name: 'Ar-Condicionado' }));
    await user.click(screen.getByLabelText('Subtipo *'));
    await user.click(await screen.findByRole('option', { name: 'Refrigeração' }));
    await user.click(screen.getByLabelText('Serviço do Catálogo *'));
    await user.click(await screen.findByRole('option', { name: /Reparo de ar-condicionado/ }));

    expect(screen.queryByRole('radio', { name: /Carlos/ })).not.toBeInTheDocument();
  });

  it('motivo curto: mostra o erro e o botão continua desabilitado', async () => {
    const user = userEvent.setup();
    render(
      <CorrigirServicoDialog open onOpenChange={vi.fn()} chamado={chamado()} onSuccess={vi.fn()} />,
    );

    await screen.findByText('Troca de tomada', { exact: false });
    await user.click(screen.getByLabelText('Tipo *'));
    await user.click(await screen.findByRole('option', { name: 'Ar-Condicionado' }));
    await user.click(screen.getByLabelText('Subtipo *'));
    await user.click(await screen.findByRole('option', { name: 'Refrigeração' }));
    await user.click(screen.getByLabelText('Serviço do Catálogo *'));
    await user.click(await screen.findByRole('option', { name: /Reparo de ar-condicionado/ }));

    await user.type(screen.getByLabelText('Motivo'), 'curto');

    expect(await screen.findByText(/Mínimo 10 caracteres/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corrigir Serviço' })).toBeDisabled();
  });

  it('envia a correção com o serviço e o motivo, e fecha em sucesso', async () => {
    const user = userEvent.setup();
    mockCorrigirServicoAction.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CorrigirServicoDialog
        open
        onOpenChange={onOpenChange}
        chamado={chamado()}
        onSuccess={onSuccess}
      />,
    );

    await screen.findByText('Troca de tomada', { exact: false });
    await user.click(screen.getByLabelText('Tipo *'));
    await user.click(await screen.findByRole('option', { name: 'Ar-Condicionado' }));
    await user.click(screen.getByLabelText('Subtipo *'));
    await user.click(await screen.findByRole('option', { name: 'Refrigeração' }));
    await user.click(screen.getByLabelText('Serviço do Catálogo *'));
    await user.click(await screen.findByRole('option', { name: /Reparo de ar-condicionado/ }));
    await user.type(screen.getByLabelText('Motivo'), 'Ar-condicionado é o problema real');

    await user.click(screen.getByRole('button', { name: 'Corrigir Serviço' }));

    await waitFor(() => {
      expect(mockCorrigirServicoAction).toHaveBeenCalledWith({
        chamadoId: CHAMADO_ID,
        catalogServiceId: NEW_SERVICE_ID,
        novoTecnicoId: undefined,
        motivo: 'Ar-condicionado é o problema real',
      });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mostra o erro da action e não fecha o diálogo', async () => {
    const user = userEvent.setup();
    mockCorrigirServicoAction.mockResolvedValue({
      ok: false,
      error: 'O técnico atual não tem a especialidade deste serviço. Escolha um novo técnico.',
    });
    const onOpenChange = vi.fn();

    render(
      <CorrigirServicoDialog
        open
        onOpenChange={onOpenChange}
        chamado={chamado({ assignedToUserId: TECH_ID })}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByText('Troca de tomada', { exact: false });
    await user.click(screen.getByLabelText('Tipo *'));
    await user.click(await screen.findByRole('option', { name: 'Ar-Condicionado' }));
    await user.click(screen.getByLabelText('Subtipo *'));
    await user.click(await screen.findByRole('option', { name: 'Refrigeração' }));
    await user.click(screen.getByLabelText('Serviço do Catálogo *'));
    await user.click(await screen.findByRole('option', { name: /Reparo de ar-condicionado/ }));

    await user.click(screen.getByRole('button', { name: 'Corrigir Serviço' }));

    expect(await screen.findByText(/O técnico atual não tem a especialidade/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cancelar fecha sem chamar a action', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CorrigirServicoDialog
        open
        onOpenChange={onOpenChange}
        chamado={chamado()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByText('Troca de tomada', { exact: false });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockCorrigirServicoAction).not.toHaveBeenCalled();
  });
});
