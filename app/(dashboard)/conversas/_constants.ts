import type { ConversaFalha } from '@/shared/conversas/conversa.constants';

/**
 * Todo o texto fixo da tela de conversas (spec 0003). Os exemplos são escritos
 * aqui, não vêm do modelo, e as frases de falha cobrem todos os motivos de
 * `lib/conversas`: nenhum motivo aparece cru na tela (AC-9).
 */

export const CONVERSAS_TITULO = 'Conversas';
export const CONVERSAS_SUBTITULO = 'Relate o problema e acompanhe seus chamados';

/** Para onde o link do formulário aponta. O botão `Novo chamado` fica lá. */
export const FORMULARIO_HREF = '/meus-chamados';
export const FORMULARIO_ROTULO = 'Abrir por formulário';

export const BOAS_VINDAS_TEXTO =
  'Conte o que está acontecendo com suas palavras. Eu confirmo o que entendi e pergunto só o que faltar.';

export const EXEMPLOS_TITULO = 'Exemplos para começar';

/** Três relatos prontos, um por tipo de serviço do catálogo. */
export const EXEMPLOS: readonly string[] = [
  'O ar condicionado da sala 302 está pingando desde ontem',
  'A lâmpada do corredor do 2º andar queimou',
  'O elevador social está parado e tem gente esperando',
];

export const COMPOSER_DICA = 'Enter envia. Shift e Enter quebram a linha.';
export const COMPOSER_PLACEHOLDER_PRIMEIRA =
  'Descreva o problema. Por exemplo: o ar da sala 302 está pingando.';
export const COMPOSER_PLACEHOLDER_SEGUINTE = 'Escreva sua resposta';

export const RESPONDENDO_TEXTO = 'O assistente está respondendo';

export const RASCUNHO_APOIO = 'Ainda não virou chamado';
export const RASCUNHO_EXPLICACAO = 'Guardado por 30 dias. Ainda não é um chamado.';

export const LEITURA_EXPLICACAO =
  'Esta conversa está em modo leitura. Para falar com quem está atendendo, use os comentários na página do chamado.';

export const NAO_SALVA_AVISO =
  'Esta resposta não ficou salva e não vai aparecer quando você recarregar a página.';

export const LIMITE_MENSAGENS_AVISO =
  'Esta conversa chegou ao limite de mensagens. Para seguir com o pedido, abra o chamado pelo formulário.';

export const LISTA_VAZIA_TITULO = 'Nenhuma conversa ainda';
export const LISTA_VAZIA_TEXTO =
  'Comece uma conversa para relatar um problema. Seus chamados também aparecem aqui.';

/**
 * Uma frase por motivo de falha de `lib/conversas`. O motivo cru
 * (`limite_rascunhos` e companhia) nunca chega aos olhos de ninguém.
 */
export const FALHA_FRASES: Record<ConversaFalha, string> = {
  nao_encontrada: 'Esta conversa não existe mais. Ela pode ter sido descartada em outra aba.',
  sem_permissao: 'Esta conversa não é sua.',
  limite_rascunhos:
    'Você já tem 5 conversas em aberto, que é o máximo. Termine ou descarte uma delas para começar outra.',
  limite_mensagens: LIMITE_MENSAGENS_AVISO,
  confirmacao_em_andamento:
    'Esta conversa está virando chamado neste instante. Espere alguns segundos e tente de novo.',
  ja_existe: 'Esta conversa já virou chamado.',
  invalida: 'Escreva a mensagem antes de enviar. O limite é de 2.000 caracteres.',
  erro: 'Não deu para salvar agora. Tente de novo em instantes.',
};

/** Rede fora, servidor mudo: a mensagem nem chegou a ser recebida. */
export const FALHA_REDE = 'Não deu para falar com o Sigma. Verifique a conexão e tente de novo.';

export function fraseDaFalha(motivo: string | null | undefined): string {
  if (!motivo) return FALHA_REDE;
  return FALHA_FRASES[motivo as ConversaFalha] ?? FALHA_REDE;
}
