import type { ConfirmacaoFalha, RevisarFalha } from '@/lib/assistente';
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
  'Conte o que está acontecendo com suas palavras. Eu confirmo o que entendi, pergunto só o que faltar e monto o resumo do chamado para você confirmar.';

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
  'Esta conversa chegou ao limite de mensagens. Revise o resumo e abra o chamado por aqui mesmo.';

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

// ---------------------------------------------------------------------------
// Cartão resumo e confirmação (spec 0004)
// ---------------------------------------------------------------------------

export const REVISAR_ROTULO = 'Revisar e abrir';
export const REVISAR_DICA = 'Monta o resumo do chamado com o que a conversa já tem.';

export const CARTAO_TITULO = 'Resumo do chamado';
export const CARTAO_SELO_IA = 'Sugerido pelo assistente';
export const CARTAO_SELO_MANUAL = 'Complete para abrir';
export const CARTAO_SUBSTITUIDO = 'Substituído';
export const CARTAO_DESCRICAO_AVISO = 'O texto desta conversa vira a descrição do chamado.';
export const CARTAO_SERVICO_DICA = 'Para trocar o serviço, conte na conversa o que mudou.';
export const CARTAO_CONFIRMAR = 'Confirmar e abrir chamado';
export const CARTAO_CONFIRMANDO = 'Abrindo o chamado…';
export const CARTAO_ESPERE_RESPOSTA = 'Espere o assistente terminar de responder para confirmar.';

/** O que a região ao vivo diz quando um cartão novo chega (AC-18). */
export const CARTAO_PRONTO_ANUNCIO = 'Resumo do chamado pronto para confirmar.';

export const CARTAO_ERRO_TIPO = 'Escolha o tipo de serviço';
export const CARTAO_ERRO_UNIDADE = 'Escolha a unidade';
export const CARTAO_ERRO_LOCAL = 'Informe o local exato';
export const CARTAO_ERRO_LOCAL_LONGO = 'O local passa de 200 caracteres';

/**
 * Uma frase por motivo de falha da confirmação e do `Revisar e abrir`.
 * Nenhum motivo aparece cru na tela.
 */
export const CONFIRMACAO_FRASES: Record<ConfirmacaoFalha | RevisarFalha, string> = {
  ...FALHA_FRASES,
  cartao_desatualizado:
    'Este resumo não vale mais, porque a conversa mudou depois dele. Use o resumo mais recente ou toque em Revisar e abrir.',
  dados_invalidos: 'Confira o tipo de serviço, a unidade e o local antes de confirmar.',
  confirmacao_em_andamento:
    'Este chamado está sendo aberto neste instante. Espere alguns segundos.',
  invalida: 'Não deu para abrir o chamado com estes dados. Revise o resumo e tente de novo.',
  erro: 'Não deu para abrir o chamado agora. Tente de novo em instantes.',
};

export function fraseDaConfirmacao(motivo: string | null | undefined): string {
  if (!motivo) return FALHA_REDE;
  return CONFIRMACAO_FRASES[motivo as ConfirmacaoFalha] ?? FALHA_REDE;
}

/** Rede fora, servidor mudo: a mensagem nem chegou a ser recebida. */
export const FALHA_REDE = 'Não deu para falar com o Sigma. Verifique a conexão e tente de novo.';

export function fraseDaFalha(motivo: string | null | undefined): string {
  if (!motivo) return FALHA_REDE;
  return FALHA_FRASES[motivo as ConversaFalha] ?? FALHA_REDE;
}
