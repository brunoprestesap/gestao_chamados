import type { ChamadoStatus } from './chamado.constants';

/**
 * Status em que a gestão lança, edita ou remove material e informa o valor
 * final da cotação (spec 0018, AC-3). Reabrir volta a um deles.
 */
export const STATUS_CUSTO_EDITAVEL: readonly ChamadoStatus[] = [
  'em atendimento',
  'aguardando_solicitante',
  'aguardando_terceiros',
  'concluído',
];

/** Teto de itens de material fora de cotação por chamado (AC-4). */
export const MAX_MATERIAIS_CHAMADO = 50;

/** Teto de valor em reais, o mesmo do `valorEstimado` da cotação. */
export const VALOR_MAXIMO_REAIS = 9_999_999.99;

/** Teto de quantidade de um item. */
export const QUANTIDADE_MAXIMA = 99_999;

export const MENSAGENS_CUSTO = {
  semPermissao: 'Sem permissão.',
  chamadoNaoEncontrado: 'Chamado não encontrado.',
  cotacaoNaoEncontrada: 'Cotação não encontrada.',
  statusTravado: 'O custo deste chamado não pode mais ser alterado.',
  itemNaoExiste: 'Este item não existe mais. Recarregue o chamado.',
  tetoItens: `Este chamado já tem ${MAX_MATERIAIS_CHAMADO} itens de material.`,
  cotacaoNaoAprovada: 'Só cotação aprovada tem valor final.',
  descricaoInvalida: 'Descrição do material inválida.',
  quantidadeInvalida: 'Quantidade inválida.',
  valorUnitarioInvalido: 'Valor unitário inválido.',
  valorFinalInvalido: 'Valor final inválido.',
  falhaInesperada: 'Não foi possível salvar o custo agora. Tente de novo.',
} as const;

export function custoEditavel(status: string | null | undefined): boolean {
  return (STATUS_CUSTO_EDITAVEL as readonly string[]).includes(status ?? '');
}
