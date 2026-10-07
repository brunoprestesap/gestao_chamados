import type { ConfirmacaoFalha, RevisarFalha } from '@/lib/assistente';
import type { AcompanharFalha, ConversaFalha } from '@/shared/conversas/conversa.constants';

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

// ---------------------------------------------------------------------------
// Caixa de comentário do chamado (spec 0005)
// ---------------------------------------------------------------------------

export const COMENTARIO_PLACEHOLDER = 'Escreva uma mensagem sobre este chamado';
export const COMENTARIO_DICA = 'Enter envia. Shift e Enter quebram a linha.';
export const COMENTARIO_PUBLICO_ROTULO = 'Público';
export const COMENTARIO_INTERNO_ROTULO = 'Interno';
export const COMENTARIO_ALTERNAR_DICA = 'Comentário interno: só a gestão e o técnico veem.';

/** Uma frase por motivo de falha da rota de comentário. Nenhum motivo cru na tela. */
export const COMENTARIO_FRASES: Record<'invalida' | 'nao_encontrada' | 'erro', string> = {
  invalida: 'Escreva o comentário antes de enviar. O limite é de 5.000 caracteres.',
  nao_encontrada: 'Não foi possível enviar. Recarregue a página e tente de novo.',
  erro: 'Não deu para enviar agora. Tente de novo em instantes.',
};

export function fraseDoComentario(motivo: string | null | undefined): string {
  if (!motivo) return FALHA_REDE;
  return COMENTARIO_FRASES[motivo as keyof typeof COMENTARIO_FRASES] ?? FALHA_REDE;
}

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
  // Motivos da revisão da IA pela gestão (spec 0009): não aparecem nesta tela,
  // mas o tipo é o mesmo `ConversaFalha` de `lib/conversas`.
  nada_a_confirmar: 'Não há mais nada pendente de confirmação.',
  divergente: 'Este valor já mudou desde a última leitura. Atualize a página e tente de novo.',
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
/** A linha Equipamento do cartão (spec 0014, AC-5). */
export const CARTAO_EQUIPAMENTO = 'Equipamento';
export const CARTAO_EQUIPAMENTO_NAO_SEI = 'Não sei';
export const CARTAO_EQUIPAMENTO_TIRAR = 'Não é este';
export const CARTAO_EQUIPAMENTO_DESFAZER = 'Desfazer';
export const CARTAO_EQUIPAMENTO_TIRADO = 'Sem equipamento. A equipe vincula depois, se precisar.';
export const CARTAO_EQUIPAMENTO_ESCOLHA = 'Qual destes é o equipamento?';
export const CARTAO_CONFIRMAR = 'Confirmar e abrir chamado';
export const CARTAO_CONFIRMANDO = 'Abrindo o chamado…';
export const CARTAO_ESPERE_RESPOSTA = 'Espere o assistente terminar de responder para confirmar.';

/** O que a região ao vivo diz quando um cartão novo chega (AC-18). */
export const CARTAO_PRONTO_ANUNCIO = 'Resumo do chamado pronto para confirmar.';

export const CARTAO_ERRO_TIPO = 'Escolha o tipo de serviço';
export const CARTAO_ERRO_UNIDADE = 'Escolha a unidade';
export const CARTAO_ERRO_LOCAL = 'Informe o local exato';
export const CARTAO_ERRO_LOCAL_LONGO = 'O local passa de 200 caracteres';

/** O aviso de chamado duplicado no cartão (spec 0017, AC-7). */
export const DUPLICADOS_TITULO = 'Parece que já existe um chamado para isso';
export const DUPLICADOS_DICA =
  'Se for o mesmo problema, você pode acompanhar o chamado que já existe. Se for outro, é só confirmar abaixo.';
export const DUPLICADOS_ACOMPANHAR = 'Acompanhar este';
export const DUPLICADOS_ACOMPANHANDO = 'Abrindo…';
export const DUPLICADOS_VER = 'Ver chamado';
export const DUPLICADOS_PROPRIO = 'Você já abriu este chamado';
export const DUPLICADOS_VER_MEU = 'Ver meu chamado';

/** Uma frase por motivo de falha do "Acompanhar este" (spec 0017, AC-9 e AC-10). */
export const ACOMPANHAR_FRASES: Record<AcompanharFalha, string> = {
  nao_encontrada: 'Este rascunho não existe mais. Recarregue a página.',
  confirmacao_em_andamento:
    'Este chamado está sendo aberto neste instante, então não deu para acompanhar o outro.',
  cartao_desatualizado:
    'Este resumo não vale mais, porque a conversa mudou depois dele. Use o resumo mais recente.',
  fora_do_cartao: 'Não deu para acompanhar este chamado. Use o resumo mais recente.',
  chamado_encerrado:
    'Esse chamado já foi concluído ou encerrado. Se o problema continua, abra o seu.',
  dados_invalidos: 'Não deu para acompanhar este chamado. Recarregue a página e tente de novo.',
  erro: 'Não deu para acompanhar agora. Tente de novo em instantes.',
};

export function fraseDoAcompanhar(motivo: string | null | undefined): string {
  if (!motivo) return FALHA_REDE;
  return ACOMPANHAR_FRASES[motivo as AcompanharFalha] ?? FALHA_REDE;
}

/** A vista de quem acompanha um chamado (spec 0017, AC-14 e AC-16). */
export const ACOMPANHAMENTO_SELO = 'Você acompanha';
export const ACOMPANHAMENTO_DICA =
  'Você vê só o andamento deste chamado e recebe um aviso no sino quando ele terminar.';
export const ACOMPANHAMENTO_MARCOS = 'Andamento';
export const ACOMPANHAMENTO_SAIR = 'Deixar de acompanhar';
export const ACOMPANHAMENTO_SAINDO = 'Saindo…';
export const ACOMPANHAMENTO_SAIR_FALHA = 'Não deu para deixar de acompanhar agora. Tente de novo.';

/** A seção da lateral com os chamados acompanhados (spec 0017, AC-15). */
export const LATERAL_ACOMPANHANDO = 'Acompanhando';

/** O técnico atribuído vê só a contagem de interessados (spec 0017, AC-19). */
export function fraseDosInteressados(total: number): string {
  return total === 1
    ? '1 usuário relatou o mesmo problema'
    : `${total} usuários relataram o mesmo problema`;
}

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
