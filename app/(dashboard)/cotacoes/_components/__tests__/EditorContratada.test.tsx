// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CotacaoDTO } from '@/lib/material/serializar';
import type { PassoMontagem } from '@/shared/material/mensagens';

/**
 * O editor da contratada (spec 0019, fatia 3). A tela monta o editor com
 * `key={c.versao}`, e salvar antes de classificar ou enviar sobe a versão:
 * quando a ação seguinte é recusada, o recarregamento monta o editor de novo.
 * A recusa precisa chegar a quem clicou mesmo assim. Desde a spec 0021
 * (fatia 5), o editor tem 4 passos, a busca no Anexo V e no SINAPI dentro do
 * item, a grade de preços e a lista "Pronta para enviar?" ao vivo.
 *
 * covers: AC-26 (spec 0019); AC-12, AC-13, AC-14, AC-15 (spec 0021)
 */

const acoes = vi.hoisted(() => ({
  salvarRascunhoAction: vi.fn(),
  classificarItemAction: vi.fn(),
  enviarCotacaoAction: vi.fn(),
  buscarItensPrecoAction: vi.fn(),
}));
vi.mock('../../actions', () => acoes);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PEDIDO_URGENCIA_VAZIO, type PedidoUrgencia } from '../editor/formulario';
import { EditorContratada } from '../EditorContratada';

const RECUSA = 'Este insumo equivale aos itens 4 e 5 do Anexo V; escolha um deles.';
const ITEM_ORC = 'b'.repeat(24);

function cotacao(versao: number, extra: Partial<CotacaoDTO> = {}): CotacaoDTO {
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
    raizCnpjContratada: '03543374',
    ...extra,
  };
}

/** Um item do caminho 3, ainda sem escolha de preço. */
const disjuntor = {
  id: ITEM_ORC,
  descricao: 'Disjuntor bipolar 40 A',
  unidade: 'un',
  quantidade: 2,
  motivo: 'Trocar o queimado',
  doDiagnostico: false,
  precoAplicadoCentavos: null,
  quantidadeExecutada: null,
  valorExecutadoCentavos: null,
  origem: null,
  anexoVNumero: null,
  sinapiCodigo: null,
  sinapiReferencia: null,
  valorProvisorio: false,
};

function orcamentoDto(n: number, cnpj: string, valor: number) {
  return {
    id: String(n).repeat(24),
    fornecedor: `Loja ${n}`,
    cnpj,
    data: '2026-10-10',
    validade: '2099-12-31',
    arquivoId: String(n + 3).repeat(24),
    precos: [{ itemId: ITEM_ORC, valorUnitarioCentavos: valor }],
    fase: 'envio' as const,
  };
}

/**
 * Como a tela: a chave é a versão, e recarregar traz a versão que o servidor
 * gravou; o passo mora fora do editor e sobrevive à nova montagem.
 */
function Tela({
  passoInicial = 'itens',
  extra,
}: {
  passoInicial?: PassoMontagem;
  extra?: Partial<CotacaoDTO>;
}) {
  const [versao, setVersao] = useState(1);
  const [passo, setPasso] = useState<PassoMontagem>(passoInicial);
  const [pedido, setPedido] = useState<PedidoUrgencia>(PEDIDO_URGENCIA_VAZIO);
  return (
    <EditorContratada
      key={versao}
      cotacao={cotacao(versao, extra)}
      passo={passo}
      onPasso={setPasso}
      pedidoUrgencia={pedido}
      onPedidoUrgencia={setPedido}
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
    render(<Tela passoInicial="tabela" />);
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
    render(<Tela passoInicial="revisar" />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e enviar para análise' }));
    await waitFor(() => expect(acoes.enviarCotacaoAction).toHaveBeenCalled());
    await waitFor(() => expect(recusaMostrada(erro)).toBe(true));
  });
});

