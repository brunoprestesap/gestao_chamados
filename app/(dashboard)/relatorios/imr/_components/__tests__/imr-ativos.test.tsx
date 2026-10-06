// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { IndicadoresAtivos, IndicadoresDoFiltro } from '@/lib/ativos/indicadores';

import { ImrAtivos } from '../imr-ativos';

/**
 * A aba Ativos do IMR (spec 0014): o selo informativo, o seletor de tipo que
 * só troca a vista, o topo, o ranking com link para a ficha e os vazios.
 *
 * covers: AC-15, AC-16, AC-18, AC-19
 */

const H = 60 * 60 * 1000;
const DIA = 24 * H;

const vazio: IndicadoresDoFiltro = {
  topo: {
    corretivosComAtivo: 0,
    percentualComAtivo: null,
    ativosAfetados: 0,
    mtbfMedioMs: null,
    mttrMedioMs: null,
    ativosReincidentes: 0,
  },
  ranking: [],
};

const comDados: IndicadoresDoFiltro = {
  topo: {
    corretivosComAtivo: 5,
    percentualComAtivo: 83.33,
    ativosAfetados: 2,
    mtbfMedioMs: 10 * DIA,
    mttrMedioMs: 6 * H,
    ativosReincidentes: 1,
  },
  ranking: [
    {
      ativoId: '6aad5286df6f201a25ede001',
      codigo: '11997',
      descricao: 'Split 12000',
      categoria: 'Split',
      caminho: 'Sede/Sala 302',
      corretivos: 3,
      mtbfMs: 10 * DIA,
      mttrMs: 8 * H,
      corretivos90d: 4,
    },
    {
      ativoId: '6aad5286df6f201a25ede002',
      codigo: '11998',
      descricao: '',
      categoria: null,
      caminho: null,
      corretivos: 1,
      mtbfMs: null,
      mttrMs: null,
      corretivos90d: 1,
    },
  ],
};

const dados: IndicadoresAtivos = {
  geral: comDados,
  porTipo: {
    'Manutenção Predial': vazio,
    'Ar-Condicionado': {
      ...comDados,
      topo: { ...comDados.topo, corretivosComAtivo: 4 },
      ranking: [comDados.ranking[0]!],
    },
    Elevador: vazio,
  },
};

describe('ImrAtivos', () => {
  it('mostra o selo de informativo, sem efeito contratual (AC-15)', () => {
    render(<ImrAtivos ativos={dados} />);
    expect(screen.getByText('Informativo, sem efeito contratual')).toBeInTheDocument();
  });

  it('começa em Todos e mostra os números do topo (AC-16)', () => {
    render(<ImrAtivos ativos={dados} />);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Corretivos com equipamento').nextElementSibling).toHaveTextContent(
      '5',
    );
    expect(screen.getByText(/83,33%/)).toBeInTheDocument();
    expect(screen.getByText('MTBF médio').nextElementSibling).toHaveTextContent('10 dia(s)');
    expect(screen.getByText('MTTR médio', { selector: 'p' }).nextElementSibling).toHaveTextContent(
      '6 hora(s)',
    );
    expect(screen.getByText('Reincidentes').nextElementSibling).toHaveTextContent('1');
  });

  it('a tabela liga o código à ficha e mostra "—" no lugar do que falta (AC-18, AC-19)', () => {
    render(<ImrAtivos ativos={dados} />);
    expect(screen.getByRole('link', { name: '11997' })).toHaveAttribute(
      'href',
      '/ativos/6aad5286df6f201a25ede001',
    );
    const linha = screen.getByRole('link', { name: '11998' }).closest('tr')!;
    const celulas = within(linha)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(celulas).toEqual(['11998', '—', '—', '—', '1', '—', '—', '1']);
  });

  it('o seletor troca a vista sem recarregar (AC-15)', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ImrAtivos ativos={dados} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Ar-Condicionado' }));

    // Assert
    expect(screen.getByRole('button', { name: 'Ar-Condicionado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Corretivos com equipamento').nextElementSibling).toHaveTextContent(
      '4',
    );
    expect(screen.queryByRole('link', { name: '11998' })).not.toBeInTheDocument();
  });

  it('tipo sem corretivo mostra o texto de vazio no lugar dos números e da tabela (AC-19)', async () => {
    const user = userEvent.setup();
    render(<ImrAtivos ativos={dados} />);

    await user.click(screen.getByRole('button', { name: 'Elevador' }));

    expect(screen.getByText(/nenhum corretivo com equipamento/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('MTBF médio')).not.toBeInTheDocument();
  });

  it('percentual sem denominador aparece como "—", nunca 0%', () => {
    const semDenominador: IndicadoresAtivos = {
      ...dados,
      geral: { ...comDados, topo: { ...comDados.topo, percentualComAtivo: null } },
    };
    render(<ImrAtivos ativos={semDenominador} />);
    expect(screen.getByText('Corretivos com equipamento (%)').nextElementSibling).toHaveTextContent(
      '—',
    );
  });

  it('falha na leitura mostra um aviso, sem números', () => {
    render(<ImrAtivos ativos={null} />);
    expect(screen.getByText(/não foi possível calcular/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('cada filtro é um botão alcançável pelo teclado', async () => {
    const user = userEvent.setup();
    render(<ImrAtivos ativos={dados} />);
    const grupo = screen.getByRole('group', { name: /filtrar por tipo de serviço/i });
    const botoes = within(grupo).getAllByRole('button');
    expect(botoes.map((b) => b.textContent)).toEqual([
      'Todos',
      'Manutenção Predial',
      'Ar-Condicionado',
      'Elevador',
    ]);
    await user.tab();
    expect(botoes[0]).toHaveFocus();
  });
});
