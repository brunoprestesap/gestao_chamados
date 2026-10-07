import 'server-only';

/**
 * Tetos da abertura do chamado pela conversa (spec 0004). Mudam com deploy,
 * não são variáveis de ambiente.
 */

/**
 * Tamanho máximo do bloco do catálogo no prompt. Acima disso a chamada vai sem
 * catálogo, a extração de serviço sai nula e o servidor registra
 * `[assistente] catalogo acima do teto` (AC-2).
 */
export const CATALOGO_PROMPT_MAX_CARACTERES = 12_000;

/** Quanto da descrição de cada serviço entra na linha do catálogo. */
export const CATALOGO_DESCRICAO_MAX = 120;

/**
 * Entrada inteira enviada ao modelo (`system` mais o `content` das mensagens,
 * contada como `lib/llm/admission.ts` conta). Fica abaixo dos 24.000 da spec
 * 0001 para a chamada nunca cair em `bad_request` por tamanho.
 */
export const ENTRADA_MAX_CARACTERES = 22_000;

/** Troca o motivo vazio vindo do modelo, que a decisão não aceita (AC-3). */
export const MOTIVO_VAZIO = 'O modelo não explicou.';

// O local exato tem o mesmo teto na tela, no cartão e na confirmação, por isso
// a constante mora em `shared/`: o cartão do navegador também a usa.
export { LOCAL_EXATO_MAX } from '@/shared/conversas/conversa.schemas';

// O teto de candidatos de equipamento (spec 0014, AC-3) também vale no schema
// do cartão, por isso mora em `shared/`.
export { ATIVO_CANDIDATOS_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * Aviso de chamado duplicado (spec 0017). Cada ramo da busca lê no máximo
 * esta quantidade de chamados, os mais recentes (AC-4).
 */
export const DUPLICADOS_LEITURA_MAX = 50;

// O teto de parecidos no cartão também vale no schema, por isso mora em `shared/`.
export { DUPLICADOS_CARTAO_MAX } from '@/shared/conversas/conversa.schemas';

/** Quantos dias o chamado acompanhado fica na lateral depois do aviso de fim (AC-15). */
export const ACOMPANHANDO_DIAS_APOS_FIM = 7;
