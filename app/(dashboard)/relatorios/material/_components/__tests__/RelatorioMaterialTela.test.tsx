// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * A tela do relatório de material (spec 0019, AC-41, repaginada na spec 0021,
 * AC-23): divisão por zero nunca vira 0%, o aviso das tentativas aparece ao
 * lado do número, o período inválido avisa, os atalhos de período marcam o
 * escolhido, o custo vira barras, os empenhos mostram saldo e projeção e os
 * pontos de atenção levam às listas. "RN-36" saiu do texto.
 *
 * covers: AC-41, AC-38; spec 0021, AC-23
 */
import type { RelatorioMaterial } from '@/lib/material/relatorio';
import {
  TEXTO_SEM_COTACOES_NO_PERIODO,
  TEXTO_SEM_ITENS_COM_EQUIVALENTE,
  TEXTO_TENTATIVAS_DESDE_A_FATIA_5,
} from '@/shared/material/mensagens';

import { RelatorioMaterialTela } from '../RelatorioMaterialTela';

const HOJE = '2026-11-14';

const vazio: RelatorioMaterial = {
  periodo: { inicio: '2026-11-01', fim: HOJE },
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

function tela(
  r: Partial<RelatorioMaterial> = {},
  erroPeriodo: string | null = null,
  pedido = { inicio: '2026-11-01', fim: HOJE },
) {
  return render(
    <RelatorioMaterialTela
      relatorio={{ ...vazio, ...r }}
      erroPeriodo={erroPeriodo}
      pedido={pedido}
      hoje={HOJE}
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

  it('os atalhos levam ao período certo e marcam o atual', () => {
    tela();

    const grupo = screen.getByRole('region', { name: 'Período do relatório' });
    const mes = within(grupo).getByRole('link', { name: 'Mês atual' });
    expect(mes).toHaveAttribute('aria-current', 'true');
    expect(mes).toHaveAttribute('href', '?atalho=mes&inicio=2026-11-01&fim=2026-11-14');
    expect(within(grupo).getByRole('link', { name: 'Trimestre atual' })).toHaveAttribute(
      'href',
      '?atalho=trimestre&inicio=2026-10-01&fim=2026-11-14',
    );
    expect(within(grupo).getByRole('link', { name: 'Ano atual' })).toHaveAttribute(
      'href',
      '?atalho=ano&inicio=2026-01-01&fim=2026-11-14',
    );
    expect(screen.getByText('Outro período').closest('details')).not.toHaveAttribute('open');
  });

  it('no primeiro mês do trimestre, "Trimestre atual" clicado fica marcado, não "Mês atual"', () => {
    const outubro = { inicio: '2026-10-01', fim: '2026-10-23' };
    render(
      <RelatorioMaterialTela
        relatorio={{ ...vazio, periodo: outubro }}
        erroPeriodo={null}
        pedido={outubro}
        hoje="2026-10-23"
        atalho="trimestre"
      />,
    );

    const grupo = screen.getByRole('region', { name: 'Período do relatório' });
    expect(within(grupo).getByRole('link', { name: 'Trimestre atual' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(grupo).getByRole('link', { name: 'Mês atual' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('um período fora dos atalhos abre "Outro período" com as datas pedidas', () => {
    tela({ periodo: { inicio: '2026-05-01', fim: '2026-05-31' } }, null, {
      inicio: '2026-05-01',
      fim: '2026-05-31',
    });

    expect(screen.getByText('Outro período').closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('De')).toHaveValue('2026-05-01');
    expect(screen.getByRole('link', { name: 'Mês atual' })).not.toHaveAttribute('aria-current');
  });

  it('o período inválido avisa por alerta e diz que mostra o mês corrente', () => {
    tela({}, 'O período vai até 366 dias.', { inicio: '2025-01-01', fim: '2026-11-14' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O período vai até 366 dias. Mostrando o mês corrente.',
    );
    expect(screen.getByLabelText('De')).toHaveValue('2025-01-01');
  });

  it('o custo por equipamento vira barras, cada uma com o link do ativo', () => {
    tela({
      custoPorAtivo: {
        ativos: [
          { ativoId: 'a1', rotulo: 'MNT-0098', cotacoes: 3, valorCentavos: 12_315_00 },
          { ativoId: 'a2', rotulo: 'MNT-0311', cotacoes: 1, valorCentavos: 7_760_00 },
        ],
        totalCentavos: 20_075_00,
        semAtivoCentavos: 0,
      },
    });

    const custo = screen.getByRole('region', { name: 'Custo por equipamento' });
    const linhas = within(custo).getAllByRole('listitem');
    expect(within(linhas[0]!).getByRole('link', { name: 'MNT-0098' })).toHaveAttribute(
      'href',
      '/ativos/a1',
    );
    expect(linhas[0]).toHaveTextContent('R$ 12.315,00');
    expect(linhas[0]).toHaveTextContent('3 cotações');
    expect(linhas[1]).toHaveTextContent('1 cotação');
  });

  it('cada empenho mostra o saldo, o consumo por dia e a projeção', () => {
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

    const empenhos = screen.getByRole('region', { name: 'Empenhos: saldo e projeção' });
    const [um, dois] = within(empenhos).getAllByRole('listitem');
    expect(um).toHaveTextContent('esgota por volta de 29/12/2026');
    expect(um).toHaveTextContent('Saldo R$ 700,00 · consumo de R$ 10,00 por dia');
    expect(dois).toHaveTextContent('histórico curto para projetar');
  });

  it('os pontos de atenção contam e levam às listas; a cotação liga à sua tela', () => {
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

    const atencao = screen.getByRole('region', { name: 'Pontos de atenção' });
    expect(within(atencao).getByRole('link', { name: /1 cotação por urgência/ })).toHaveAttribute(
      'href',
      '#urgencias',
    );
    expect(within(atencao).getByRole('link', { name: /1 com pesquisa pendente/ })).toBeVisible();
    expect(within(atencao).getByRole('link', { name: /1 sinal de fracionamento/ })).toHaveAttribute(
      'href',
      '#fracionamento',
    );
    expect(within(atencao).getByRole('link', { name: /1 item acima do estimado/ })).toHaveAttribute(
      'href',
      '#consumo',
    );
    expect(screen.getByText('Acima do estimado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'COT-2026-0009' })).toHaveAttribute(
      'href',
      '/cotacoes/c9',
    );
    const urgencia = screen.getByRole('row', { name: /COT-2026-0008/ });
    expect(urgencia).toHaveTextContent('Aceita');
    expect(urgencia).toHaveTextContent('Pendente');
    expect(document.body).not.toHaveTextContent('RN-36');
  });

  it('sem nada a apontar, os pontos de atenção dizem isso', () => {
    tela();

    expect(screen.getByRole('region', { name: 'Pontos de atenção' })).toHaveTextContent(
      'Nada a apontar no período.',
    );
  });

  it('com cotação autorizada sem item do Anexo V, o quadro do SINAPI não diz "sem cotações"', () => {
    tela({ tempoAutorizacao: { quantidade: 1, mediaDias: 2, medianaDias: 2 } });

    const quadro = screen.getByText('Diferença para o SINAPI').parentElement!;
    expect(quadro).toHaveTextContent(TEXTO_SEM_ITENS_COM_EQUIVALENTE);
    expect(quadro).not.toHaveTextContent(TEXTO_SEM_COTACOES_NO_PERIODO);
  });
});
