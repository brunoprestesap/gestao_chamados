// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O diálogo de dispensa (spec 0015), o mesmo na ficha e na linha do IMR: o
 * motivo de 10 a 500 caracteres sem os espaços das pontas, o erro de motivo no
 * próprio diálogo, e a recusa do servidor (ativo que mudou) fechando o
 * diálogo e recarregando a tela.
 *
 * covers: AC-11, AC-13
 */

const refresh = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const acoes = vi.hoisted(() => ({ dispensarSubstituicaoAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../actions', () => acoes);

import { DialogoDispensaSubstituicao } from '../DialogoDispensaSubstituicao';

const ID = '507f1f77bcf86cd799439011';
const MOTIVO = 'Troca prevista no plano de compras de 2027.';

async function abrir() {
  const user = userEvent.setup();
  render(<DialogoDispensaSubstituicao ativoId={ID} codigo="11997" />);
  await user.click(screen.getByRole('button', { name: 'Dispensar 11997' }));
  const dialogo = screen.getByRole('dialog', { name: 'Dispensar 11997' });
  return {
    user,
    dialogo,
    motivo: within(dialogo).getByLabelText('Motivo'),
    confirmar: within(dialogo).getByRole('button', { name: 'Dispensar' }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DialogoDispensaSubstituicao', () => {
  it('o campo de motivo tem rótulo e ajuda ligada, com a contagem de caracteres', async () => {
    const { user, motivo } = await abrir();
    expect(motivo).toHaveAccessibleDescription(/De 10 a 500 caracteres \(0 agora\)/);
    await user.type(motivo, 'abc');
    expect(motivo).toHaveAccessibleDescription(/\(3 agora\)/);
  });

  it('só libera a confirmação com 10 caracteres ou mais, sem contar os espaços das pontas', async () => {
    const { user, motivo, confirmar } = await abrir();
    expect(confirmar).toBeDisabled();
    await user.type(motivo, '   123456789   ');
    expect(confirmar).toBeDisabled();
    await user.type(motivo, '0');
    expect(confirmar).toBeEnabled();
  });

  it('o campo para em 500 caracteres, e 500 ainda pode ser confirmado', async () => {
    const { user, motivo, confirmar } = await abrir();
    await user.click(motivo);
    await user.paste('x'.repeat(501));
    expect(motivo).toHaveValue('x'.repeat(500));
    expect(motivo).toHaveAttribute('maxlength', '500');
    expect(confirmar).toBeEnabled();
  });

  it('confirmar manda o ativo e o motivo, avisa por 6 meses, fecha e recarrega', async () => {
    acoes.dispensarSubstituicaoAction.mockResolvedValue({ ok: true });
    const { user, motivo, confirmar } = await abrir();
    await user.type(motivo, MOTIVO);
    await user.click(confirmar);
    expect(acoes.dispensarSubstituicaoAction).toHaveBeenCalledWith({ ativoId: ID, motivo: MOTIVO });
    expect(toast.success).toHaveBeenCalledWith('Substituição de 11997 dispensada por 6 meses.');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('erro de motivo do servidor fica no diálogo, sem recarregar', async () => {
    acoes.dispensarSubstituicaoAction.mockResolvedValue({
      ok: false,
      error: 'Motivo deve ter de 10 a 500 caracteres.',
    });
    const { user, motivo, confirmar, dialogo } = await abrir();
    await user.type(motivo, MOTIVO);
    await user.click(confirmar);
    expect(within(dialogo).getByRole('alert')).toHaveTextContent(
      'Motivo deve ter de 10 a 500 caracteres.',
    );
    expect(motivo).toHaveAttribute('aria-invalid', 'true');
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    'Este ativo não é mais candidato à substituição.',
    'Este ativo já foi dispensado por Ana Preposto.',
    'O ativo mudou enquanto você confirmava. Tente de novo.',
  ])('recusa "%s" vira aviso, fecha o diálogo e recarrega a tela', async (erro) => {
    acoes.dispensarSubstituicaoAction.mockResolvedValue({ ok: false, error: erro });
    const { user, motivo, confirmar } = await abrir();
    await user.type(motivo, MOTIVO);
    await user.click(confirmar);
    expect(toast.error).toHaveBeenCalledWith(erro);
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reabrir o diálogo começa com o motivo vazio', async () => {
    const { user, motivo } = await abrir();
    await user.type(motivo, MOTIVO);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Dispensar 11997' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Motivo')).toHaveValue('');
  });
});
