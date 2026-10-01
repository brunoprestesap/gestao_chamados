// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemSeletorAtivo } from '@/shared/ativos/seletor.types';

import { SeletorAtivo } from '../SeletorAtivo';

/**
 * O combobox de equipamento (spec 0011, AC-14 e AC-16): busca com pelo menos
 * 2 caracteres, lista navegável pelo teclado, cartão do escolhido com botão
 * de remover que tem nome acessível.
 */

const SPLIT: ItemSeletorAtivo = {
  id: 'a1',
  codigo: '11997',
  descricao: 'Split 12000',
  caminho: 'Sede/3º andar/Sala 302',
  categoriaNome: 'Climatização',
};
const NOBREAK: ItemSeletorAtivo = {
  id: 'a2',
  codigo: '11998',
  descricao: 'Nobreak',
  categoriaNome: 'Nobreak',
};

let fetchMock: ReturnType<typeof vi.fn>;

function responder(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock = vi.fn(() => responder({ items: [SPLIT, NOBREAK] }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Controlado({ inicial = null as ItemSeletorAtivo | null, onChange = vi.fn() }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <label htmlFor="eq">Equipamento</label>
      <SeletorAtivo
        id="eq"
        valor={valor}
        onChange={(v) => {
          setValor(v);
          onChange(v);
        }}
      />
      <input aria-label="Outro campo" />
    </>
  );
}

describe('SeletorAtivo', () => {
  it('não busca com menos de 2 caracteres', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox', { name: 'Equipamento' }), '1');
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('busca o termo e mostra os equipamentos encontrados', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox', { name: 'Equipamento' }), '119');
    expect(await screen.findByRole('option', { name: /11997/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/ativos/busca?q=119&limite=20',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
  });

  it('escolhe com o mouse e mostra o cartão do equipamento com o local', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);
    await user.type(screen.getByRole('combobox'), '119');
    await user.click(await screen.findByRole('option', { name: /11997/ }));
    expect(onChange).toHaveBeenCalledWith(SPLIT);
    expect(screen.getByText('Sede/3º andar/Sala 302')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('navega pelo teclado: seta para baixo marca a opção e Enter escolhe', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);
    await user.type(screen.getByRole('combobox'), '119');
    await screen.findByRole('option', { name: /11997/ });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', { name: /11998/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-activedescendant',
      expect.stringMatching(/-1$/),
    );
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(NOBREAK);
  });

  it('Escape fecha a lista com resultados', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox'), '119');
    await screen.findByRole('option', { name: /11997/ });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Escape fecha a lista também quando a busca não achou nada', async () => {
    fetchMock.mockImplementation(() => responder({ items: [] }));
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox'), 'zz');
    await screen.findByText('Nenhum equipamento encontrado.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('mostra "Nenhum equipamento encontrado" quando a busca volta vazia', async () => {
    fetchMock.mockImplementation(() => responder({ items: [] }));
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox'), 'zz');
    expect(await screen.findByText('Nenhum equipamento encontrado.')).toBeInTheDocument();
  });

  it('mostra erro quando a busca falha', async () => {
    fetchMock.mockImplementation(() => responder({ error: 'x' }, 500));
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox'), 'zz');
    expect(await screen.findByText('Não foi possível buscar agora.')).toBeInTheDocument();
  });

  it('o botão de remover tem nome acessível e volta para o campo de busca', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado inicial={SPLIT} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remover o equipamento 11997' }));
    expect(onChange).toHaveBeenCalledWith(null);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  });

  it('reabre a lista quando a pessoa sai do campo e volta logo colando o código', async () => {
    // Leitor USB ou colar: o texto entra de uma vez, logo depois de voltar ao campo.
    const user = userEvent.setup();
    render(<Controlado />);
    const campo = screen.getByRole('combobox');
    await user.click(campo);
    await user.click(screen.getByRole('textbox', { name: 'Outro campo' }));
    await user.click(campo);
    await user.paste('119');
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('controle: voltando ao campo com calma, colar abre a lista', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    const campo = screen.getByRole('combobox');
    await user.click(campo);
    await user.click(screen.getByRole('textbox', { name: 'Outro campo' }));
    await new Promise((r) => setTimeout(r, 300));
    await user.click(campo);
    await user.paste('119');
    expect(await screen.findByRole('option', { name: /11997/ })).toBeInTheDocument();
  });

  // Depois do conserto do /debug: o atraso do blur continua fazendo o trabalho dele.
  it('sair do campo fecha a lista depois do atraso', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox'), '119');
    await screen.findByRole('option', { name: /11997/ });
    await user.click(screen.getByRole('textbox', { name: 'Outro campo' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('desmontar com o fechamento pendente não dispara nada depois', async () => {
    const user = userEvent.setup();
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<Controlado />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('textbox', { name: 'Outro campo' }));
    unmount();
    await new Promise((r) => setTimeout(r, 300));
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });

  // Achado da revisão: o indicador ficava girando quando o texto encolhia
  // para menos de 2 letras no meio de uma busca.
  it('apagar até ficar com 1 letra no meio da busca desliga o indicador', async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_ok, falhar) => {
          init?.signal?.addEventListener('abort', () =>
            falhar(Object.assign(new Error('abort'), { name: 'AbortError' })),
          );
        }),
    );
    const user = userEvent.setup();
    render(<Controlado />);
    await user.type(screen.getByRole('combobox'), 'ab');
    expect(await screen.findByRole('status')).toHaveTextContent('Buscando');
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
