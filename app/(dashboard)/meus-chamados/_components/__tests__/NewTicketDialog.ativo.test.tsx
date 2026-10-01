// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemSeletorAtivo } from '@/shared/ativos/seletor.types';

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
 * O campo "Equipamento" do novo chamado (spec 0011, AC-14 e AC-15): o ativo
 * sugere local exato, tipo e subtipo só nos campos ainda vazios; trocar de
 * ativo sobrescreve só o que o anterior preencheu; limpar não desfaz nada.
 * Serviço do catálogo e unidade seguem escolha da pessoa.
 */

const TIPO_AR = 't-ar';
const SPLIT = 's-split';

const ATIVO_A: ItemSeletorAtivo = {
  id: 'a1',
  codigo: '11997',
  descricao: 'Split sala 302',
  caminho: 'Sede/3º andar/Sala 302',
  categoriaNome: 'Climatização',
  tipoServico: 'Ar-Condicionado',
  subtypeId: SPLIT,
};
const ATIVO_B: ItemSeletorAtivo = {
  id: 'a2',
  codigo: '11998',
  descricao: 'Split sala 303',
  caminho: 'Sede/3º andar/Sala 303',
  categoriaNome: 'Climatização',
  tipoServico: 'Ar-Condicionado',
  subtypeId: SPLIT,
};
const SEM_SUGESTAO: ItemSeletorAtivo = {
  id: 'a3',
  codigo: '500',
  descricao: 'Bomba',
  categoriaNome: 'Bomba hidráulica',
};

function responder(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/units'))
        return responder({ items: [{ _id: 'u1', name: '1ª Vara' }] });
      if (url.startsWith('/api/catalog/types'))
        return responder({
          items: [
            { _id: TIPO_AR, name: 'Ar Condicionado' },
            { _id: 't-mp', name: 'Manutenção Predial' },
          ],
        });
      if (url.startsWith('/api/session')) return responder({ role: 'Solicitante', userId: 'eu' });
      if (url.startsWith('/api/catalog/subtypes'))
        return responder({
          items: [
            { _id: SPLIT, name: 'Split' },
            { _id: 's-outro', name: 'Janela' },
          ],
        });
      if (url.startsWith('/api/catalog/services')) return responder({ items: [] });
      if (url.startsWith('/api/ativos/busca'))
        return responder({ items: [ATIVO_A, ATIVO_B, SEM_SUGESTAO] });
      return responder({});
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const localExato = () => screen.getByLabelText(/Local Exato/) as HTMLInputElement;

async function escolher(user: ReturnType<typeof userEvent.setup>, codigo: string) {
  await user.type(screen.getByRole('combobox', { name: /Equipamento/ }), codigo.slice(0, 3));
  await user.click(await screen.findByRole('option', { name: new RegExp(codigo) }));
}

async function remover(user: ReturnType<typeof userEvent.setup>, codigo: string) {
  await user.click(screen.getByRole('button', { name: `Remover o equipamento ${codigo}` }));
}

describe('NewTicketDialog · equipamento (spec 0011)', () => {
  it('ativo inicial preenche local, tipo e subtipo do formulário vazio (AC-15)', async () => {
    render(<NewTicketDialog open onOpenChange={() => {}} ativoInicial={ATIVO_A} />);
    expect(await screen.findByText('Split sala 302')).toBeInTheDocument();
    expect(localExato().value).toBe('Sede/3º andar/Sala 302');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Subtipo/ })).toHaveTextContent('Split'),
    );
  });

  it('não sobrescreve o local exato que a pessoa já digitou (AC-14)', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog open onOpenChange={() => {}} />);
    await user.type(localExato(), 'Corredor do 3º');
    await escolher(user, '11997');
    expect(localExato().value).toBe('Corredor do 3º');
  });

  it('trocar de ativo sobrescreve só o que o anterior preencheu', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog open onOpenChange={() => {}} />);
    await escolher(user, '11997');
    expect(localExato().value).toBe('Sede/3º andar/Sala 302');
    await remover(user, '11997');
    await escolher(user, '11998');
    expect(localExato().value).toBe('Sede/3º andar/Sala 303');
  });

  it('se a pessoa mudou o local depois do ativo, a troca não mexe nele', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog open onOpenChange={() => {}} />);
    await escolher(user, '11997');
    await user.clear(localExato());
    await user.type(localExato(), 'Sala 302, perto da janela');
    await remover(user, '11997');
    await escolher(user, '11998');
    expect(localExato().value).toBe('Sala 302, perto da janela');
  });

  it('limpar o ativo não desfaz o que ele preencheu', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog open onOpenChange={() => {}} />);
    await escolher(user, '11997');
    await remover(user, '11997');
    expect(localExato().value).toBe('Sede/3º andar/Sala 302');
    expect(screen.getByRole('combobox', { name: /Subtipo/ })).toBeInTheDocument();
  });

  it('categoria sem subtipo não sugere tipo, e ativo sem local não mexe no local exato', async () => {
    const user = userEvent.setup();
    render(<NewTicketDialog open onOpenChange={() => {}} />);
    await escolher(user, '500');
    expect(localExato().value).toBe('');
    // O subtipo só aparece depois de escolher um tipo.
    expect(screen.queryByRole('combobox', { name: /Subtipo/ })).not.toBeInTheDocument();
  });

  it('não escolhe a unidade pela pessoa', async () => {
    render(<NewTicketDialog open onOpenChange={() => {}} ativoInicial={ATIVO_A} />);
    await screen.findByText('Split sala 302');
    expect(screen.getByRole('combobox', { name: /Unidade/ })).toHaveTextContent(
      'Selecione a unidade/setor',
    );
  });
});
