// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Seletor de contrato e mês (spec 0016, AC-4 e AC-5): formulário GET, os
 * meses acompanham o contrato escolhido e um contrato sem meses avisa e não
 * deixa enviar.
 *
 * covers: AC-4, AC-5
 */
import { type OpcaoContrato, SeletorContratoMes } from '../SeletorContratoMes';

const opcoes: OpcaoContrato[] = [
  { id: 'a', rotulo: '12/2025 · Refrigeração (inativo)', meses: ['2026-10', '2026-09', '2026-08'] },
  { id: 'b', rotulo: '20/2026 · Elevadores', meses: ['2026-10', '2026-09'] },
  { id: 'c', rotulo: '30/2027 · Predial', meses: [] },
];

const mesesNaTela = () =>
  screen.getAllByRole('option').filter((o) => /^\d{2}\/\d{4}$/.test(o.textContent ?? ''));

describe('SeletorContratoMes', () => {
  it('é um formulário GET para a própria tela, com campos rotulados', () => {
    const { container } = render(<SeletorContratoMes opcoes={opcoes} />);

    const form = container.querySelector('form')!;
    expect(form).toHaveAttribute('method', 'GET');
    expect(form).toHaveAttribute('action', '/relatorios/contrato');
    expect(screen.getByLabelText('Contrato')).toHaveAttribute('name', 'contratoId');
    expect(screen.getByLabelText('Mês')).toHaveAttribute('name', 'mes');
  });

  it('mostra o contrato inativo com a marca e os meses como mm/aaaa (AC-4, AC-5)', () => {
    render(<SeletorContratoMes opcoes={opcoes} />);

    expect(screen.getByRole('option', { name: '12/2025 · Refrigeração (inativo)' })).toBeVisible();
    expect(mesesNaTela().map((o) => o.textContent)).toEqual(['10/2026', '09/2026', '08/2026']);
  });

  it('volta com o contrato e o mês que vieram na URL', () => {
    render(<SeletorContratoMes opcoes={opcoes} contratoId="b" mes="2026-09" />);

    expect(screen.getByLabelText('Contrato')).toHaveValue('b');
    expect(screen.getByLabelText('Mês')).toHaveValue('2026-09');
  });

  it('troca a lista de meses quando o contrato muda', async () => {
    const user = userEvent.setup();
    render(<SeletorContratoMes opcoes={opcoes} />);

    await user.selectOptions(screen.getByLabelText('Contrato'), 'b');

    expect(mesesNaTela().map((o) => o.textContent)).toEqual(['10/2026', '09/2026']);
  });

  it('contrato sem meses avisa e desabilita o envio (AC-5)', async () => {
    const user = userEvent.setup();
    render(<SeletorContratoMes opcoes={opcoes} />);

    await user.selectOptions(screen.getByLabelText('Contrato'), 'c');

    expect(screen.getByText('Este contrato ainda não tem meses para relatar.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver relatório' })).toBeDisabled();
    expect(screen.getByLabelText('Mês')).toBeDisabled();
  });
});
