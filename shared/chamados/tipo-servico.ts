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
