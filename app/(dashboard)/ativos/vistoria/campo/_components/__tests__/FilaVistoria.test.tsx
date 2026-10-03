// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OperacaoGuardada } from '@/lib/vistoria-offline';

import { codigoNaTela, etiquetaParaColar, FilaVistoria } from '../FilaVistoria';

/**
 * A fila do aparelho na tela de campo (spec 0012): quantas aguardam envio, o
 * botão Sincronizar, o resultado de cada item, a etiqueta MNT depois que o
 * cadastro interno sobe e o "Já conferido" com o que a pessoa informou.
 *
 * covers: AC-6, AC-8, AC-10, AC-12
 */

let n = 0;
function op(over: Partial<OperacaoGuardada> = {}): OperacaoGuardada {
  n += 1;
  return {
    clientOpId: `op-${n}`,
    userId: 'u1',
    estado: 'pendente',
    criadaEm: '2026-10-02T12:00:00.000Z',
    operacao: {
      clientOpId: `op-${n}`,
      tipo: 'conferencia',
      campanhaId: 'c1',
      ativoId: 'a1',
      localizacaoId: 'l1',
      conferidoEm: '2026-10-02T12:00:00.000Z',
    } as OperacaoGuardada['operacao'],
    rotulo: { codigo: `1000${n}`, descricao: 'SPLIT SALA', local: 'Sede/Sala 1' },
    ...over,
  };
}

function cadastroInterno(over: Partial<OperacaoGuardada> = {}): OperacaoGuardada {
  return op({
    operacao: {
      clientOpId: 'cad',
      tipo: 'cadastro',
      origemCodigo: 'interno',
    } as unknown as OperacaoGuardada['operacao'],
    rotulo: { codigo: 'PROV-ABC123', descricao: 'QGBT', local: 'Sede/Subestação' },
    ...over,
  });
}

function montar(
  operacoes: OperacaoGuardada[],
  extra: { sincronizando?: boolean; aviso?: string | null } = {},
) {
  const onSincronizar = vi.fn();
  const onDescartar = vi.fn();
  render(
    <FilaVistoria
      operacoes={operacoes}
      sincronizando={extra.sincronizando ?? false}
      aviso={extra.aviso ?? null}
      onSincronizar={onSincronizar}
      onDescartar={onDescartar}
    />,
  );
  return { onSincronizar, onDescartar };
}

