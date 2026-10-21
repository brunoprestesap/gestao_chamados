// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SITUACOES_COTACAO } from '@/shared/material/material.constants';
import { ROTULO_SITUACAO } from '@/shared/material/mensagens';

import { JornadaCotacao } from '../compartilhado/JornadaCotacao';
import { SinaisCotacao } from '../compartilhado/SinaisCotacao';
import { SituacaoPill } from '../compartilhado/SituacaoPill';

/**
 * As peças compartilhadas da fila (spec 0021, fatia 1): o selo da situação,
 * os sinais e a jornada.
 *
 * covers: AC-1, AC-4, AC-5
 */

describe('SituacaoPill', () => {
  it.each(SITUACOES_COTACAO)('mostra o rótulo escrito de %s', (s) => {
    render(<SituacaoPill situacao={s} />);
    expect(screen.getByText(ROTULO_SITUACAO[s])).toBeTruthy();
  });

  it('cada situação tem um ponto de cor próprio', () => {
    const pontos = SITUACOES_COTACAO.map((s) => {
      const { container, unmount } = render(<SituacaoPill situacao={s} />);
      const classe = container.querySelector('[aria-hidden="true"]')?.className ?? '';
      unmount();
      return classe;
    });
    expect(new Set(pontos).size).toBe(SITUACOES_COTACAO.length);
  });
});

describe('SinaisCotacao', () => {
  it('mostra cada sinal ligado e o prazo do ateste', () => {
    render(
      <SinaisCotacao
        urgente
        notaFiscalPendente
        pesquisaPendente
        prazoAteste={{ etapa: 'provisorio', venceEm: '2026-10-20', atrasado: true }}
      />,
    );
    expect(screen.getByText('Urgente')).toBeTruthy();
    expect(screen.getByText('NF pendente')).toBeTruthy();
    expect(screen.getByText('Pesquisa pendente')).toBeTruthy();
    expect(screen.getByText('Recebimento provisório atrasado (prazo 20/10/2026)')).toBeTruthy();
  });

  it('sem sinal, um traço com texto para leitor de tela', () => {
    render(
      <SinaisCotacao
        urgente={false}
        notaFiscalPendente={false}
        pesquisaPendente={false}
        prazoAteste={null}
      />,
    );
    expect(screen.getByText('Nenhum sinal')).toBeTruthy();
  });
});

describe('JornadaCotacao', () => {
  it('a variante grande marca a etapa atual e mostra o desvio nela', () => {
    render(
      <JornadaCotacao variante="grande" situacao="devolvida" situacaoAnterior="em_aprovacao" />,
    );
    const etapas = screen.getAllByRole('listitem');
    expect(etapas).toHaveLength(7);
    const atual = etapas.find((e) => e.getAttribute('aria-current') === 'step');
    expect(atual?.textContent).toContain('Em aprovação');
    expect(atual?.textContent).toContain('Devolvida');
  });

  it('a variante grande mostra a data de cada etapa vencida', () => {
    render(
      <JornadaCotacao
        variante="grande"
        situacao="em_analise"
        datas={{ rascunho: '2026-10-01T12:00:00Z', enviada: '2026-10-03T12:00:00Z' }}
      />,
    );
    expect(screen.getByText('01/10')).toBeTruthy();
    expect(screen.getByText('03/10')).toBeTruthy();
  });

  it('a variante mini é só decoração', () => {
    const { container } = render(<JornadaCotacao situacao="autorizada" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(container.firstElementChild?.children).toHaveLength(7);
  });
});
