// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Os diálogos da cotação (spec 0021, fatia 4): o de motivo com o erro no
 * campo, o Encaminhar com os pontos numerados e o Aprovar com uma barra por
 * empenho e a faixa de quem aprova.
 *
 * covers: AC-10, AC-11, AC-27
 */
import type { BarraEmpenhoDTO, ItemDTO, OrcamentoDTO } from '@/lib/material/serializar';

import { DialogMotivo } from '../compartilhado/DialogMotivo';
import { DialogAprovar } from '../detalhe/DialogAprovar';
import { DialogEncaminhar } from '../DialogEncaminhar';

describe('DialogMotivo (AC-11)', () => {
  function montar(onConfirmar = vi.fn(), erroServidor: string | null = null) {
    render(
      <DialogMotivo
        titulo="Reprovar a cotação?"
        descricao="A cotação termina aqui."
        rotuloConfirmar="Reprovar"
        destrutiva
        min={5}
        max={2000}
        pendente={false}
        erroServidor={erroServidor}
        onFechar={vi.fn()}
        onConfirmar={onConfirmar}
      />,
    );
    return onConfirmar;
  }

  it('abaixo do mínimo, mostra o erro no campo e não envia', async () => {
    const onConfirmar = montar();
    await userEvent.type(screen.getByLabelText('Motivo'), 'Fora');
    await userEvent.click(screen.getByRole('button', { name: 'Reprovar' }));

    expect(onConfirmar).not.toHaveBeenCalled();
    const campo = screen.getByLabelText('Motivo');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription(/Escreva ao menos 5 caracteres\./);
  });

  it('mostra o contador "N de M" e o mínimo embaixo do campo', async () => {
    montar();
    await userEvent.type(screen.getByLabelText('Motivo'), 'abc');
    expect(screen.getByText('3 de 2000')).toBeInTheDocument();
    expect(screen.getByText('Mínimo de 5 caracteres')).toBeInTheDocument();
  });

  it('com o mínimo, envia o texto aparado', async () => {
    const onConfirmar = montar();
    await userEvent.type(screen.getByLabelText('Motivo'), '  Preço fora da tabela  ');
    await userEvent.click(screen.getByRole('button', { name: 'Reprovar' }));
    expect(onConfirmar).toHaveBeenCalledWith('Preço fora da tabela');
  });

  it('a recusa do servidor aparece no campo', () => {
    montar(vi.fn(), 'A cotação mudou. Recarregue.');
    expect(screen.getByLabelText('Motivo')).toHaveAccessibleDescription(
      /A cotação mudou\. Recarregue\./,
    );
  });

  it('o botão de fechar se chama "Cancelar"', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});

const item = (m: Partial<ItemDTO>): ItemDTO => ({
  id: 'i1',
  descricao: 'Gás refrigerante R-410A',
  unidade: 'kg',
  quantidade: 2,
  motivo: 'Recarga',
  doDiagnostico: true,
  precoAplicadoCentavos: null,
  quantidadeExecutada: null,
  valorExecutadoCentavos: null,
  ...m,
});

const vencido: OrcamentoDTO = {
  id: 'o1',
  fornecedor: 'Clima Amapá',
  cnpj: '11222333000181',
  data: '2026-09-01',
  validade: '2026-10-18',
  arquivoId: 'a1',
  precos: [],
  fase: 'envio',
};

describe('DialogEncaminhar (AC-10)', () => {
  function montar(onConfirmar = vi.fn()) {
    render(
      <DialogEncaminhar
        numero="COT-2026-0145"
        valorCentavos={1_231_540}
        ambas={[
          item({
            origem: 'ambas',
            anexoVNumero: 214,
            anexoVPrecoCentavos: 138_000,
            sinapiCodigo: '39408',
            sinapiPrecoCentavos: 132_560,
          }),
        ]}
        naLista={[]}
        vencidos={[vencido]}
        urgencia={{ justificativa: 'Sala de servidores sem refrigeração.' }}
        open
        onOpenChange={vi.fn()}
        pendente={false}
        onConfirmar={onConfirmar}
      />,
    );
    return onConfirmar;
  }

  it('numera os pontos e mostra a diferença entre as tabelas em %', () => {
    montar();
    expect(screen.getByText(/Resolva os 3 pontos abaixo\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /1 · Base do item/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /2 · Orçamento com validade/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /3 · Urgência/ })).toBeInTheDocument();
    expect(screen.getByText(/3,9% menor/)).toBeInTheDocument();
    expect(screen.getByText(/4,1% maior/)).toBeInTheDocument();
  });

  it('só habilita o Encaminhar com todos os pontos resolvidos', async () => {
    const onConfirmar = montar();
    const botao = screen.getByRole('button', { name: 'Encaminhar' });
    expect(botao).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: /SINAPI · 39408/ }));
    await userEvent.type(screen.getByLabelText('Justificativa'), 'SINAPI mais recente.');
    await userEvent.click(screen.getByRole('checkbox', { name: /Confirmo o orçamento/ }));
    expect(botao).toBeDisabled();
    expect(screen.getByText('2 de 3 resolvidos')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Aceito a urgência/ }));
    expect(botao).toBeEnabled();
    await userEvent.click(botao);
    expect(onConfirmar).toHaveBeenCalledWith({
      bases: [{ itemId: 'i1', base: 'sinapi', justificativa: 'SINAPI mais recente.' }],
      conferencias: [],
      confirmacoes: ['o1'],
      aceitarUrgencia: true,
    });
  });
});

const barra = (m: Partial<BarraEmpenhoDTO>): BarraEmpenhoDTO => ({
  empenhoId: 'e1',
  numero: '2026NE000184',
  liquidoCentavos: 10_000_000,
  comprometidoCentavos: 3_870_000,
  estaCotacaoCentavos: 1_231_540,
  saldoDepoisCentavos: 4_898_460,
  projecao: null,
  ...m,
});

describe('DialogAprovar (AC-10)', () => {
  function montar(onConfirmar = vi.fn()) {
    render(
      <DialogAprovar
        numero="COT-2026-0145"
        valorCentavos={1_231_540}
        barras={[
          barra({}),
          barra({ empenhoId: 'e2', numero: '2026NE000211', saldoDepoisCentavos: 258_460 }),
          barra({ empenhoId: 'e3', numero: '2026NE000300', saldoDepoisCentavos: -1 }),
        ]}
        relevantes={new Set(['e2'])}
        faixa={{ nome: 'II', limiteCentavos: 2_000_000 }}
        pendente={false}
        onFechar={vi.fn()}
        onConfirmar={onConfirmar}
      />,
    );
    return onConfirmar;
  }

  it('diz o efeito da aprovação e a faixa de quem aprova', () => {
    montar();
    expect(
      screen.getByText(
        /Ao aprovar, R\$\s12\.315,40 ficam reservados no empenho escolhido e a compra fica autorizada\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/II · até R\$\s20\.000,00/)).toBeInTheDocument();
  });

  it('destaca o empenho que ficaria com pouco saldo e trava o que não cabe', () => {
    montar();
    expect(screen.getByText(/usaria 83% do saldo/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /2026NE000300/ })).toBeDisabled();
    expect(screen.getByText('sem saldo para esta cotação')).toBeInTheDocument();
  });

  it('aprova no empenho escolhido', async () => {
    const onConfirmar = montar();
    const botao = screen.getByRole('button', { name: 'Aprovar e reservar' });
    expect(botao).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /2026NE000184/ }));
    await userEvent.click(botao);
    expect(onConfirmar).toHaveBeenCalledWith('e1');
  });
});
