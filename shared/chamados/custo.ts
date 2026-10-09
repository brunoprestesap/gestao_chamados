/**
 * A conta do custo de um chamado (spec 0018, AC-9). Pura, usada no cliente e
 * no servidor. Reais só existem na entrada e na exibição; toda soma é de
 * centavos inteiros.
 */

export type CotacaoParaCusto = {
  status: string;
  valorEstimado: number;
  valorFinal?: number | null;
};

export type MaterialParaCusto = {
  quantidade: number;
  valorUnitario: number;
};

export type CustoDoChamado = {
  cotacoesCentavos: number;
  materialCentavos: number;
  totalCentavos: number;
};

/** Reais para centavos inteiros (um valor antigo com mais de 2 casas arredonda aqui). */
export function centavos(reais: number): number {
  return Math.round(reais * 100);
}

/** O valor que conta de uma cotação aprovada: o final quando existe, senão o estimado. */
export function valorDaCotacaoCentavos(c: CotacaoParaCusto): number {
  if (c.status !== 'aprovada') return 0;
  const reais = c.valorFinal ?? c.valorEstimado;
  return centavos(reais);
}

/**
 * Total de um item: quantidade em milésimos vezes o unitário em centavos dá
 * milésimos de centavo, arredondados uma única vez para centavos.
 */
export function valorDoItemCentavos(i: MaterialParaCusto): number {
  const milesimosDeCentavo = Math.round(i.quantidade * 1000) * Math.round(i.valorUnitario * 100);
  return Math.round(milesimosDeCentavo / 1000);
}

export function custoDoChamado(entrada: {
  cotacoes: readonly CotacaoParaCusto[];
  materiais: readonly MaterialParaCusto[];
}): CustoDoChamado {
  const cotacoesCentavos = entrada.cotacoes.reduce((s, c) => s + valorDaCotacaoCentavos(c), 0);
  const materialCentavos = entrada.materiais.reduce((s, i) => s + valorDoItemCentavos(i), 0);
  return { cotacoesCentavos, materialCentavos, totalCentavos: cotacoesCentavos + materialCentavos };
}

const FORMATO_REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** `123456` vira `R$ 1.234,56`. */
export function formatarReais(centavosInteiros: number): string {
  return FORMATO_REAIS.format(centavosInteiros / 100);
}

const FORMATO_QUANTIDADE = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** `2.5` vira `2,5`; até 3 casas, sem zeros à direita. */
export function formatarQuantidade(quantidade: number): string {
  return FORMATO_QUANTIDADE.format(quantidade);
}

/** O texto do item no histórico: `<descricao>: <qtd> × R$ <unit> = R$ <total>` (AC-6). */
export function textoDoItem(i: MaterialParaCusto & { descricao: string }): string {
  return `${i.descricao}: ${formatarQuantidade(i.quantidade)} × ${formatarReais(
    centavos(i.valorUnitario),
  )} = ${formatarReais(valorDoItemCentavos(i))}`;
}
