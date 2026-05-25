/**
 * Escapa metacaracteres de regex para uso seguro em buscas (ex.: `$regex` do
 * MongoDB ou `new RegExp`). Sem isto, valores controlados por dados/usuário
 * podem produzir um padrão inválido — ex.: `range out of order in character
 * class` — fazendo a query lançar erro, ou causar matches indevidos.
 *
 * @example
 * escapeRegex('Seção (Manutenção)') // => 'Seção \\(Manutenção\\)'
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
