import type { PapelEvento, SituacaoCotacao } from './material.constants';

/**
 * Quem age agora numa cotação (spec 0021): um mapa fixo por situação, para o
 * painel "Sua vez" e o cartão do chamado. Só diz o papel; o nome do fiscal que
 * assumiu é acrescentado pela leitura do lado TRF1, nunca aqui. Puro.
 */

export type QuemAge = {
  papel: PapelEvento;
  /** Em análise, a vez é do fiscal que assumiu, e não de qualquer fiscal. */
  doFiscalQueAssumiu: boolean;
};

export function quemAgeAgora(
  situacao: SituacaoCotacao,
  cot: { fiscalAssumiu: boolean; notaFiscalPendente?: boolean },
): QuemAge | null {
  const papel = (p: PapelEvento): QuemAge => ({ papel: p, doFiscalQueAssumiu: false });
  switch (situacao) {
    case 'rascunho':
    case 'devolvida':
      return papel('responsavel_tecnico');
    case 'enviada':
      return papel('fiscal');
    case 'em_analise':
      return { papel: 'fiscal', doFiscalQueAssumiu: cot.fiscalAssumiu };
    case 'em_aprovacao':
      return papel('aprovador');
    case 'autorizada':
      return papel('tecnico');
    case 'executada':
      return papel('gestor');
    case 'atestada':
      // Atestada só espera alguém enquanto a contratada deve a nota fiscal.
      return cot.notaFiscalPendente ? papel('responsavel_tecnico') : null;
    case 'reprovada':
    case 'cancelada':
      return null;
  }
}
