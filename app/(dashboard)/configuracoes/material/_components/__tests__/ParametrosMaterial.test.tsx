// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A aba Parâmetros do cadastro de material (spec 0019, fatia 5): os quatro
 * campos com os valores vigentes, a gravação que manda os valores lidos junto
 * dos novos (para a escrita ser condicional) e o histórico de cada mudança.
 *
 * covers: AC-42; spec 0021, AC-22
 */

const m = vi.hoisted(() => ({
  salvarParametrosAction: vi.fn(),
  refresh: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../actions', () => ({ salvarParametrosAction: m.salvarParametrosAction }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('sonner', () => ({ toast: m.toast }));

import type { ParametrosComHistorico } from '@/lib/material/parametros';

import { AbaParametros } from '../ParametrosMaterial';

const vigentes: ParametrosComHistorico = {
  percentualSinapi: 10,
  janelaDias: 90,
  parcelaRelevantePercentual: 20,
  raizCnpjContratada: '03543374',
  historico: [],
};
const lidos = {
  percentualSinapi: 10,
  janelaDias: 90,
  parcelaRelevantePercentual: 20,
  raizCnpjContratada: '03543374',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.salvarParametrosAction.mockResolvedValue({ ok: true });
});

describe('AbaParametros', () => {
  it('mostra os quatro parâmetros vigentes, cada um com o rótulo e a ajuda ligados ao campo', () => {
    render(<AbaParametros parametros={vigentes} />);

    expect(screen.getByLabelText('Percentual admitido sobre o SINAPI')).toHaveValue('10');
    expect(screen.getByLabelText('Janela do fracionamento e da reincidência')).toHaveValue('90');
    expect(screen.getByLabelText('Parcela relevante do saldo')).toHaveValue('20');
    expect(screen.getByLabelText('Raiz do CNPJ da contratada')).toHaveAccessibleDescription(
      /8 primeiros dígitos/,
    );
  });

  it('a unidade fica junto do campo e a taxa de administração aparece em 0%, travada (spec 0021)', () => {
    render(<AbaParametros parametros={vigentes} />);

    expect(
      screen.getByLabelText('Janela do fracionamento e da reincidência'),
    ).toHaveAccessibleDescription(/^Em dias\./);
    expect(screen.getByLabelText('Parcela relevante do saldo')).toHaveAccessibleDescription(
      /^Em %\./,
    );
    const taxa = screen.getByLabelText('Taxa de administração sobre material');
    expect(taxa).toHaveValue('0');
    expect(taxa).toBeDisabled();
  });

  it('sem mudança registrada, diz que valem os padrões', () => {
    render(<AbaParametros parametros={vigentes} />);

    expect(screen.getByText('Nenhuma mudança registrada: valem os padrões.')).toBeInTheDocument();
  });

  it('grava os valores novos junto dos lidos ao abrir, e recarrega a tela', async () => {
    const user = userEvent.setup();
    render(<AbaParametros parametros={vigentes} />);

    const janela = screen.getByLabelText('Janela do fracionamento e da reincidência');
    await user.clear(janela);
    await user.type(janela, '30');
    await user.click(screen.getByRole('button', { name: 'Gravar parâmetros' }));

    await waitFor(() =>
      expect(m.salvarParametrosAction).toHaveBeenCalledWith({
        lidos,
        novos: { ...lidos, janelaDias: 30 },
      }),
    );
    expect(m.toast.success).toHaveBeenCalledWith('Parâmetros gravados.');
    expect(m.refresh).toHaveBeenCalled();
  });

  it('a recusa do servidor (outro Admin gravou antes) vira toast de erro, sem recarregar', async () => {
    m.salvarParametrosAction.mockResolvedValue({ ok: false, error: 'Recarregue a página.' });
    const user = userEvent.setup();
    render(<AbaParametros parametros={vigentes} />);

    await user.click(screen.getByRole('button', { name: 'Gravar parâmetros' }));

    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith('Recarregue a página.'));
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it('a gravação com o recálculo da anomalia falho avisa em vez de comemorar', async () => {
    m.salvarParametrosAction.mockResolvedValue({ ok: true, aviso: 'Recálculo pendente.' });
    const user = userEvent.setup();
    render(<AbaParametros parametros={vigentes} />);

    await user.click(screen.getByRole('button', { name: 'Gravar parâmetros' }));

    await waitFor(() => expect(m.toast.warning).toHaveBeenCalledWith('Recálculo pendente.'));
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it('o histórico mostra o campo pelo rótulo, de onde para onde e quem mudou', () => {
    render(
      <AbaParametros
        parametros={{
          ...vigentes,
          historico: [
            {
              campo: 'janelaDias',
              de: 90,
              para: 30,
              porNome: 'Maria',
              em: '2026-10-20T15:00:00.000Z',
            },
          ],
        }}
      />,
    );

    const linha = screen.getByRole('row', { name: /Janela do fracionamento/ });
    expect(linha).toHaveTextContent('90 dias');
    expect(linha).toHaveTextContent('30 dias');
    expect(linha).toHaveTextContent('Maria');
  });
});
