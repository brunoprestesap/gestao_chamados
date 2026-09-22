/**
 * Constantes da conversa e das decisões da IA (spec 0002).
 * Os enums do Mongoose derivam daqui, nunca o contrário.
 */

/** Quem escreveu a mensagem. `ia` e `sistema` só existem em código de servidor. */
export const CONVERSA_AUTORES = ['solicitante', 'ia', 'sistema'] as const;
export type ConversaAutor = (typeof CONVERSA_AUTORES)[number];

/**
 * Tipos de mensagem, cada um com o schema Zod do `payload` em
 * `conversa.schemas.ts`. `cartao` é o resumo do chamado para o solicitante
 * confirmar (spec 0004): não conta no teto de mensagens e só `lib/conversas`
 * o grava.
 */
export const CONVERSA_MENSAGEM_TIPOS = ['texto', 'cartao'] as const;
export type ConversaMensagemTipo = (typeof CONVERSA_MENSAGEM_TIPOS)[number];

/** Situação derivada da conversa, calculada na leitura a partir dos campos gravados. */
export const CONVERSA_SITUACOES = ['rascunho', 'reservada', 'vinculada'] as const;
export type ConversaSituacao = (typeof CONVERSA_SITUACOES)[number];

/** Campo que a IA decide. Um chamado tem no máximo uma decisão por campo. */
export const DECISAO_CAMPOS = ['servico', 'prioridade', 'tecnico'] as const;
export type DecisaoCampo = (typeof DECISAO_CAMPOS)[number];

export const DECISAO_CAMPO_LABELS: Record<DecisaoCampo, string> = {
  servico: 'serviço',
  prioridade: 'prioridade',
  tecnico: 'técnico',
};

/** Quem decidiu: o modelo (`ia`) ou uma regra determinística do Sigma (`regra`). */
export const DECISAO_DECIDIDO_POR = ['ia', 'regra'] as const;
export type DecisaoDecididoPor = (typeof DECISAO_DECIDIDO_POR)[number];

/** `sugestao` espera a triagem humana; `aplicado` já valeu sem humano. */
export const DECISAO_EFEITOS = ['sugestao', 'aplicado'] as const;
export type DecisaoEfeito = (typeof DECISAO_EFEITOS)[number];

export const DECISAO_SITUACOES = ['sem_revisao', 'confirmada', 'corrigida'] as const;
export type DecisaoSituacao = (typeof DECISAO_SITUACOES)[number];

export const DECISAO_CORRECAO_ORIGENS = ['solicitante', 'gestao'] as const;
export type DecisaoCorrecaoOrigem = (typeof DECISAO_CORRECAO_ORIGENS)[number];

/** Por onde o chamado foi aberto. Documento antigo lê `formulario` pelo padrão do Mongoose. */
export const CANAIS_ABERTURA = ['formulario', 'chat'] as const;
export type CanalAbertura = (typeof CANAIS_ABERTURA)[number];

/** Quanto a IA pesou neste chamado, e se a gestão já deu o veredito. */
export const IA_SITUACOES = ['sem_ia', 'sugerida', 'decidida', 'revisada'] as const;
export type IaSituacao = (typeof IA_SITUACOES)[number];

/**
 * Modo do cartão resumo (spec 0004). `ia` traz o serviço que a IA escolheu no
 * catálogo; `manual` pede o tipo de serviço, quando não há serviço válido.
 */
export const CARTAO_MODOS = ['ia', 'manual'] as const;
export type CartaoModo = (typeof CARTAO_MODOS)[number];

/** O que o cartão exige preencher antes de confirmar. */
export const CARTAO_FALTANDO = ['tipo', 'unidade', 'local'] as const;
export type CartaoFaltando = (typeof CARTAO_FALTANDO)[number];

/**
 * Motivos de falha de `lib/conversas`. Nenhuma função lança exceção: todas
 * devolvem `{ ok: true, ... }` ou `{ ok: false, reason }`, como `lib/llm`.
 */
export const CONVERSA_FALHAS = [
  'nao_encontrada',
  'sem_permissao',
  'limite_rascunhos',
  'limite_mensagens',
  'confirmacao_em_andamento',
  'ja_existe',
  'invalida',
  'erro',
] as const;
export type ConversaFalha = (typeof CONVERSA_FALHAS)[number];
