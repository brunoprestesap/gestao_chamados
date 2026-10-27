// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O cadastro de material em seções (spec 0021, fatia 7): a lista da primeira
 * cotação com o link de cada seção, a navegação lateral pelo endereço, os
 * empenhos em cartões, as designações por papel, a escada de faixas e a
 * confirmação que diz o efeito antes de agir.
 *
 * covers: AC-18, AC-19, AC-20, AC-21 (spec 0021); AC-1, AC-5, AC-6, AC-7 (spec 0022)
 */

const m = vi.hoisted(() => ({
  acoes: {
    alterarSituacaoEmpenhoAction: vi.fn(),
    criarDesignacaoAction: vi.fn(),
    criarEmpenhoAction: vi.fn(),
    criarFaixaAction: vi.fn(),
    desativarFaixaAction: vi.fn(),
    movimentarEmpenhoAction: vi.fn(),
    revogarDesignacaoAction: vi.fn(),
    salvarParametrosAction: vi.fn(),
    aplicarImportacaoAction: vi.fn(),
    corrigirCodigoSinapiAction: vi.fn(),
    descartarImportacaoAction: vi.fn(),
    marcarAnomaliaAction: vi.fn(),
  },
  refresh: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../actions', () => m.acoes);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...resto
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean }) => {
    const props = { ...resto };
    delete props.scroll;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));
vi.mock('sonner', () => ({ toast: m.toast }));

import type { PainelMaterial } from '@/lib/material/cadastro';
import type { ParametrosComHistorico } from '@/lib/material/parametros';
import type { TabelasPreco } from '@/lib/material/tabelas';
import type { SecaoCadastro } from '@/shared/material/cadastro';

import { GerirMaterial } from '../GerirMaterial';

const SEM_DESATIVACAO = { desativadaEm: null, desativadaPorNome: null, desativadaMotivo: null };
const MOTIVO = 'Fim do contrato de apoio';

/** O motivo vai antes de confirmar (spec 0022, AC-5). */
async function escreverMotivo(user: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement) {
  await user.type(within(dialogo).getByLabelText('Motivo'), MOTIVO);
}

const painel: PainelMaterial = {
  primeiraCotacao: [
    { chave: 'empenho', secao: 'empenhos', pronto: true, elegiveis: 1 },
    { chave: 'faixas', secao: 'faixas', pronto: true, ativas: 2 },
    { chave: 'designacoes', secao: 'designacoes', pronto: false, faltam: ['gestor'] },
    { chave: 'semCodigo', secao: 'anexo-v', pronto: false, itens: 34 },
  ],
  notas: {
    empenhos: 1,
    designacoes: 2,
    faixas: 2,
    anexoV: { revisaoAberta: true, itens: 412 },
    sinapi: '2026-09',
  },
  contratosSemAnexo: [],
  sinapiAtrasado: false,
  itensSemCodigo: [],
  empenhos: [
    {
      id: 'e1',
      numero: '2026NE000184',
      exercicio: 2026,
      valorInicialCentavos: 161_100_00,
      valorLiquidoCentavos: 161_100_00,
      comprometidoCentavos: 99_800_00,
      saldoCentavos: 61_300_00,
      vigenciaFim: '2026-12-31',
      ativo: true,
      elegivel: true,
      projecao: null,
      movimentos: [],
      situacoes: [],
    },
    {
      id: 'e2',
      numero: '2025NE000412',
      exercicio: 2025,
      valorInicialCentavos: 1_000_00,
      valorLiquidoCentavos: 1_000_00,
      comprometidoCentavos: 0,
      saldoCentavos: 1_000_00,
      vigenciaFim: null,
      ativo: false,
      elegivel: false,
      projecao: null,
      movimentos: [],
      situacoes: [],
    },
  ],
  faixas: [
    { id: 'f1', nome: 'Faixa I', limiteCentavos: 5_000_00, ativa: true, ...SEM_DESATIVACAO },
    { id: 'f2', nome: 'Faixa II', limiteCentavos: 20_000_00, ativa: true, ...SEM_DESATIVACAO },
  ],
  designacoes: [
    {
      id: 'd1',
      userId: 'u1',
      nome: 'Marina Costa',
      papel: 'fiscal',
      faixaId: null,
      faixa: null,
      vigenciaInicio: '2026-03-01',
      vigenciaFim: null,
      ato: 'Portaria 112/2026',
      revogadaEm: null,
      revogadaPorNome: null,
      revogadaMotivo: null,
      vigente: true,
    },
    {
      id: 'd2',
      userId: 'u2',
      nome: 'Ana Ribeiro',
      papel: 'aprovador',
      faixaId: 'f2',
      faixa: 'Faixa II',
      vigenciaInicio: '2026-03-01',
      vigenciaFim: null,
      ato: 'Portaria 113/2026',
      revogadaEm: null,
      revogadaPorNome: null,
      revogadaMotivo: null,
      vigente: true,
    },
  ],
  usuarios: [],
};

