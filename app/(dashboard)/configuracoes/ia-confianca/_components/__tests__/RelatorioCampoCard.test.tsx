// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RelatorioCampo } from '@/lib/ia-confianca/calibragem';

import { RelatorioCampoCard } from '../RelatorioCampoCard';

/**
 * O cartão de relatório por campo (spec 0006).
 *
 * covers: AC-2 (tabela de cortes com contagem e porcentagem), AC-3 (aviso de
 * amostra insuficiente), AC-4 (traço em linha zerada, sugestão do menor
 * corte elegível), AC-11 (aviso de viés só no serviço)
 */

const AMOSTRA_INSUFICIENTE: RelatorioCampo = {
  campo: 'servico',
  totalElegivel: 5,
  amostraMinima: 30,
  amostraSuficiente: false,
  cortes: [],
  sugestao: null,
};

const AMOSTRA_SUFICIENTE_COM_SUGESTAO: RelatorioCampo = {
  campo: 'prioridade',
  totalElegivel: 6,
  amostraMinima: 3,
  amostraSuficiente: true,
  cortes: [
    { corte: 1.0, total: 0, percentualAcerto: null },
    { corte: 0.95, total: 2, percentualAcerto: 1 },
    { corte: 0.9, total: 4, percentualAcerto: 1 },
    { corte: 0.85, total: 5, percentualAcerto: 0.8 },
  ],
  sugestao: 0.9,
};

const AMOSTRA_SUFICIENTE_SEM_SUGESTAO: RelatorioCampo = {
  campo: 'prioridade',
  totalElegivel: 4,
  amostraMinima: 3,
  amostraSuficiente: true,
  cortes: [
    { corte: 1.0, total: 0, percentualAcerto: null },
    { corte: 0.95, total: 4, percentualAcerto: 0.5 },
  ],
  sugestao: null,
};

// ── amostra insuficiente · AC-3 ───────────────────────────────────

describe('RelatorioCampoCard · amostra insuficiente', () => {
  it('mostra o total encontrado e o aviso, sem tabela nem sugestão', () => {
    // Act
    render(<RelatorioCampoCard relatorio={AMOSTRA_INSUFICIENTE} />);

    // Assert
    expect(screen.getByText(/amostra pequena demais/i)).toBeInTheDocument();
    expect(screen.getByText(/5 de 30/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/sugestão: confiança/i)).not.toBeInTheDocument();
  });
});

// ── tabela de cortes com amostra suficiente · AC-2, AC-4 ──────────

describe('RelatorioCampoCard · amostra suficiente', () => {
  it('mostra a tabela com uma linha por corte, contagem e porcentagem', () => {
    // Act
    render(<RelatorioCampoCard relatorio={AMOSTRA_SUFICIENTE_COM_SUGESTAO} />);

    // Assert
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(
      AMOSTRA_SUFICIENTE_COM_SUGESTAO.cortes.length + 1, // +1 pelo cabeçalho
    );
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('mostra um traço na linha com contagem zero, nunca uma porcentagem', () => {
    // Act
    render(<RelatorioCampoCard relatorio={AMOSTRA_SUFICIENTE_COM_SUGESTAO} />);

    // Assert: a linha do corte 1.00 tem total 0
    const linhaZerada = screen.getByText('≥ 1.00').closest('tr')!;
    expect(linhaZerada).toHaveTextContent('—');
  });

  it('sugere o menor corte elegível, não o de maior confiança', () => {
    // Act
    render(<RelatorioCampoCard relatorio={AMOSTRA_SUFICIENTE_COM_SUGESTAO} />);

    // Assert: 0.95 também bate 100%, mas 0.90 é o menor corte elegível
    expect(screen.getByText(/sugestão: confiança ≥ 0\.90/i)).toBeInTheDocument();
  });

  it('sem nenhum corte batendo a meta, não mostra nenhuma sugestão', () => {
    // Act
    render(<RelatorioCampoCard relatorio={AMOSTRA_SUFICIENTE_SEM_SUGESTAO} />);

    // Assert
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/sugestão:/i)).not.toBeInTheDocument();
  });
});

// ── aviso de viés só no serviço · AC-11 ───────────────────────────

describe('RelatorioCampoCard · aviso de viés', () => {
  it('mostra o aviso fixo na seção servico', () => {
    // Act
    render(<RelatorioCampoCard relatorio={{ ...AMOSTRA_INSUFICIENTE, campo: 'servico' }} />);

    // Assert
    expect(screen.getByText(/vê a sugestão de serviço já preenchida/i)).toBeInTheDocument();
  });

  it('nunca mostra o aviso na seção prioridade', () => {
    // Act
    render(<RelatorioCampoCard relatorio={{ ...AMOSTRA_INSUFICIENTE, campo: 'prioridade' }} />);

    // Assert
    expect(screen.queryByText(/vê a sugestão de serviço já preenchida/i)).not.toBeInTheDocument();
  });
});
