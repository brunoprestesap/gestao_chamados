import { TIPO_SERVICO_OPTIONS } from './new-ticket.schemas';

/**
 * Traduz o nome de um `ServiceType` do banco para uma das opções fixas de
 * `TIPO_SERVICO_OPTIONS`. O catálogo guarda o nome livre ("Manutenção
 * Predial", "AR CONDICIONADO"); o chamado guarda a opção fixa. O formulário e
 * a proposta da IA (spec 0004) usam a mesma regra, então os dois caminhos
 * nunca discordam sobre o tipo de um serviço.
 */

export type TipoServico = (typeof TIPO_SERVICO_OPTIONS)[number];

/** Minúsculas, sem acento e com espaços simples, para comparar nomes. */
export function normalizeTypeName(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/** A opção fixa que corresponde ao nome do tipo, ou `null` quando nenhuma corresponde. */
export function tipoServicoDoNomeDoTipo(nome: string): TipoServico | null {
  const n = normalizeTypeName(nome);
  if (n.includes('manutencao') && n.includes('predial')) return 'Manutenção Predial';
  if (
    n.includes('ar-condicionado') ||
    n.includes('ar condicionado') ||
    n.includes('arcondicionado')
  )
    return 'Ar-Condicionado';
  if (n.includes('elevador')) return 'Elevador';
  return null;
}

/**
 * Id do `ServiceType` de cada opção fixa, pela mesma regra da proposta da IA.
 * Com dois tipos na mesma opção, vale o último da lista. O seletor de ativo
 * (spec 0011) repete a conta no servidor com a lista na mesma ordem
 * (`/api/catalog/types`, por nome), para sugerir só o subtipo que o
 * formulário vai mostrar.
 */
export function buildTypeIdByTipo(types: { id: string; name: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of types) {
    const tipo = tipoServicoDoNomeDoTipo(t.name);
    if (tipo) m.set(tipo, t.id);
  }
  return m;
}