const tabelas: TabelasPreco = {
  contratos: [],
  meses: [],
  mesMaisRecente: null,
  percentualSinapi: 10,
  abertas: [],
};

const parametros: ParametrosComHistorico = {
  percentualSinapi: 10,
  janelaDias: 90,
  parcelaRelevantePercentual: 20,
  raizCnpjContratada: '03543374',
  historico: [],
};

function abrir(secao: SecaoCadastro) {
  return render(
    <GerirMaterial secao={secao} painel={painel} tabelas={tabelas} parametros={parametros} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const f of Object.values(m.acoes)) f.mockResolvedValue({ ok: true });
});

describe('GerirMaterial', () => {
  it('a lista da primeira cotação conta os prontos e leva cada item à sua seção', () => {
    abrir('empenhos');

    const lista = screen.getByRole('region', { name: 'Para aprovar a primeira cotação' });
    expect(within(lista).getByText('2 de 4 prontos')).toBeInTheDocument();
    expect(within(lista).getByRole('link', { name: 'falta gestor' })).toHaveAttribute(
      'href',
      '/configuracoes/material?secao=designacoes',
    );
    expect(within(lista).getByRole('link', { name: '34 itens para ligar' })).toHaveAttribute(
      'href',
      '/configuracoes/material?secao=anexo-v',
    );
    expect(lista).not.toHaveTextContent(/caminho/);
  });

  it('a navegação lateral marca a seção do endereço e mostra a nota de cada uma', () => {
    abrir('faixas');

    const nav = screen.getByRole('navigation', { name: 'Seções do cadastro' });
    const atual = within(nav).getByRole('link', { current: 'page' });
    expect(atual).toHaveAttribute('href', '/configuracoes/material?secao=faixas');
    expect(atual).toHaveTextContent('2 ativas');
    expect(within(nav).getByRole('link', { name: /Anexo V/ })).toHaveTextContent('revisão aberta');
    expect(within(nav).getByRole('link', { name: /SINAPI/ })).toHaveTextContent('set/2026');
    expect(within(nav).getByRole('link', { name: 'Parâmetros' })).toBeInTheDocument();
  });

  it('só a seção do endereço aparece', () => {
    abrir('faixas');

    expect(screen.getByRole('heading', { name: 'Faixas de aprovação', level: 2 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Empenhos', level: 2 })).not.toBeInTheDocument();
  });

  it('os empenhos viram cartões com a situação, o saldo e a barra', () => {
    abrir('empenhos');

    const ativo = screen.getByRole('article', { name: '2026NE000184' });
    expect(within(ativo).getByText('Elegível')).toBeInTheDocument();
    expect(within(ativo).getByText('R$ 61.300,00')).toBeInTheDocument();
    expect(within(ativo).getByRole('img')).toBeInTheDocument();
    const inativo = screen.getByRole('article', { name: '2025NE000412' });
    expect(within(inativo).getByText('Inativo')).toBeInTheDocument();
    expect(within(inativo).getByRole('button', { name: 'Reativar…' })).toBeInTheDocument();
  });

  it('depois de cadastrar, o formulário do novo empenho reabre vazio', async () => {
    const user = userEvent.setup();
    abrir('empenhos');

    await user.click(screen.getByRole('button', { name: 'Novo empenho' }));
    let dialogo = screen.getByRole('dialog', { name: 'Novo empenho' });
    await user.type(within(dialogo).getByLabelText('Número'), '2026NE000999');
    await user.type(within(dialogo).getByLabelText('Valor inicial (R$)'), '1.000,00');
    await user.click(within(dialogo).getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(m.toast.success).toHaveBeenCalledWith('Empenho cadastrado.');

    await user.click(screen.getByRole('button', { name: 'Novo empenho' }));
    dialogo = screen.getByRole('dialog', { name: 'Novo empenho' });
    expect(within(dialogo).getByLabelText('Número')).toHaveValue('');
    expect(within(dialogo).getByLabelText('Valor inicial (R$)')).toHaveValue('');
    expect(within(dialogo).getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });

  it('inativar o empenho pede confirmação com o efeito e só age ao confirmar', async () => {
    const user = userEvent.setup();
    abrir('empenhos');

    const cartao = screen.getByRole('article', { name: '2026NE000184' });
    await user.click(within(cartao).getByRole('button', { name: 'Inativar…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Inativar o empenho 2026NE000184?' });
    expect(dialogo).toHaveTextContent('deixa de receber reservas');
    expect(m.acoes.alterarSituacaoEmpenhoAction).not.toHaveBeenCalled();

    await escreverMotivo(user, dialogo);
    await user.click(within(dialogo).getByRole('button', { name: 'Inativar empenho' }));

    await waitFor(() =>
      expect(m.acoes.alterarSituacaoEmpenhoAction).toHaveBeenCalledWith({
        empenhoId: 'e1',
        ativo: false,
        motivo: MOTIVO,
      }),
    );
    expect(m.toast.success).toHaveBeenCalledWith('Empenho inativado.');
  });

  it('as designações ficam por papel, com o ato, a vigência e a faixa do aprovador', () => {
    abrir('designacoes');

    const aprovadores = screen.getByRole('region', { name: 'Aprovador' });
    expect(aprovadores).toHaveTextContent('Ana Ribeiro');
    expect(aprovadores).toHaveTextContent('Faixa II · até R$ 20.000,00');
    expect(aprovadores).toHaveTextContent('desde 01/03/2026');
    expect(aprovadores).toHaveTextContent('Portaria 113/2026');
    expect(screen.getByRole('region', { name: 'Gestor do contrato' })).toHaveTextContent(
      'Ninguém designado.',
    );
  });

  it('revogar pede confirmação e cancelar não chama o servidor', async () => {
    const user = userEvent.setup();
    abrir('designacoes');

    await user.click(screen.getByRole('button', { name: 'Revogar a designação de Marina Costa' }));
    const dialogo = screen.getByRole('dialog', { name: 'Revogar a designação de Marina Costa?' });
    expect(dialogo).toHaveTextContent('deixa de agir como fiscal');
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(m.acoes.revogarDesignacaoAction).not.toHaveBeenCalled();
  });

  it('a escada de faixas avisa a faixa sem aprovador e o valor acima do qual ninguém aprova', () => {
    abrir('faixas');

    const escada = screen.getByRole('list', { name: 'Escada de limites' });
    const degraus = within(escada).getAllByRole('listitem');
    expect(degraus[0]).toHaveTextContent('Faixa I');
    expect(degraus[0]).toHaveTextContent('ninguém vigente');
    expect(degraus[1]).toHaveTextContent('Faixa II');
    expect(degraus[1]).toHaveTextContent('1 aprovador');
    expect(
      screen.getByText('Cotação acima de R$ 20.000,00 não tem quem aprove.'),
    ).toBeInTheDocument();
  });

  it('desativar a faixa diz quantos aprovadores perdem a faixa e confirma antes de agir', async () => {
    const user = userEvent.setup();
    abrir('faixas');

    await user.click(screen.getByRole('button', { name: 'Desativar a faixa Faixa II' }));
    const dialogo = screen.getByRole('dialog', { name: 'Desativar a faixa Faixa II?' });
    expect(dialogo).toHaveTextContent('1 aprovador vigente deixa de aprovar por ela');
    await escreverMotivo(user, dialogo);
    await user.click(within(dialogo).getByRole('button', { name: 'Desativar faixa' }));

    await waitFor(() =>
      expect(m.acoes.desativarFaixaAction).toHaveBeenCalledWith({ faixaId: 'f2', motivo: MOTIVO }),
    );
  });

  it('reativar o empenho inativo usa o botão comum e avisa ao confirmar', async () => {
    const user = userEvent.setup();
    abrir('empenhos');

    const cartao = screen.getByRole('article', { name: '2025NE000412' });
    await user.click(within(cartao).getByRole('button', { name: 'Reativar…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Reativar o empenho 2025NE000412?' });
    await escreverMotivo(user, dialogo);
    await user.click(within(dialogo).getByRole('button', { name: 'Reativar empenho' }));

    await waitFor(() =>
      expect(m.acoes.alterarSituacaoEmpenhoAction).toHaveBeenCalledWith({
        empenhoId: 'e2',
        ativo: true,
        motivo: MOTIVO,
      }),
    );
    expect(m.toast.success).toHaveBeenCalledWith('Empenho reativado.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a recusa do servidor vira toast de erro e o diálogo continua aberto, sem recarregar', async () => {
    const user = userEvent.setup();
    m.acoes.revogarDesignacaoAction.mockResolvedValue({
      ok: false,
      error: 'Designação não encontrada ou já revogada.',
    });
    abrir('designacoes');

    await user.click(screen.getByRole('button', { name: 'Revogar a designação de Marina Costa' }));
    const dialogo = screen.getByRole('dialog', { name: 'Revogar a designação de Marina Costa?' });
    await escreverMotivo(user, dialogo);
    await user.click(within(dialogo).getByRole('button', { name: 'Revogar designação' }));

    await waitFor(() =>
      expect(m.toast.error).toHaveBeenCalledWith('Designação não encontrada ou já revogada.'),
    );
    expect(
      screen.getByRole('dialog', { name: 'Revogar a designação de Marina Costa?' }),
    ).toBeVisible();
    expect(within(dialogo).getByLabelText('Motivo')).toHaveValue(MOTIVO);
    expect(m.toast.success).not.toHaveBeenCalled();
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it('o botão de fechar do diálogo se anuncia em português', async () => {
    const user = userEvent.setup();
    abrir('faixas');

    await user.click(screen.getByRole('button', { name: 'Desativar a faixa Faixa II' }));

    const dialogo = screen.getByRole('dialog', { name: 'Desativar a faixa Faixa II?' });
    expect(within(dialogo).getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  // Spec 0022: motivo no diálogo e histórico na linha.

  it('sem o mínimo de caracteres, o diálogo não envia e mostra o erro no campo (AC-5)', async () => {
    const user = userEvent.setup();
    abrir('faixas');

    await user.click(screen.getByRole('button', { name: 'Desativar a faixa Faixa II' }));
    const dialogo = screen.getByRole('dialog', { name: 'Desativar a faixa Faixa II?' });
    const campo = within(dialogo).getByLabelText('Motivo');
    await user.type(campo, 'curto');
    expect(within(dialogo).getByText('5 de 500')).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: 'Desativar faixa' }));

    expect(m.acoes.desativarFaixaAction).not.toHaveBeenCalled();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveFocus();
  });

  it('motivo só de espaços também é recusado no campo, sem enviar (AC-1, AC-5)', async () => {
    const user = userEvent.setup();
    abrir('designacoes');

    await user.click(screen.getByRole('button', { name: 'Revogar a designação de Marina Costa' }));
    const dialogo = screen.getByRole('dialog', { name: 'Revogar a designação de Marina Costa?' });
    const campo = within(dialogo).getByLabelText('Motivo');
    await user.type(campo, ' '.repeat(12));
    await user.click(within(dialogo).getByRole('button', { name: 'Revogar designação' }));

    expect(m.acoes.revogarDesignacaoAction).not.toHaveBeenCalled();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveFocus();
  });

  it('o motivo digitado vai para o servidor junto do id (AC-1)', async () => {
    const user = userEvent.setup();
    abrir('designacoes');

    await user.click(screen.getByRole('button', { name: 'Revogar a designação de Marina Costa' }));
    const dialogo = screen.getByRole('dialog', { name: 'Revogar a designação de Marina Costa?' });
    await escreverMotivo(user, dialogo);
    await user.click(within(dialogo).getByRole('button', { name: 'Revogar designação' }));

    await waitFor(() =>
      expect(m.acoes.revogarDesignacaoAction).toHaveBeenCalledWith(
        expect.objectContaining({ motivo: MOTIVO }),
      ),
    );
  });

  it('fechar e reabrir o diálogo traz o campo de motivo vazio (AC-5)', async () => {
    const user = userEvent.setup();
    abrir('faixas');

    await user.click(screen.getByRole('button', { name: 'Desativar a faixa Faixa II' }));
    let dialogo = screen.getByRole('dialog', { name: 'Desativar a faixa Faixa II?' });
    await user.type(within(dialogo).getByLabelText('Motivo'), 'texto que fica para trás');
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desativar a faixa Faixa II' }));
    dialogo = screen.getByRole('dialog', { name: 'Desativar a faixa Faixa II?' });
    expect(within(dialogo).getByLabelText('Motivo')).toHaveValue('');
    expect(within(dialogo).getByText('0 de 500')).toBeInTheDocument();
  });

  it('a recusa do servidor ao motivo aparece no campo, além do toast (AC-5)', async () => {
    const user = userEvent.setup();
    m.acoes.revogarDesignacaoAction.mockResolvedValue({
      ok: false,
      error: 'Até 500 caracteres.',
      campo: 'motivo',
    });
    abrir('designacoes');

    await user.click(screen.getByRole('button', { name: 'Revogar a designação de Marina Costa' }));
    const dialogo = screen.getByRole('dialog', { name: 'Revogar a designação de Marina Costa?' });
    await escreverMotivo(user, dialogo);
    await user.click(within(dialogo).getByRole('button', { name: 'Revogar designação' }));

    const campo = within(dialogo).getByLabelText('Motivo');
    await waitFor(() => expect(campo).toHaveAccessibleDescription(/Até 500 caracteres\./));
    expect(m.toast.error).toHaveBeenCalledWith('Até 500 caracteres.');
    expect(campo).toHaveFocus();
  });

  it('o histórico mostra quem, quando e por quê, e as frases do ato antigo (AC-6, AC-7)', () => {
    const p = structuredClone(painel);
    p.designacoes.push({
      ...p.designacoes[0]!,
      id: 'd9',
      nome: 'Pedro Antigo',
      revogadaEm: '2026-05-04T15:30:00.000Z',
      revogadaPorNome: 'Carla Admin',
      revogadaMotivo: null,
      vigente: false,
    });
    p.faixas.push({
      id: 'f9',
      nome: 'Faixa velha',
      limiteCentavos: 1_00,
      ativa: false,
      ...SEM_DESATIVACAO,
    });
    p.empenhos[1]!.situacoes = [];
    p.empenhos[0]!.situacoes = [
      {
        ativo: false,
        motivo: 'Saldo bloqueado',
        porNome: 'Carla Admin',
        em: '2026-06-01T12:00:00.000Z',
      },
      {
        ativo: true,
        motivo: 'Saldo liberado',
        porNome: 'Carla Admin',
        em: '2026-06-02T12:00:00.000Z',
      },
    ];
    const { unmount } = render(
      <GerirMaterial secao="empenhos" painel={p} tabelas={null} parametros={null} />,
    );

    const ativo = screen.getByRole('article', { name: '2026NE000184' });
    const itens = within(ativo).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Reativado');
    expect(itens[0]).toHaveTextContent('02/06/2026');
    expect(itens[0]).toHaveTextContent('Motivo: Saldo liberado');
    expect(itens[1]).toHaveTextContent('Inativado');
    expect(within(ativo).queryByText('Inativado antes do registro do motivo')).toBeNull();
    const inativo = screen.getByRole('article', { name: '2025NE000412' });
    expect(within(inativo).getByText('Inativado antes do registro do motivo')).toBeInTheDocument();
    unmount();

    render(<GerirMaterial secao="faixas" painel={p} tabelas={null} parametros={null} />);
    expect(screen.getByText('Desativada antes do registro do motivo')).toBeInTheDocument();
  });
});
