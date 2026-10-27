// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Os diálogos do técnico no cartão do chamado (spec 0021, fatia 6): o de
 * material troca o "Acrescentar item" pelo aviso do limite, e o de execução
 * mostra cada evidência com o tipo (foto ou PDF) e deixa tirar só a própria
 * sem fechar o diálogo.
 *
 * covers: AC-16, AC-27
 */

const m = vi.hoisted(() => ({
  criarCotacaoAction: vi.fn(),
  salvarRascunhoAction: vi.fn(),
  executarAction: vi.fn(),
  removerArquivoAction: vi.fn(),
}));
vi.mock('../../actions', () => m);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { ArquivoDTO, ItemDTO } from '@/lib/material/serializar';
import { MAX_ITENS_COTACAO } from '@/shared/material/material.constants';

import { DialogExecucao } from '../DialogExecucao';
import { DialogMaterial } from '../DialogMaterial';

const item = (n: number): ItemDTO => ({
  id: `i${n}`,
  descricao: `Item ${n}`,
  unidade: 'un',
  quantidade: 1,
  motivo: 'Troca',
  doDiagnostico: true,
  precoAplicadoCentavos: null,
  quantidadeExecutada: null,
  valorExecutadoCentavos: null,
});

const itens = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));

function editar(lista: ItemDTO[]) {
  render(
    <DialogMaterial
      modo="editar"
      cotacaoId="c1"
      versao={1}
      itens={lista}
      open
      onOpenChange={vi.fn()}
      onSalvo={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.removerArquivoAction.mockResolvedValue({ ok: true });
});

describe('DialogMaterial · limite de itens', () => {
  it(`com ${MAX_ITENS_COTACAO} itens, o botão some e o limite aparece no lugar`, () => {
    editar(itens(MAX_ITENS_COTACAO));

    expect(screen.queryByRole('button', { name: 'Acrescentar item' })).not.toBeInTheDocument();
    expect(screen.getByText(`Até ${MAX_ITENS_COTACAO} itens por cotação.`)).toBeInTheDocument();
  });

  it('abaixo do limite, acrescentar o último item troca o botão pelo aviso', async () => {
    const user = userEvent.setup();
    editar(itens(MAX_ITENS_COTACAO - 1));
    expect(screen.queryByText(/itens por cotação\./)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Acrescentar item' }));

    expect(screen.queryByRole('button', { name: 'Acrescentar item' })).not.toBeInTheDocument();
    expect(screen.getByText(`Até ${MAX_ITENS_COTACAO} itens por cotação.`)).toBeInTheDocument();
  });
});

describe('DialogExecucao · evidências', () => {
  const arquivo = (id: string, nome: string, meu: boolean): ArquivoDTO => ({
    id,
    tipo: 'evidencia',
    nomeOriginal: nome,
    tamanho: 120_000,
    em: '2026-10-20T12:00:00Z',
    meu,
  });

  function executar(evidencias: ArquivoDTO[], onArquivos = vi.fn(), onOpenChange = vi.fn()) {
    render(
      <DialogExecucao
        open
        onOpenChange={onOpenChange}
        cotacaoId="c1"
        versao={4}
        itens={[item(1)]}
        evidencias={evidencias}
        onArquivos={onArquivos}
        onAlterado={vi.fn()}
      />,
    );
    return { onArquivos, onOpenChange };
  }

  it('cada evidência diz o tipo pelo nome do arquivo: PDF ou foto (em maiúsculas também)', () => {
    executar([
      arquivo('a1', 'laudo.PDF', true),
      arquivo('a2', 'antes.jpg', true),
      arquivo('a3', 'relatorio.pdf.png', true),
    ]);

    const linha = (nome: string) => screen.getByRole('link', { name: nome }).closest('li')!;
    expect(linha('laudo.PDF')).toHaveTextContent('PDF');
    expect(linha('antes.jpg')).toHaveTextContent('Foto');
    expect(linha('relatorio.pdf.png')).toHaveTextContent('Foto');
  });

  it('só a evidência que você anexou tem o botão de tirar', () => {
    executar([arquivo('a1', 'minha.jpg', true), arquivo('a2', 'de-outro.jpg', false)]);

    const linha = (nome: string) => screen.getByRole('link', { name: nome }).closest('li')!;
    expect(within(linha('minha.jpg')).getByRole('button')).toBeInTheDocument();
    expect(within(linha('de-outro.jpg')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('tirar a própria evidência recarrega a lista e não fecha o diálogo', async () => {
    const user = userEvent.setup();
    const { onArquivos, onOpenChange } = executar([arquivo('a1', 'minha.jpg', true)]);

    await user.click(
      within(screen.getByRole('link', { name: 'minha.jpg' }).closest('li')!).getByRole('button'),
    );

    expect(m.removerArquivoAction).toHaveBeenCalledWith({ arquivoId: 'a1' });
    await vi.waitFor(() => expect(onArquivos).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
