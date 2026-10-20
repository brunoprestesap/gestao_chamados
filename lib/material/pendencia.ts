import {
  DIAS_ENCERRADAS_VISIVEIS_RT,
  type SituacaoCotacao,
} from '@/shared/material/material.constants';

/**
 * O que a contratada ainda deve (spec 0019, AC-15, AC-22 e AC-35): a nota
 * fiscal da `atestada`, e a pesquisa de preços da urgência aceita ainda
 * incompleta. Os dois esperam um ato do responsável técnico e nunca somem da
 * visão dele, por mais velha que seja a cotação. As duas formas moram aqui,
 * juntas, para a tela (`visaoDe`) e a fila (`listarFila`) nunca divergirem;
 * um teste de paridade roda as duas sobre as mesmas cotações.
 */

type ParaPendencia = {
  situacao: SituacaoCotacao;
  notaFiscal?: unknown;
  urgencia?: { decisao?: string | null; pesquisaCompletaEm?: unknown } | null;
};

/** A `atestada` ainda sem nota fiscal (AC-22), forma em memória. */
export function notaFiscalPendente(cot: ParaPendencia): boolean {
  return cot.situacao === 'atestada' && !cot.notaFiscal;
}

/** A urgência aceita ainda sem os 3 orçamentos de cada item (AC-35), forma em memória. */
export function pesquisaDaUrgenciaPendente(cot: ParaPendencia): boolean {
  return (
    (cot.situacao === 'autorizada' || cot.situacao === 'executada') &&
    cot.urgencia?.decisao === 'aceita' &&
    !cot.urgencia.pesquisaCompletaEm
  );
}

/** Forma em memória, para `visaoDe` e para a tela. */
export function pendenciaDaContratada(cot: ParaPendencia): boolean {
  return notaFiscalPendente(cot) || pesquisaDaUrgenciaPendente(cot);
}

/**
 * A nota fiscal pendente em filtro Mongo. O `notaFiscal: null` do Mongo casa
 * com o campo nulo e com o ausente, como o `!cot.notaFiscal` acima.
 */
export const FILTRO_NOTA_FISCAL_PENDENTE = Object.freeze({
  situacao: 'atestada',
  notaFiscal: null,
});

/** A pesquisa da urgência pendente em filtro Mongo (`pesquisaCompletaEm` nulo ou ausente). */
export const FILTRO_PESQUISA_PENDENTE = Object.freeze({
  situacao: { $in: ['autorizada', 'executada'] },
  'urgencia.decisao': 'aceita',
  'urgencia.pesquisaCompletaEm': null,
});

/** Forma em filtro Mongo, para `listarFila` e a aba `Minhas ações`. */
export const FILTRO_PENDENCIA_DA_CONTRATADA = Object.freeze({
  $or: [{ ...FILTRO_NOTA_FISCAL_PENDENTE }, { ...FILTRO_PESQUISA_PENDENTE }],
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
  cot: ParaPendencia & { emTramite: boolean; updatedAt: Date },
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