describe('passos da montagem', () => {
  it('navega livre entre os 4 passos e mantém o passo depois de salvar', async () => {
    render(<Tela />);
    const passos = screen.getByRole('navigation', { name: 'Passos da montagem' });
    expect(within(passos).getByRole('button', { name: /Itens/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await userEvent.click(within(passos).getByRole('button', { name: /Revisar e enviar/ }));
    expect(within(passos).getByRole('button', { name: /Revisar e enviar/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: 'Salvar e enviar para análise' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para orçamentos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(acoes.salvarRascunhoAction).toHaveBeenCalled());
    // O editor foi montado de novo com a versão 2 e continua nos orçamentos.
    await waitFor(() =>
      expect(
        within(screen.getByRole('navigation', { name: 'Passos da montagem' })).getByRole('button', {
          name: /Orçamentos/,
        }),
      ).toHaveAttribute('aria-current', 'step'),
    );
    expect(screen.queryByRole('button', { name: 'Salvar e enviar para análise' })).toBeNull();
  });

  it('trocar de passo leva o foco ao título do passo novo', async () => {
    render(<Tela />);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar para preço de tabela' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Onde está o preço de cada item?' }),
    ).toHaveFocus();
  });
});

describe('urgência pedida no envio', () => {
  it('justificativa curta barra o envio antes de salvar, e a lista acusa', async () => {
    render(<Tela passoInicial="revisar" />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pedir urgência' }));
    await userEvent.type(screen.getByLabelText(/Justificativa da urgência \(/), 'curta');
    const linha = within(screen.getByRole('region', { name: 'Pronta para enviar?' }))
      .getByText('Justificativa da urgência')
      .closest('li');
    expect(linha).toHaveTextContent('Falta:');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e enviar para análise' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Justifique a urgência');
    expect(acoes.salvarRascunhoAction).not.toHaveBeenCalled();
  });

  it('o pedido de urgência sobrevive ao editor montado de novo por um envio recusado', async () => {
    acoes.enviarCotacaoAction.mockResolvedValue({ ok: false, error: 'Recusado.' });
    render(<Tela passoInicial="revisar" />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pedir urgência' }));
    const texto = 'Elevador parado com gente dependendo dele';
    await userEvent.type(screen.getByLabelText(/Justificativa da urgência \(/), texto);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e enviar para análise' }));
    await waitFor(() => expect(acoes.enviarCotacaoAction).toHaveBeenCalled());
    expect(acoes.enviarCotacaoAction).toHaveBeenCalledWith(
      expect.objectContaining({ urgencia: { justificativa: texto } }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Recusado.'));
    expect(screen.getByRole('checkbox', { name: 'Pedir urgência' })).toBeChecked();
    expect(screen.getByLabelText(/Justificativa da urgência \(/)).toHaveValue(texto);
  });
});

describe('busca de preço dentro do item', () => {
  it('abre no item, mostra as duas tabelas lado a lado e usa a escolhida', async () => {
    acoes.buscarItensPrecoAction.mockResolvedValue({
      ok: true,
      contrato: '12/2026',
      mes: '2026-09',
      anexoV: [
        {
          anexoVItemId: 'e'.repeat(24),
          numero: 91,
          descricao: 'Disjuntor bipolar 40 A, curva C',
          unidade: 'un',
          precoCentavos: 3420,
          equivalenteSinapi: null,
        },
      ],
      sinapi: [
        {
          codigo: '4931',
          descricao: 'Disjuntor termomagnético bipolar 40 A',
          unidade: 'un',
          precoCentavos: 3715,
          equivaleAoAnexoV: [],
        },
      ],
    });
    acoes.classificarItemAction.mockResolvedValue({ ok: true, versao: 3 });
    render(<Tela passoInicial="tabela" extra={{ itens: [disjuntor] }} />);
    expect(screen.getByText('sem preço ainda')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Buscar preço' }));
    const busca = screen.getByRole('search', { name: /Disjuntor bipolar 40 A/ });
    await userEvent.click(within(busca).getByRole('button', { name: 'Buscar' }));
    expect(
      await screen.findByRole('heading', { name: 'Anexo V do contrato 12/2026 · 1' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'SINAPI 09/2026 · 1' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Usar SINAPI 4931' }));
    await waitFor(() =>
      expect(acoes.classificarItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: ITEM_ORC, escolha: { sinapiCodigo: '4931' } }),
      ),
    );
    expect(acoes.salvarRascunhoAction).toHaveBeenCalledBefore(acoes.classificarItemAction);
  });
});

describe('grade de preços e lista ao vivo', () => {
  const orcamentos = [
    orcamentoDto(1, '11222333000181', 1200),
    orcamentoDto(2, '22333444000162', 1000),
  ];
  const extra = {
    itens: [disjuntor],
    orcamentos,
    arquivos: orcamentos.map((o) => ({
      id: o.arquivoId,
      tipo: 'orcamento' as const,
      nomeOriginal: `${o.fornecedor}.pdf`,
      tamanho: 10,
      em: '2026-10-10T12:00:00Z',
      meu: true,
    })),
  };

  it('uma célula por fornecedor, o menor preço destacado e "N de 3" no item', () => {
    render(<Tela passoInicial="orcamentos" extra={extra} />);
    const grade = screen.getByRole('region', { name: 'Grade de preços por fornecedor' });
    const menor = within(grade).getByLabelText('Disjuntor bipolar 40 A, Loja 2, preço unitário');
    expect(menor).toHaveValue('10,00');
    expect(menor.className).toMatch(/emerald/);
    expect(
      within(grade).getByLabelText('Disjuntor bipolar 40 A, Loja 1, preço unitário').className,
    ).not.toMatch(/emerald/);
    expect(within(grade).getByText('2 de 3')).toBeVisible();
  });

  it('a lista mostra o que falta e muda sem ir ao servidor', async () => {
    render(<Tela passoInicial="orcamentos" extra={extra} />);
    const lista = screen.getByRole('region', { name: 'Pronta para enviar?' });
    // Dois orçamentos e nenhuma referência: faltam o terceiro e a referência.
    expect(within(lista).getByText('3 orçamentos por item').closest('li')).toHaveTextContent(
      'Falta:',
    );
    expect(
      within(lista).getByText('Uma referência de preço por item').closest('li'),
    ).toHaveTextContent('Falta:');
    // Total pelo menor preço: 10,00 × 2.
    expect(screen.getByText('R$ 20,00')).toBeVisible();
    await userEvent.clear(screen.getByLabelText('Disjuntor bipolar 40 A, Loja 2, preço unitário'));
    expect(screen.getByText('R$ 24,00')).toBeVisible();
    expect(acoes.salvarRascunhoAction).not.toHaveBeenCalled();
  });
});
