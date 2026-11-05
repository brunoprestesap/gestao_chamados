/**
 * As regras puras da checagem do almoxarifado (spec 0024), para o cliente e o
 * servidor: as palavras da busca, a conta do saldo e do preço médio, e o que
 * cada item já decidiu. Nada aqui lê banco nem SICAM.
 */

/** Palavras de 4 letras ou mais que não dizem nada sobre o material. */
const PALAVRAS_VAZIAS = new Set([
  'para',
  'pela',
  'pelo',
  'pelas',
  'pelos',
  'como',
  'mais',
  'menos',
  'entre',
  'sobre',
  'desde',
  'cada',
  'esta',
  'este',
  'essa',
  'esse',
  'tipo',
  'item',
  'unidade',
  'marca',
  'modelo',
  'similar',
  'equivalente',
  'novo',
  'nova',
]);

const MAX_PALAVRAS = 8;
const MAX_LETRAS_PALAVRA = 40;
const MIN_LETRAS_PALAVRA = 4;

export function semAcentoNemCaixa(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * As palavras que vão à busca: sem acento e sem caixa, sem as vazias, só as de
 * 4 letras ou mais e as que têm dígito ("3/4", "20mm"), no máximo 8. Prefere um
 * falso candidato, que uma pessoa dispensa, a uma liberação errada.
 */
export function palavrasDaBusca(descricao: string): string[] {
  const vistas = new Set<string>();
  for (const bruta of semAcentoNemCaixa(descricao).split(/\s+/)) {
    const palavra = bruta.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').slice(0, MAX_LETRAS_PALAVRA);
    if (!palavra || PALAVRAS_VAZIAS.has(palavra)) continue;
    if (palavra.length >= MIN_LETRAS_PALAVRA || /\d/.test(palavra)) vistas.add(palavra);
    if (vistas.size === MAX_PALAVRAS) break;
  }
  return [...vistas];
}

/** Saldo menos reservado, nunca menor que zero (AC-9). */
export function disponivelDe(saldo: number | null, reservado: number | null): number {
  return Math.max(0, (saldo ?? 0) - (reservado ?? 0));
}

/** `VL_ATU / QT_SALDO_ATU` em centavos, um só arredondamento; `null` sem saldo ou sem valor. */
export function precoMedioCentavos(
  valorTotal: number | null | undefined,
  saldo: number | null | undefined,
): number | null {
  if (!valorTotal || !saldo || valorTotal <= 0 || saldo <= 0) return null;
  return Math.round((valorTotal / saldo) * 100);
}

/** As unidades são a mesma, sem caixa e sem espaços (AC-8). */
export function mesmaUnidade(a: string, b: string): boolean {
  const limpa = (s: string) => semAcentoNemCaixa(s).replace(/\s+/g, '');
  return limpa(a) === limpa(b);
}

type EntradaMinima = { itemId: unknown; quantidadeLiberada: number };

/** A última entrada de cada item: é ela que vale na tela e em `quantidadeLiberada`. */
export function ultimaEntradaPorItem<T extends EntradaMinima>(
  entradas: readonly T[],
): Map<string, T> {
  const porItem = new Map<string, T>();
  for (const e of entradas) porItem.set(String(e.itemId), e);
  return porItem;
}

/** Só estes status do chamado levam o material do almoxarifado ao custo (AC-21). */
export const STATUS_COM_CUSTO_DE_ALMOXARIFADO: readonly string[] = ['concluído', 'encerrado'];

/**
 * A soma de `valorCentavos` de toda entrada `usar`, mesmo rechecada depois (AC-21):
 * "a última vale" é só para a tela. Com o status do chamado de fora, dá zero.
 */
export function almoxarifadoDoChamadoCentavos(
  statusDoChamado: string | undefined,
  entradas: readonly { resultado: string; valorCentavos?: number | null }[],
): number {
  if (!statusDoChamado || !STATUS_COM_CUSTO_DE_ALMOXARIFADO.includes(statusDoChamado)) return 0;
  return entradas.reduce((s, e) => s + (e.resultado === 'usar' ? (e.valorCentavos ?? 0) : 0), 0);
}

const FOLGA = 1e-9;

/**
 * Os itens ainda sem checagem válida (AC-17): sem entrada, ou com a quantidade
 * acima da liberada pela última entrada. Trocar só a descrição não reabre.
 */
export function itensNaoChecados<I extends { quantidade: number }>(
  itens: readonly I[],
  entradas: readonly EntradaMinima[],
  idDe: (item: I) => string,
): I[] {
  const ultima = ultimaEntradaPorItem(entradas);
  return itens.filter((i) => {
    const e = ultima.get(idDe(i));
    return !e || i.quantidade > e.quantidadeLiberada + FOLGA;
  });
}

/** A quantidade em milésimos, a precisão aceita nos itens, sem sobra de ponto flutuante. */
export function restanteDoItem(quantidade: number, atendida: number): number {
  return Math.max(0, Math.round((quantidade - atendida) * 1000) / 1000);
}