describe('FilaVistoria: contagem e sincronizar', () => {
  it('sem operações diz que nada aguarda envio', () => {
    montar([]);
    expect(screen.getByText('Nada aguardando envio.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('conta só as pendentes, no singular e no plural', () => {
    const { unmount } = render(
      <FilaVistoria
        operacoes={[op()]}
        sincronizando={false}
        aviso={null}
        onSincronizar={vi.fn()}
        onDescartar={vi.fn()}
      />,
    );
    expect(screen.getByText('1 pendente de envio')).toBeInTheDocument();
    unmount();
    montar([op(), op(), op({ estado: 'enviada' })]);
    expect(screen.getByText('2 pendentes de envio')).toBeInTheDocument();
    expect(screen.getAllByText('Aguardando envio')).toHaveLength(2);
  });

  it('o botão Sincronizar chama a sincronização', async () => {
    const user = userEvent.setup();
    const { onSincronizar } = montar([op()]);
    await user.click(screen.getByRole('button', { name: 'Sincronizar' }));
    expect(onSincronizar).toHaveBeenCalledTimes(1);
  });

  it('enquanto sincroniza, o botão fica desabilitado', () => {
    montar([op()], { sincronizando: true });
    expect(screen.getByRole('button', { name: 'Sincronizar' })).toBeDisabled();
  });

  it('mostra o aviso da última sincronização (ex.: sessão expirada)', () => {
    montar([op()], { aviso: 'Entre de novo para enviar.' });
    expect(screen.getByRole('status')).toHaveTextContent('Entre de novo para enviar.');
  });

  it('a contagem é anunciada para leitor de tela', () => {
    montar([op()]);
    expect(screen.getByText('1 pendente de envio').closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});

describe('FilaVistoria: resultado de cada item', () => {
  it('cadastro interno pendente mostra o código provisório e nenhuma etiqueta', () => {
    montar([cadastroInterno()]);
    expect(screen.getByText('PROV-ABC123')).toBeInTheDocument();
    expect(screen.queryByText(/Etiquete como/)).not.toBeInTheDocument();
  });

  it('cadastro interno enviado troca para o MNT e pede para etiquetar', () => {
    montar([
      cadastroInterno({
        estado: 'enviada',
        resultado: { clientOpId: 'cad', estado: 'enviada' as never, codigo: 'MNT-0042' },
      }),
    ]);
    const item = screen.getByRole('listitem');
    expect(within(item).queryByText('PROV-ABC123')).not.toBeInTheDocument();
    expect(within(item).getByText(/Etiquete como/)).toHaveTextContent('Etiquete como MNT-0042');
  });

  it('"Já conferido" mostra quem conferiu e o que a pessoa informou', () => {
    montar([
      op({
        estado: 'ja_conferido',
        operacao: {
          clientOpId: 'x',
          tipo: 'conferencia',
          campanhaId: 'c1',
          ativoId: 'a1',
          localizacaoId: 'l1',
          modelo: 'XPTO-9',
          conferidoEm: '2026-10-02T12:00:00.000Z',
        } as OperacaoGuardada['operacao'],
        resultado: {
          clientOpId: 'x',
          estado: 'ja_conferido' as never,
          conferidoPor: 'Maria Fictícia',
        },
      }),
    ]);
    expect(screen.getByText(/Já conferido por Maria Fictícia/)).toBeInTheDocument();
    expect(
      screen.getByText(/Você informou: local Sede\/Sala 1; modelo XPTO-9/),
    ).toBeInTheDocument();
  });

  it('item recusado mostra o motivo e pode ser descartado', async () => {
    const user = userEvent.setup();
    const recusada = op({
      estado: 'recusada',
      resultado: {
        clientOpId: 'r',
        estado: 'recusada' as never,
        mensagem: 'Categoria inexistente ou desativada.',
      },
    });
    const { onDescartar } = montar([recusada]);
    expect(screen.getByText('Recusado: Categoria inexistente ou desativada.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onDescartar).toHaveBeenCalledWith(recusada.clientOpId);
  });

  it('a mais recente aparece primeiro', () => {
    const antiga = op({ rotulo: { codigo: '111', descricao: 'ANTIGA', local: 'X' } });
    const nova = op({ rotulo: { codigo: '222', descricao: 'NOVA', local: 'X' } });
    montar([antiga, nova]);
    const itens = screen.getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('NOVA');
    expect(itens[1]).toHaveTextContent('ANTIGA');
  });
});

describe('codigoNaTela e etiquetaParaColar', () => {
  it('usa o código definitivo do servidor quando já veio', () => {
    expect(
      codigoNaTela(
        cadastroInterno({
          resultado: { clientOpId: 'c', estado: 'enviada' as never, codigo: 'MNT-0001' },
        }),
      ),
    ).toBe('MNT-0001');
    expect(codigoNaTela(cadastroInterno())).toBe('PROV-ABC123');
  });

  it('só dá etiqueta para cadastro interno enviado com código', () => {
    const enviado = { clientOpId: 'c', estado: 'enviada' as never, codigo: 'MNT-0001' };
    expect(etiquetaParaColar(cadastroInterno({ estado: 'enviada', resultado: enviado }))).toBe(
      'MNT-0001',
    );
    expect(etiquetaParaColar(cadastroInterno({ estado: 'pendente' }))).toBeNull();
    expect(etiquetaParaColar(op({ estado: 'enviada', resultado: enviado }))).toBeNull();
  });
});
