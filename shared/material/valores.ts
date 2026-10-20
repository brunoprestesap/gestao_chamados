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

export type ItemParaTotal = {
  quantidade: number;
  precoAplicadoCentavos: number | null;
  origem?: string | null;
  anexoVPrecoCentavos?: number | null;
  sinapiPrecoCentavos?: number | null;
};

/**
 * O preço que entra no valor do item. Fora de `ambas` é o aplicado; em
 * `ambas`, até o fiscal escolher a base, vale o maior dos dois (valor
 * provisório, _Escolha da base em `ambas`_).
 */
export function precoParaValor(i: ItemParaTotal): number | null {
  if (i.precoAplicadoCentavos != null) return i.precoAplicadoCentavos;
  if (i.origem !== 'ambas') return null;
  const precos = [i.anexoVPrecoCentavos, i.sinapiPrecoCentavos].filter(
    (p): p is number => p != null,
  );
  return precos.length ? Math.max(...precos) : null;
}

/** O item `ambas` ainda sem base escolhida: o valor dele é provisório. */
export function valorProvisorio(i: ItemParaTotal): boolean {
  return i.origem === 'ambas' && i.precoAplicadoCentavos == null;
}

/** Total da cotação: soma das linhas com preço (o provisório de `ambas` incluído). */
export function valorTotalCentavos(itens: readonly ItemParaTotal[]): number {
  return itens.reduce((s, i) => {
    const preco = precoParaValor(i);
    return s + (preco == null ? 0 : valorDaLinhaCentavos(i.quantidade, preco));
  }, 0);
}

/**
 * `preço` passa de `referência` além do percentual, em inteiros (RN-27,
 * RN-52): `(preço − referência) × 100 > percentual × referência`.
 */
export function acimaDoPercentual(
  precoCentavos: number,
  referenciaCentavos: number,
  percentual: number,
): boolean {
  return (precoCentavos - referenciaCentavos) * 100 > percentual * referenciaCentavos;
}

/**
 * Código SINAPI na forma única do Sigma: só dígitos, sem espaços, pontos nem
 * zeros à esquerda. Vazio vira `''`; outro caractere, ou só zeros, `null`.
 */
export function normalizarCodigoSinapi(texto: string): string | null {
  const limpo = texto.replace(/[\s.]/g, '');
  if (limpo === '') return '';
  if (!/^\d+$/.test(limpo)) return null;
  const semZeros = limpo.replace(/^0+/, '');
  return semZeros === '' ? null : semZeros;
}

/** Minúsculas, sem acento e com espaços simples: a forma da busca e da comparação de texto. */
export function normalizarTextoBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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
