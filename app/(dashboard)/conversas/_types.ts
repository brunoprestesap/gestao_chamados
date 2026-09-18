import type { ConversaAutor, ConversaSituacao } from '@/shared/conversas/conversa.constants';

/**
 * O modelo de leitura da tela de conversas (spec 0003). É montado no servidor e
 * atravessa a fronteira para os componentes de cliente, então aqui só entra
 * valor simples: nada de `ObjectId`, nada de `Date`. Datas viajam em ISO e são
 * formatadas no fuso do navegador.
 */

/** Uma linha da lateral: rascunho ou chamado, já com o endereço calculado. */
export type ItemLateral = {
  tipo: 'rascunho' | 'chamado';
  id: string;
  /** Calculado no servidor: o cliente nunca adivinha o endereço. */
  href: string;
  titulo: string;
  /** Linha de apoio: `Ainda não virou chamado`, ou `#2026-0412 · Ana está atendendo`. */
  apoio: string;
  /** Texto da marca colorida: `Rascunho`, `Confirmando`, `Em atendimento`. */
  situacao: string;
  /**
   * `Chamado.status` cru, só para a tela escolher a cor da marca pelo
   * `STATUS_BADGE` que as outras listas já usam. Nulo em rascunho.
   */
  statusChave: string | null;
  /** ISO. Rascunho traz `ultimaMensagemEm`; chamado traz `updatedAt`. */
  em: string;
  confirmando: boolean;
};

/** Cursor composto do `Carregar mais`: data igual nunca repete nem esconde chamado. */
export type CursorLateral = { em: string; id: string };

export type MensagemNaTela = {
  id: string;
  autor: ConversaAutor;
  texto: string;
  /** ISO de `ConversaMensagem.createdAt`. */
  em: string;
};

export type ConversaNaTela = {
  id: string;
  situacao: ConversaSituacao;
  previa: string;
  mensagensCount: number;
  mensagens: MensagemNaTela[];
};

/** Um item da linha do tempo do chamado em modo leitura. */
export type ItemLeitura =
  | { fonte: 'mensagem'; id: string; em: string; autor: ConversaAutor; texto: string }
  | {
      fonte: 'comentario';
      id: string;
      em: string;
      autorNome: string;
      interno: boolean;
      texto: string;
    }
  | { fonte: 'historico'; id: string; em: string; texto: string };

export type LeituraChamado = {
  chamadoId: string;
  ticketNumber: string;
  titulo: string;
  /** Rótulo da situação, já traduzido. */
  situacao: string;
  /** ISO de `Chamado.createdAt`. */
  abertoEm: string;
  itens: ItemLeitura[];
  /** Verdadeiro quando alguma fonte bateu no teto e foi cortada. */
  truncado: boolean;
};
