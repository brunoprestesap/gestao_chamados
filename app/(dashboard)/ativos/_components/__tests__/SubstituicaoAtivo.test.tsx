// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SituacaoSubstituicao } from '@/lib/ativos/substituicao';

/**
 * A situação de substituição na ficha (spec 0015): o selo do candidato com os
 * motivos, o selo da dispensa com motivo, autor e data, a nota de idade não
 * avaliada, a falha sem botões e o "Voltar a sinalizar" com confirmação.
 *
 * covers: AC-2, AC-10, AC-12, AC-15
 */

const refresh = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const acoes = vi.hoisted(() => ({
  dispensarSubstituicaoAction: vi.fn(),
  desfazerDispensaSubstituicaoAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../actions', () => acoes);

import { SubstituicaoAtivo } from '../SubstituicaoAtivo';

const ID = '507f1f77bcf86cd799439011';

const situacao = (extra: Partial<SituacaoSubstituicao>): SituacaoSubstituicao => ({
  situacao: 'fora',
  motivos: [],
  idadeNaoAvaliada: null,
  custoNaoAvaliado: false,
  dispensaVigente: false,
  dispensaGravadaAte: null,
  ...extra,
});

const CANDIDATO = situacao({
  situacao: 'candidato',
  motivos: [
    { criterio: 'idade', anos: 14, vidaUtilAnos: 10 },
    { criterio: 'corretivos', quantidade: 5, limite: 4 },
  ],
});

const DISPENSADO = situacao({
  situacao: 'dispensado',
  motivos: [{ criterio: 'idade', anos: 14, vidaUtilAnos: 10 }],
  dispensaVigente: true,
  dispensaGravadaAte: '2027-04-06',
  dispensa: {
    ate: '2027-04-06',
    motivo: 'Troca prevista no plano de compras de 2027.',
    porNome: 'Ana Preposto',
    em: '2026-10-06T15:00:00.000Z',
  },
});

const secao = () => screen.getByRole('region', { name: 'Substituição do equipamento' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubstituicaoAtivo', () => {
  it('candidato mostra o selo, os motivos em texto curto e o botão Dispensar', () => {
    render(<SubstituicaoAtivo ativoId={ID} codigo="11997" situacao={CANDIDATO} />);
    const s = secao();
    expect(within(s).getByText('Candidato à substituição')).toBeInTheDocument();
    expect(within(s).getByText('14 anos, vida útil 10')).toBeInTheDocument();
    expect(within(s).getByText('5 corretivos em 12 meses, limite 4')).toBeInTheDocument();
    expect(within(s).getByRole('button', { name: 'Dispensar 11997' })).toBeInTheDocument();
    expect(within(s).queryByText(/Dispensado antes/)).not.toBeInTheDocument();
  });

  it('candidato com dispensa que não vale mais avisa até quando ela foi', () => {
    render(
      <SubstituicaoAtivo
        ativoId={ID}
        codigo="9003"
        situacao={{ ...CANDIDATO, dispensaGravadaAte: '2027-04-06' }}
      />,
    );
    expect(screen.getByText('Dispensado antes até 06/04/2027')).toBeInTheDocument();
  });

  it('dispensado mostra até quando, o motivo, quem dispensou e o botão de voltar', () => {
    render(<SubstituicaoAtivo ativoId={ID} codigo="9003" situacao={DISPENSADO} />);
    const s = secao();
    expect(within(s).getByText('Substituição dispensada até 06/04/2027')).toBeInTheDocument();
    expect(within(s).getByText('Troca prevista no plano de compras de 2027.')).toBeInTheDocument();
    expect(within(s).getByText(/Ana Preposto/)).toBeInTheDocument();
    expect(within(s).getByRole('button', { name: 'Voltar a sinalizar' })).toBeInTheDocument();
    expect(within(s).queryByRole('button', { name: /Dispensar/ })).not.toBeInTheDocument();
    expect(within(s).queryByText('Candidato à substituição')).not.toBeInTheDocument();
  });

  it('fora com idade não avaliada mostra só a nota, sem selo nem botão', () => {
    render(
      <SubstituicaoAtivo
        ativoId={ID}
        codigo="30001"
        situacao={situacao({ idadeNaoAvaliada: 'sem_data' })}
      />,
    );
    const s = secao();
    expect(
      within(s).getByText('Idade não avaliada: o ativo não tem data de instalação nem de tombo'),
    ).toBeInTheDocument();
    expect(within(s).queryByRole('button')).not.toBeInTheDocument();
  });

  it('candidato com a categoria sem vida útil mostra o selo e a nota juntos', () => {
    render(
      <SubstituicaoAtivo
        ativoId={ID}
        codigo="MNT-0001"
        situacao={situacao({
          situacao: 'candidato',
          motivos: [{ criterio: 'reincidencia', quantidade: 3, limite: 3 }],
          idadeNaoAvaliada: 'sem_vida_util',
        })}
      />,
    );
    expect(screen.getByText('3 em 90 dias, limite 3')).toBeInTheDocument();
    expect(
      screen.getByText('Idade não avaliada: a categoria não tem vida útil'),
    ).toBeInTheDocument();
  });

  it('fora e sem nota não mostra nada', () => {
    const { container } = render(
      <SubstituicaoAtivo ativoId={ID} codigo="10698" situacao={situacao({})} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('falha na avaliação mostra o aviso e nenhum botão', () => {
    render(<SubstituicaoAtivo ativoId={ID} codigo="11997" situacao={null} />);
    const s = secao();
    expect(
      within(s).getByText('Não foi possível avaliar a substituição agora.'),
    ).toBeInTheDocument();
    expect(within(s).queryByRole('button')).not.toBeInTheDocument();
  });

  it('voltar a sinalizar pede confirmação, chama a action e recarrega', async () => {
    const user = userEvent.setup();
    acoes.desfazerDispensaSubstituicaoAction.mockResolvedValue({ ok: true });
    render(<SubstituicaoAtivo ativoId={ID} codigo="9003" situacao={DISPENSADO} />);

    await user.click(screen.getByRole('button', { name: 'Voltar a sinalizar' }));
    const dialogo = screen.getByRole('dialog', { name: 'Voltar a sinalizar 9003?' });
    expect(acoes.desfazerDispensaSubstituicaoAction).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole('button', { name: 'Voltar a sinalizar' }));
    expect(acoes.desfazerDispensaSubstituicaoAction).toHaveBeenCalledWith({ ativoId: ID });
    expect(toast.success).toHaveBeenCalledWith('9003 voltou a ser avaliado para substituição.');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelar a confirmação não chama a action', async () => {
    const user = userEvent.setup();
    render(<SubstituicaoAtivo ativoId={ID} codigo="9003" situacao={DISPENSADO} />);
    await user.click(screen.getByRole('button', { name: 'Voltar a sinalizar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(acoes.desfazerDispensaSubstituicaoAction).not.toHaveBeenCalled();
  });

  it('recusa do servidor ao voltar a sinalizar vira aviso de erro e a tela recarrega', async () => {
    const user = userEvent.setup();
    acoes.desfazerDispensaSubstituicaoAction.mockResolvedValue({
      ok: false,
      error: 'Este ativo não tem dispensa em vigor.',
    });
    render(<SubstituicaoAtivo ativoId={ID} codigo="9003" situacao={DISPENSADO} />);
    await user.click(screen.getByRole('button', { name: 'Voltar a sinalizar' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Voltar a sinalizar' }),
    );
    expect(toast.error).toHaveBeenCalledWith('Este ativo não tem dispensa em vigor.');
    expect(refresh).toHaveBeenCalled();
  });
});
