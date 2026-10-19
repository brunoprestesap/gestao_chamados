import {
  DIAS_ENCERRADAS_VISIVEIS_RT,
  type SituacaoCotacao,
} from '@/shared/material/material.constants';

/**
 * A nota fiscal pendente da contratada (spec 0019, AC-15 e AC-22): a
 * `atestada` sem `notaFiscal` espera um ato do responsável técnico e nunca
 * some da visão dele, por mais velha que seja. As duas formas moram aqui,
 * juntas, para a tela (`visaoDe`) e a fila (`listarFila`) nunca divergirem;
 * um teste de paridade roda as duas sobre as mesmas cotações.
 */

/** Forma em memória, para `visaoDe` e para a tela. */
export function pendenciaDaContratada(cot: {
  situacao: SituacaoCotacao;
  notaFiscal?: unknown;
}): boolean {
  return cot.situacao === 'atestada' && !cot.notaFiscal;
}

/**
 * Forma em filtro Mongo, para `listarFila` e a aba `Minhas ações`. O
 * `notaFiscal: null` do Mongo casa com o campo nulo e com o ausente, como
 * o `!cot.notaFiscal` acima.
 */
export const FILTRO_PENDENCIA_DA_CONTRATADA = Object.freeze({
  situacao: 'atestada',
  notaFiscal: null,
});

const DIA_MS = 24 * 60 * 60 * 1000;

/** O início da janela das encerradas: `agora` menos 90 dias. */
export function inicioDaJanelaDaContratada(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_ENCERRADAS_VISIVEIS_RT * DIA_MS);
}

/**
 * O que a contratada enxerga (AC-15), forma em memória: em trâmite,
 * encerrada há até 90 dias (contados de `updatedAt`, que o registro da NF
 * reinicia) ou com a nota fiscal pendente.
 */
export function visivelParaContratada(
  cot: { situacao: SituacaoCotacao; emTramite: boolean; updatedAt: Date; notaFiscal?: unknown },
  agora: Date,
): boolean {
  return (
    cot.emTramite ||
    cot.updatedAt.getTime() >= inicioDaJanelaDaContratada(agora).getTime() ||
    pendenciaDaContratada(cot)
  );
}

/** A mesma regra, forma em filtro Mongo, para a fila. */
export function filtroVisivelParaContratada(agora: Date): Record<string, unknown> {
  return {
    $or: [
      { emTramite: true },
      { updatedAt: { $gte: inicioDaJanelaDaContratada(agora) } },
      { ...FILTRO_PENDENCIA_DA_CONTRATADA },
    ],
  };
}
