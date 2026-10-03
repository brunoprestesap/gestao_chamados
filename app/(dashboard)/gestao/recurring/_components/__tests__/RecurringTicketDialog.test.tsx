// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Diálogo de chamados recorrentes, escopo por categoria (spec 0013, AC-16).
 *
 * Regressão do /debug: a categoria grava o subtipo antes de a lista de
 * subtipos chegar do servidor; o Select do Radix então avisava `''` e o
 * subtipo sumia do formulário. O mesmo acontecia ao abrir um modelo para
 * editar. Aqui as listas do catálogo respondem atrasadas de propósito.
 */

const acoes = vi.hoisted(() => ({
  createRecurringTemplateAction: vi.fn(),
  updateRecurringTemplateAction: vi.fn(),
}));
vi.mock('@/app/(dashboard)/gestao/recurring/actions', () => acoes);

import { type OpcoesPreventiva, RecurringTicketDialog } from '../RecurringTicketDialog';
import type { RecurringItem } from '../RecurringTicketsClient';

const TIPO_AC = 't'.repeat(24);
const SUBTIPO = 'a'.repeat(24);
const SERVICO = 'c'.repeat(24);
const CATEGORIA = 'b'.repeat(24);
const UNIDADE = 'd'.repeat(24);
const SOLICITANTE = 'e'.repeat(24);

const opcoes: OpcoesPreventiva = {
  categorias: [
    {
      id: CATEGORIA,
      nome: 'Climatização',
      subtypeId: SUBTIPO,
      tipoServico: 'Ar-Condicionado',
      periodicidadeDias: 90,
    },
  ],
  locais: [{ id: 'f'.repeat(24), caminho: 'Prédio Sede' }],
};

const depois = <T,>(valor: T, ms: number) =>
  new Promise<Response>((ok) => setTimeout(() => ok(new Response(JSON.stringify(valor))), ms));

function servidor() {
  return vi.fn(async (url: string) => {
    if (url.startsWith('/api/units'))
      return depois({ items: [{ _id: UNIDADE, name: 'Diretoria' }] }, 0);
    if (url.startsWith('/api/users'))
      return depois({ items: [{ _id: SOLICITANTE, name: 'Maria', username: 'maria' }] }, 0);
    if (url.startsWith('/api/catalog/types'))
      return depois({ items: [{ _id: TIPO_AC, name: 'Ar-Condicionado' }] }, 0);
    // As duas listas que dependem da escolha chegam depois do valor.
    if (url.startsWith('/api/catalog/subtypes'))
      return depois(
        { items: [{ _id: SUBTIPO, name: 'Manutenção Preventiva', isActive: true }] },
        80,
      );
    if (url.startsWith('/api/catalog/services'))
      return depois({ items: [{ _id: SERVICO, code: 'PREV-0001', name: 'Limpeza de split' }] }, 80);
    return depois({}, 0);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', servidor());
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
  acoes.createRecurringTemplateAction.mockResolvedValue({ ok: true, data: { id: 'n' } });
  acoes.updateRecurringTemplateAction.mockResolvedValue({ ok: true });
});

function abrir(editingItem: RecurringItem | null = null) {
  render(
    <RecurringTicketDialog
      open
      onOpenChange={vi.fn()}
      editingItem={editingItem}
      onSuccess={vi.fn()}
      opcoes={opcoes}
    />,
  );
}

describe('RecurringTicketDialog · escopo por categoria (AC-16)', () => {
  it('escolher a categoria preenche tipo, subtipo e intervalo, e o subtipo continua valendo', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByLabelText(/Nome do agendamento/);

    await user.click(screen.getByRole('radio', { name: /Por categoria de ativo/ }));
    await user.click(screen.getByRole('combobox', { name: /Categoria de ativo/ }));
    await user.click(await screen.findByRole('option', { name: 'Climatização' }));

    const subtipo = screen.getByRole('combobox', { name: /Subtipo de serviço/ });
    await waitFor(() => expect(subtipo).toHaveTextContent('Manutenção Preventiva'));
    expect(screen.getByRole('combobox', { name: /Tipo de serviço/ })).toHaveTextContent(
      'Ar-Condicionado',
    );
    expect(screen.getByRole('combobox', { name: /Tipo de recorrência/ })).toHaveTextContent(
      'Personalizado',
    );
    expect(screen.getByLabelText(/Intervalo em dias/)).toHaveValue(90);
    expect(screen.getByRole('combobox', { name: /^Prioridade/ })).toHaveTextContent('Baixa');
    // Com o subtipo valendo no formulário, o serviço do catálogo libera.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Serviço do catálogo/ })).toBeEnabled(),
    );
  });

  it('editar um modelo e salvar sem mexer mantém subtipo e serviço do catálogo', async () => {
    const user = userEvent.setup();
    const item: RecurringItem = {
      _id: '1'.repeat(24),
      name: 'Splits Sede',
      titulo: 'Preventiva split',
      descricao: 'Limpeza',
      tipoServico: 'Ar-Condicionado',
      naturezaAtendimento: 'Padrão',
      grauUrgencia: 'Normal',
      recurrenceType: 'custom',
      intervalDays: 90,
      nextRunAt: new Date().toISOString(),
      totalGenerated: 0,
      isActive: true,
      unitId: UNIDADE,
      solicitanteId: SOLICITANTE,
      subtypeId: SUBTIPO,
      catalogServiceId: SERVICO,
      escopo: 'categoria_ativo',
      categoriaAtivoId: CATEGORIA,
      finalPriority: 'NORMAL',
    };
    abrir(item);
    await screen.findByLabelText(/Nome do agendamento/);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Serviço do catálogo/ })).toHaveTextContent(
        'PREV-0001',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    await waitFor(() => expect(acoes.updateRecurringTemplateAction).toHaveBeenCalled());
    expect(acoes.updateRecurringTemplateAction.mock.calls[0][0]).toMatchObject({
      id: item._id,
      subtypeId: SUBTIPO,
      catalogServiceId: SERVICO,
      escopo: 'categoria_ativo',
      categoriaAtivoId: CATEGORIA,
      finalPriority: 'NORMAL',
    });
  });

  it('ao editar, o escopo fica travado', async () => {
    abrir({
      _id: '1'.repeat(24),
      name: 'Único',
      titulo: 'X',
      descricao: 'Y',
      tipoServico: 'Ar-Condicionado',
      naturezaAtendimento: 'Padrão',
      grauUrgencia: 'Normal',
      recurrenceType: 'custom',
      intervalDays: 30,
      nextRunAt: new Date().toISOString(),
      totalGenerated: 0,
      isActive: true,
      unitId: UNIDADE,
      solicitanteId: SOLICITANTE,
      subtypeId: SUBTIPO,
      catalogServiceId: SERVICO,
      escopo: 'template',
    });
    await screen.findByLabelText(/Nome do agendamento/);
    const grupo = screen.getByRole('radiogroup', { name: 'Escopo do agendamento' });
    for (const radio of within(grupo).getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByText('O escopo não muda depois de criado.')).toBeInTheDocument();
  });
});
