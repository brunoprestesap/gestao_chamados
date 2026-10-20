import { ITEM_PARECIDO_MIN_LETRAS } from './material.constants';

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

/** A raiz do CNPJ: os 8 primeiros dígitos, que identificam a empresa (AC-31). */
export function raizCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '').slice(0, 8);
}

/** Quantas empresas diferentes (raízes de CNPJ) cotaram o item. CNPJ repetido conta uma vez. */
export function raizesDoItem(
  itemId: string,
  orcamentos: readonly { cnpj: string; precos: readonly { itemId: string }[] }[],
): number {
  const raizes = new Set<string>();
  for (const o of orcamentos) {
    if (o.precos.some((p) => p.itemId === itemId)) raizes.add(raizCnpj(o.cnpj));
  }
  return raizes.size;
}

/** A referência que conta nos controles: a retirada pelo fiscal fica gravada e não conta (AC-32). */
export function referenciaAtiva(r: { retiradaEm?: Date | string | null }): boolean {
  return !r.retiradaEm;
}

/** A menor referência ativa do item, da contratada ou do fiscal (AC-33); `null` sem nenhuma. */
export function menorReferencia(
  referencias: readonly { valorUnitarioCentavos: number; retiradaEm?: Date | string | null }[],
): number | null {
  const valores = referencias.filter(referenciaAtiva).map((r) => r.valorUnitarioCentavos);
  return valores.length ? Math.min(...valores) : null;
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

/** Quantidade em milésimos inteiros, a mesma escala de `valorDaLinhaCentavos` (AC-39). */
export function emMilesimos(quantidade: number): number {
  return Math.round(quantidade * 1000);
}

/**
 * A chave do "mesmo item" do fracionamento e do consumo (fatia 5), na
 * primeira regra que se aplica: o número do Anexo V no contrato (qualquer
 * versão), o código SINAPI ou a descrição normalizada. A unidade não conta, e
 * um item do Anexo V nunca casa com uma descrição do caminho 3.
 */
export function chaveDoMesmoItem(
  item: { anexoVItemId?: unknown; sinapiCodigo?: string | null; descricao: string },
  anexoV: ReadonlyMap<string, { contratoId: string; numero: number }>,
): string {
  const doAnexo = item.anexoVItemId ? anexoV.get(String(item.anexoVItemId)) : undefined;
  if (doAnexo) return `anexoV:${doAnexo.contratoId}:${doAnexo.numero}`;
  if (item.sinapiCodigo) return `sinapi:${item.sinapiCodigo}`;
  return `desc:${normalizarTextoBusca(item.descricao)}`;
}

/** As palavras de um texto para a semelhança (AC-40): normalizadas, sem as de até 2 letras. */
export function palavrasDe(texto: string): Set<string> {
  return new Set(
    normalizarTextoBusca(texto)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= ITEM_PARECIDO_MIN_LETRAS),
  );
}

/** Semelhança de Jaccard entre dois conjuntos de palavras; 0 quando os dois são vazios. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let comum = 0;
  for (const p of a) if (b.has(p)) comum++;
  return comum / (a.size + b.size - comum);
}

/**
 * Material fora de cotação (spec 0018) que já foi cotado no chamado: para
 * cada item lançado à mão, o número da primeira cotação com item de mesma
 * descrição normalizada. Só avisa, nunca barra.
 */
export function foraDeCotacaoJaCotados(
  materiais: readonly { _id: string; descricao: string }[],
  cotacoes: readonly { numero: string; itens: readonly { descricao: string }[] }[],
): Record<string, string> {
  const numeroPorDescricao = new Map<string, string>();
  for (const c of cotacoes) {
    for (const i of c.itens) {
      const chave = normalizarTextoBusca(i.descricao);
      if (!numeroPorDescricao.has(chave)) numeroPorDescricao.set(chave, c.numero);
    }
  }
  const out: Record<string, string> = {};
  for (const m of materiais) {
    const numero = numeroPorDescricao.get(normalizarTextoBusca(m.descricao));
    if (numero) out[m._id] = numero;
  }
  return out;
}
