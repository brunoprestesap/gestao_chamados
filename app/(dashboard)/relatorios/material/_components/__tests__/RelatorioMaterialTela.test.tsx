// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * A tela do relatório de material (spec 0019, AC-41): divisão por zero nunca
 * vira 0%, o aviso das tentativas aparece ao lado do número, o período
 * inválido avisa, e a projeção de cada empenho usa os textos de
 * `mensagens.ts`.
 *
 * covers: AC-41, AC-38
 */
import type { RelatorioMaterial } from '@/lib/material/relatorio';
import {
  TEXTO_SEM_COTACOES_NO_PERIODO,
  TEXTO_SEM_ITENS_COM_EQUIVALENTE,
  TEXTO_TENTATIVAS_DESDE_A_FATIA_5,
} from '@/shared/material/mensagens';

import { RelatorioMaterialTela } from '../RelatorioMaterialTela';

const vazio: RelatorioMaterial = {
  periodo: { inicio: '2026-10-01', fim: '2026-10-31' },
  tempoAutorizacao: { quantidade: 0, mediaDias: null, medianaDias: null },
  devolvidas: { numerador: 0, denominador: 0 },
  impedimentoPrimeiraTentativa: { numerador: 0, denominador: 0 },
  custoPorAtivo: { ativos: [], totalCentavos: 0, semAtivoCentavos: 0 },
  divergencia: { cotacoes: 0, comDiferenca: 0, diferencaCentavos: 0 },
  urgencias: [],
  fracionamento: [],
  consumoAnexoV: [],
  anexoVSinapi: {
    itensComEquivalente: 0,
    diferencaCentavos: 0,
    itensSemEquivalente: 0,
    semEquivalenteCentavos: 0,
  },
  empenhos: [],
};

const pedido = { inicio: '2026-10-01', fim: '2026-10-31' };

function tela(r: Partial<RelatorioMaterial> = {}, erroPeriodo: string | null = null) {
  return render(
    <RelatorioMaterialTela
      relatorio={{ ...vazio, ...r }}
      erroPeriodo={erroPeriodo}
      pedido={pedido}
    />,
  );
}

describe('RelatorioMaterialTela', () => {
  it('período sem cotações mostra "sem cotações no período", nunca 0%', () => {
    tela();

    expect(screen.getAllByText(TEXTO_SEM_COTACOES_NO_PERIODO).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('mostra os percentuais com o numerador e o denominador, e o aviso das tentativas', () => {
    tela({
      devolvidas: { numerador: 1, denominador: 4 },
      impedimentoPrimeiraTentativa: { numerador: 2, denominador: 3 },
    });

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('1 de 4 enviadas pela primeira vez no período')).toBeInTheDocument();
    expect(screen.getByText('66,7%')).toBeInTheDocument();
    expect(screen.getByText(TEXTO_TENTATIVAS_DESDE_A_FATIA_5)).toBeInTheDocument();
  });

  it('o período inválido avisa por alerta e diz que mostra o mês corrente', () => {
    tela({}, 'O período vai até 366 dias.');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O período vai até 366 dias. Mostrando o mês corrente.',
    );
    expect(screen.getByLabelText('De')).toHaveValue('2026-10-01');
  });

  it('cada empenho mostra o saldo e a projeção pela situação dela', () => {
    tela({
      empenhos: [
        {
          empenhoId: 'e1',
          numero: 'NE-1',
          exercicio: 2026,
          saldoCentavos: 700_00,
          mediaDiariaCentavos: 10_00,
          dataEstimada: '2026-12-29',
          situacao: 'estimada',
        },
        {
          empenhoId: 'e2',
          numero: 'NE-2',
          exercicio: 2026,
          saldoCentavos: 500_00,
          mediaDiariaCentavos: null,
          dataEstimada: null,
          situacao: 'historico_insuficiente',
        },
      ],
    });

    const tabela = screen.getByRole('region', { name: 'Saldo e projeção dos empenhos' });
    expect(within(tabela).getByRole('row', { name: /NE-1/ })).toHaveTextContent(
      'Esgota por volta de 29/12/2026',
    );
    expect(within(tabela).getByRole('row', { name: /NE-2/ })).toHaveTextContent(
      /Histórico insuficiente/,
    );
  });

  it('marca o item do Anexo V acima do estimado e liga as cotações às suas telas', () => {
    tela({
      consumoAnexoV: [
        {
          contrato: '01/2022',
          numero: 7,
          descricao: 'Cabo flexível',
          unidade: 'm',
          estimada: 10,
          consumida: 11,
          acima: true,
        },
      ],
      fracionamento: [{ id: 'c9', numero: 'COT-2026-0009' }],
      urgencias: [
        {
          id: 'c8',
          numero: 'COT-2026-0008',
          chamado: 'CHM-1',
          situacao: 'autorizada',
          decisao: 'aceita',
          pesquisaCompleta: false,
        },
      ],
    });

    expect(screen.getByText('Acima do estimado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'COT-2026-0009' })).toHaveAttribute(
      'href',
      '/cotacoes/c9',
    );
    const urgencia = screen.getByRole('row', { name: /COT-2026-0008/ });
    expect(urgencia).toHaveTextContent('Aceita');
    expect(urgencia).toHaveTextContent('Pendente');
  });

  it('com cotação autorizada sem item do Anexo V, o quadro do SINAPI não diz "sem cotações"', () => {
    tela({ tempoAutorizacao: { quantidade: 1, mediaDias: 2, medianaDias: 2 } });

    const quadro = screen.getByText('Diferença para o SINAPI').closest('div')!.parentElement!;
    expect(quadro).toHaveTextContent(TEXTO_SEM_ITENS_COM_EQUIVALENTE);
    expect(quadro).not.toHaveTextContent(TEXTO_SEM_COTACOES_NO_PERIODO);
  });
});
