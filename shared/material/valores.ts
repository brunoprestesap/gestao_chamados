/**
 * Contas da cotação de material (spec 0019), em centavos inteiros. A linha
 * segue a regra de `shared/chamados/custo.ts`: quantidade em milésimos vezes
 * o unitário em centavos, com um único arredondamento.
 */

export function valorDaLinhaCentavos(quantidade: number, precoCentavos: number): number {
  const milesimosDeCentavo = Math.round(quantidade * 1000) * Math.round(precoCentavos);
  return Math.round(milesimosDeCentavo / 1000);
}

export type ItemParaPreco = {
  _id: string;
  origem: string | null;
  quantidade: number;
  precoAplicadoCentavos: number | null;
};

export type OrcamentoParaPreco = {
  cnpj: string;
  precos: readonly { itemId: string; valorUnitarioCentavos: number }[];
};

/** Os orçamentos que deram preço a um item. */
export function precosDoItem(
  itemId: string,
  orcamentos: readonly OrcamentoParaPreco[],
): { cnpj: string; valorUnitarioCentavos: number }[] {
  const out: { cnpj: string; valorUnitarioCentavos: number }[] = [];
  for (const o of orcamentos) {
    const p = o.precos.find((x) => x.itemId === itemId);
    if (p) out.push({ cnpj: o.cnpj, valorUnitarioCentavos: p.valorUnitarioCentavos });
  }
  return out;
}

/** Caminho 3: o menor preço entre os orçamentos que cotaram o item (AC-4). */
export function menorPrecoDoItem(
  itemId: string,
  orcamentos: readonly OrcamentoParaPreco[],
): number | null {
  const precos = precosDoItem(itemId, orcamentos);
  if (precos.length === 0) return null;
  return Math.min(...precos.map((p) => p.valorUnitarioCentavos));
}

/** Total da cotação: soma das linhas com preço aplicado. */
export function valorTotalCentavos(
  itens: readonly { quantidade: number; precoAplicadoCentavos: number | null }[],
): number {
  return itens.reduce(
    (s, i) =>
      s +
      (i.precoAplicadoCentavos == null
        ? 0
        : valorDaLinhaCentavos(i.quantidade, i.precoAplicadoCentavos)),
    0,
  );
}

/**
 * Texto em reais digitado no formato brasileiro (`1.234,56`, `R$` opcional)
 * para centavos. Mais de 2 casas ou texto inválido: `null`.
 */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto
    .replace(/R\$\s?/i, '')
    .trim()
    .replace(/\s/g, '');
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ''] = limpo.replace(/\./g, '').split(',');
  return Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
}
