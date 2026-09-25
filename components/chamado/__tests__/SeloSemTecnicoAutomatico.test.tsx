// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AtribuicaoAutomaticaGestao } from '@/shared/chamados/atribuicao-automatica.constants';

import { SeloSemTecnicoAutomatico } from '../SeloSemTecnicoAutomatico';

/**
 * O selo "Sem técnico automático" (spec 0008, AC-15): aparece na lista só
 * enquanto o chamado não tem técnico, e é sempre texto, nunca só cor.
 */

const semTecnico: AtribuicaoAutomaticaGestao = {
  resultado: 'sem_tecnico',
  motivo: 'sem_vaga',
  tecnicoNome: null,
  em: '2026-09-25T15:00:00.000Z',
};

describe('SeloSemTecnicoAutomatico', () => {
  it('mostra o selo com texto quando ficou sem técnico e ninguém atribuiu', () => {
    render(<SeloSemTecnicoAutomatico atribuicaoAutomatica={semTecnico} assignedToUserId={null} />);

    expect(screen.getByText('Sem técnico automático')).toBeInTheDocument();
  });

  it('não leva o motivo: ele fica no detalhe', () => {
    render(<SeloSemTecnicoAutomatico atribuicaoAutomatica={semTecnico} assignedToUserId={null} />);

    expect(screen.queryByText(/limite de carga/)).not.toBeInTheDocument();
  });

  it('some assim que o Preposto atribui à mão', () => {
    render(
      <SeloSemTecnicoAutomatico
        atribuicaoAutomatica={semTecnico}
        assignedToUserId={'b'.repeat(24)}
      />,
    );

    expect(screen.queryByText('Sem técnico automático')).not.toBeInTheDocument();
  });

  it('não aparece quando o passo atribuiu', () => {
    render(
      <SeloSemTecnicoAutomatico
        atribuicaoAutomatica={{ ...semTecnico, resultado: 'atribuido', motivo: null }}
        assignedToUserId={'b'.repeat(24)}
      />,
    );

    expect(screen.queryByText('Sem técnico automático')).not.toBeInTheDocument();
  });

  it.each([null, undefined])('não aparece sem resultado (%s)', (valor) => {
    render(<SeloSemTecnicoAutomatico atribuicaoAutomatica={valor} assignedToUserId={null} />);

    expect(screen.queryByText('Sem técnico automático')).not.toBeInTheDocument();
  });
});
