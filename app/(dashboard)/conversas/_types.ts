import type {
  ConversaAutor,
  ConversaMensagemTipo,
  ConversaSituacao,
} from '@/shared/conversas/conversa.constants';
import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

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
  /** Ausente vale `texto`. */
  tipo?: ConversaMensagemTipo;
  texto: string;
  /** ISO de `ConversaMensagem.createdAt`. */
  em: string;
  /** Só em `tipo: 'cartao'`: o resumo do chamado, já validado pelo schema (spec 0004). */
  cartao?: CartaoPayload | null;
};

export type ConversaNaTela = {
  id: string;
  situacao: ConversaSituacao;
  previa: string;
  mensagensCount: number;
  mensagens: MensagemNaTela[];
  /** O único cartão com ação; os outros aparecem como `Substituído` (spec 0004, AC-12). */
  cartaoAtualId: string | null;
};

/** Uma unidade ativa, para a troca de unidade no cartão (spec 0004, AC-6). */
export type UnidadeNaTela = { id: string; nome: string; andar: string };

/** Um item da linha do tempo do chamado em modo leitura. */
export type ItemLeitura =
  | {
      fonte: 'mensagem';
      id: string;
      em: string;
      autor: ConversaAutor;
      /** Ausente vale `texto`. Cartão em modo leitura aparece como resumo, sem ação. */
      tipo?: ConversaMensagemTipo;
      texto: string;
      /** A mensagem do Sigma de chamado aberto (spec 0004): sucesso, não falha. */
      chamadoAberto?: boolean;
    }
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
  /** `Aberto pelo chat`, com ou sem `serviço sugerido pela IA`; nulo no formulário (spec 0004). */
  marca: string | null;
  itens: ItemLeitura[];
  /** Verdadeiro quando alguma fonte bateu no teto e foi cortada. */
  truncado: boolean;
};
