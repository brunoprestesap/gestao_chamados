// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MENSAGENS_FECHAMENTO } from '@/shared/imr-contrato/imr-contrato.constants';

/**
 * O diálogo de fechamento do IMR do contrato (spec 0023): manda os pontos do
 * I3 e do I4 que a pessoa viu e, quando a apuração mudou, recarrega a tela sem
 * fechar o diálogo nem perder o que foi digitado.
 *
 * covers: AC-10
 */

const refresh = vi.hoisted(() => vi.fn());
const fecharMesImrAction = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../actions', () => ({ fecharMesImrAction, reabrirMesImrAction: vi.fn() }));

import { FecharMes } from '../FechamentoImr';

const MES = { contratoId: '6ae0d1d5f82121a51e93a17e', competencia: '2026-09' };

async function preencherEFechar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Fechar o mês' }));
  const dialogo = screen.getByRole('dialog');
  await user.type(screen.getByLabelText('Pontos (0 a 40)'), '40');
  await user.type(screen.getByLabelText('Pontos (0 a 20)'), '18');
  await user.click(within(dialogo).getByRole('button', { name: 'Fechar o mês' }));
  return dialogo;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FecharMes', () => {
  it('envia os pontos do I3 e do I4 que estão na tela', async () => {
    fecharMesImrAction.mockResolvedValue({ ok: true, versao: 1 });
    const user = userEvent.setup();
    render(<FecharMes mes={MES} i3={15} i4={20} />);

    await preencherEFechar(user);

    expect(fecharMesImrAction).toHaveBeenCalledWith(
      expect.objectContaining({ i1Pontos: 40, i2Pontos: 18, pontosVistos: { i3: 15, i4: 20 } }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('com a prévia mudada, recarrega a tela e mantém o diálogo com os pontos digitados', async () => {
    fecharMesImrAction.mockResolvedValue({ ok: false, error: MENSAGENS_FECHAMENTO.previaMudou });
    const user = userEvent.setup();
    render(<FecharMes mes={MES} i3={15} i4={20} />);

    const dialogo = await preencherEFechar(user);

    expect(refresh).toHaveBeenCalledOnce();
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByText(MENSAGENS_FECHAMENTO.previaMudou)).toBeInTheDocument();
    expect(screen.getByLabelText('Pontos (0 a 40)')).toHaveValue('40');
    expect(screen.getByLabelText('Pontos (0 a 20)')).toHaveValue('18');
  });

  it('com a prévia mudada, o novo envio leva os pontos que a tela recarregada trouxe', async () => {
    fecharMesImrAction.mockResolvedValueOnce({
      ok: false,
      error: MENSAGENS_FECHAMENTO.previaMudou,
    });
    fecharMesImrAction.mockResolvedValueOnce({ ok: true, versao: 1 });
    const user = userEvent.setup();
    const { rerender } = render(<FecharMes mes={MES} i3={15} i4={20} />);
    await preencherEFechar(user);

    // O `router.refresh()` traz as props novas do servidor.
    rerender(<FecharMes mes={MES} i3={10} i4={20} />);
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar o mês' }),
    );

    expect(fecharMesImrAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ pontosVistos: { i3: 10, i4: 20 } }),
    );
  });

  it('outro erro não recarrega a tela', async () => {
    fecharMesImrAction.mockResolvedValue({ ok: false, error: MENSAGENS_FECHAMENTO.jaFechado });
    const user = userEvent.setup();
    render(<FecharMes mes={MES} i3={15} i4={20} />);

    await preencherEFechar(user);

    expect(refresh).not.toHaveBeenCalled();
  });
});
