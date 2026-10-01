// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(dashboard)/meus-chamados/actions', () => ({
  createTicketAction: vi.fn(),
  notifyAttachmentAction: vi.fn(),
}));
vi.mock('@/app/(dashboard)/meus-chamados/template-actions', () => ({
  incrementTemplateUsageAction: vi.fn(),
}));
vi.mock('@/app/(dashboard)/meus-chamados/_components/TemplateSelector', () => ({
  TemplateSelector: () => null,
  TemplateManager: () => null,
}));
vi.mock('@/app/(dashboard)/meus-chamados/_components/SaveAsTemplateDialog', () => ({
  SaveAsTemplateDialog: () => null,
}));

import { NewTicketDialog } from '../NewTicketDialog';

/**
 * "O problema voltou" (spec 0010, AC-11): o formulário abre com tipo,
 * subtipo, serviço, unidade e local do chamado anterior. Subtipo e serviço
 * dependem da cascata de tipo, que só carrega depois que o diálogo abre.
 */

const UNIT = 'u1';
const TYPE = 't1';
const SUBTYPE = 's1';
const SERVICE = 'c1';

function responder(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  // Radix Select usa APIs de ponteiro e scroll que o jsdom não tem.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/units')) {
        return responder({ items: [{ _id: UNIT, name: '1ª Vara Federal' }] });
      }
      if (url.startsWith('/api/catalog/types')) {
        return responder({ items: [{ _id: TYPE, name: 'Manutenção Predial' }] });
      }
      if (url.startsWith('/api/session')) {
        return responder({ role: 'Solicitante', userId: 'eu', unitId: 'outra' });
      }
      if (url.startsWith('/api/catalog/subtypes')) {
        return responder({
          items: [
            { _id: 's0', name: 'Hidráulica' },
            { _id: SUBTYPE, name: 'Elétrica' },
          ],
        });
      }
      if (url.startsWith('/api/catalog/services')) {
        return responder({ items: [{ _id: SERVICE, name: 'Troca de lâmpada', code: '' }] });
      }
      return responder({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NewTicketDialog · reincidência (spec 0010, AC-11)', () => {
  it('preenche subtipo e serviço do chamado anterior depois que a cascata carrega', async () => {
    // Act
    render(
      <NewTicketDialog
        open
        onOpenChange={() => {}}
        reincidencia={{
          chamadoAnteriorId: 'a'.repeat(24),
          chamadoAnteriorNumero: 'VER-5',
          unitId: UNIT,
          localExato: 'Sala 5',
          tipoServico: 'Manutenção Predial',
          subtypeId: SUBTYPE,
          catalogServiceId: SERVICE,
        }}
      />,
    );

    // Assert
    expect(await screen.findByText(/Reincidência do chamado #VER-5/)).toBeInTheDocument();
    await waitFor(() => {
      const combos = screen.getAllByRole('combobox');
      expect(combos.map((c) => c.textContent)).toEqual(
        expect.arrayContaining(['1ª Vara Federal', 'Elétrica', 'Troca de lâmpada']),
      );
    });
    expect(screen.getByDisplayValue('Sala 5')).toBeInTheDocument();
  });
});
