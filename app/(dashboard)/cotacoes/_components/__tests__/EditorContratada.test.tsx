// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CotacaoDTO } from '@/lib/material/serializar';

/**
 * O editor da contratada (spec 0019, fatia 3). A tela monta o editor com
 * `key={c.versao}`, e salvar antes de classificar ou enviar sobe a versão:
 * quando a ação seguinte é recusada, o recarregamento monta o editor de novo.
 * A recusa precisa chegar a quem clicou mesmo assim.
 *
 * covers: AC-26
 */

const acoes = vi.hoisted(() => ({
  salvarRascunhoAction: vi.fn(),
  classificarItemAction: vi.fn(),
  enviarCotacaoAction: vi.fn(),
  buscarItensPrecoAction: vi.fn(),
}));
vi.mock('../../actions', () => acoes);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { EditorContratada } from '../EditorContratada';

const RECUSA = 'Este insumo equivale aos itens 4 e 5 do Anexo V; escolha um deles.';

function cotacao(versao: number): CotacaoDTO {
  return {
    id: 'c'.repeat(24),
    numero: 'COT-2026-0001',
    chamadoId: 'h'.repeat(24),
    situacao: 'rascunho',
    emTramite: true,
    versao,
    visao: 'contratada',
    criadaEm: '2026-10-19T12:00:00Z',
    atualizadaEm: '2026-10-19T12:00:00Z',
    ultimoMotivo: null,
    itens: [
      {
        id: 'a'.repeat(24),
        descricao: 'Lâmpada',
        unidade: 'un',
        quantidade: 2,
        motivo: 'Troca',
        doDiagnostico: true,
        precoAplicadoCentavos: 2500,
        quantidadeExecutada: null,
        valorExecutadoCentavos: null,
        origem: 'anexo_v',
        anexoVNumero: 3,
        sinapiCodigo: null,
        sinapiReferencia: null,
        valorProvisorio: false,
      },
    ],
    orcamentos: [],
    arquivos: [],
  };
}

/** Como a tela: a chave é a versão, e recarregar traz a versão que o servidor gravou. */
function Tela() {
  const [versao, setVersao] = useState(1);
  return (
    <EditorContratada
      key={versao}
      cotacao={cotacao(versao)}
      onAlterado={() => setVersao(2)}
      onImpedimentos={() => {}}
    />
  );
}

/** A recusa chegou a quem clicou: na tela ou num aviso. */
function recusaMostrada(texto: string): boolean {
  const naTela = screen.queryAllByText(texto).length > 0;
  const noAviso = vi.mocked(toast.error).mock.calls.some(([m]) => m === texto);
  return naTela || noAviso;
}

beforeEach(() => {
  vi.clearAllMocks();
  acoes.salvarRascunhoAction.mockResolvedValue({ ok: true, versao: 2 });
});

describe('recusa depois de salvar', () => {
  it('mostra a recusa da classificação mesmo com o editor montado de novo', async () => {
    acoes.classificarItemAction.mockResolvedValue({ ok: false, error: RECUSA });
    render(<Tela />);
    await userEvent.click(screen.getByRole('button', { name: 'Usar três orçamentos' }));
    await waitFor(() => expect(acoes.classificarItemAction).toHaveBeenCalled());
    await waitFor(() => expect(recusaMostrada(RECUSA)).toBe(true));
  });

  it('mostra a recusa do envio mesmo com o editor montado de novo', async () => {
    const erro = 'Um item precisa ser classificado de novo antes do envio.';
    acoes.enviarCotacaoAction.mockResolvedValue({
      ok: false,
      error: erro,
      impedimentos: ['classificacao_desatualizada'],
    });
    render(<Tela />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e enviar para análise' }));
    await waitFor(() => expect(acoes.enviarCotacaoAction).toHaveBeenCalled());
    await waitFor(() => expect(recusaMostrada(erro)).toBe(true));
  });
});
