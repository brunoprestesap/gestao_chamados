import 'server-only';

import type { UserRole } from '@/shared/auth/auth.constants';
import type {
  ConversaAutor,
  ConversaFalha,
  ConversaMensagemTipo,
  ConversaSituacao,
  DecisaoCampo,
  DecisaoCorrecaoOrigem,
  DecisaoDecididoPor,
  DecisaoEfeito,
  DecisaoSituacao,
  IaSituacao,
} from '@/shared/conversas/conversa.constants';
import type { ValorDecisao, ValorDecisaoInput } from '@/shared/conversas/conversa.schemas';

/**
 * Contrato de `lib/conversas` (spec 0002). Nenhuma função lança exceção: todas
 * devolvem `{ ok: true, ... }` ou `{ ok: false, reason }`, no estilo de `lib/llm`.
 */

/** Sempre da sessão verificada, nunca do corpo do pedido. */
export type Viewer = { userId: string; role: UserRole };

export type Falha = { ok: false; reason: ConversaFalha };

export type Resultado<T = unknown> = ({ ok: true } & T) | Falha;

/** Sucesso sem dado de volta. */
export type Confirmacao = { ok: true } | Falha;

export type MensagemLida = {
  id: string;
  autor: ConversaAutor;
  userId: string | null;
  tipo: ConversaMensagemTipo;
  texto: string;
  payload: unknown;
  llmCallId: string | null;
  createdAt: Date;
};

export type ConversaLida = {
  id: string;
  solicitanteId: string;
  chamadoId: string | null;
  situacao: ConversaSituacao;
  previa: string;
  mensagensCount: number;
  ultimaMensagemEm: Date;
  expiresAt: Date | null;
  createdAt: Date;
};

export type RascunhoListado = {
  id: string;
  previa: string;
  mensagensCount: number;
  ultimaMensagemEm: Date;
  expiresAt: Date | null;
  /** Verdadeiro enquanto uma confirmação está reservada e ainda não virou chamado. */
  confirmando: boolean;
};

/** Valor decidido do jeito que quem chama informa; o rótulo é lido do banco. */
export type DecisaoEntrada = {
  campo: DecisaoCampo;
  decididoPor: DecisaoDecididoPor;
  efeito: DecisaoEfeito;
  valor: ValorDecisaoInput;
  motivo: string;
  /** Só com `decididoPor: 'ia'`. */
  confianca?: number | null;
  /** `LlmResult.meta` da chamada que produziu a decisão. */
  meta?: { model: string; promptVersion: string; task: string; callId: string } | null;
  /**
   * Valor que o solicitante confirmou, quando difere do proposto pela IA.
   * A decisão nasce `corrigida`, com uma correção de origem `solicitante`.
   */
  valorConfirmado?: ValorDecisaoInput | null;
};

export type CorrecaoLida = {
  anterior: ValorDecisao;
  novo: ValorDecisao;
  userId: string;
  origem: DecisaoCorrecaoOrigem;
  motivo: string;
  em: Date;
};

export type DecisaoLida = {
  id: string;
  campo: DecisaoCampo;
  decididoPor: DecisaoDecididoPor;
  efeito: DecisaoEfeito;
  valorIa: ValorDecisao;
  valorFinal: ValorDecisao;
  confianca: number | null;
  motivo: string;
  modelo: string | null;
  promptVersion: string | null;
  task: string | null;
  llmCallId: string | null;
  correcoes: CorrecaoLida[];
  revisadaEm: Date | null;
  revisadaPorUserId: string | null;
  situacao: DecisaoSituacao;
  createdAt: Date;
};

/** Dados do chamado montados por quem chama; sem `_id` e sem número. */
export type DadosChamado = Record<string, unknown>;

export type AberturaResultado = Resultado<{
  chamadoId: string;
  ticketNumber: string;
  /** Verdadeiro quando o chamado do id reservado já existia. */
  jaExistia: boolean;
}>;

export type ItemLinhaDoTempo =
  | { fonte: 'mensagem'; id: string; em: Date; dados: MensagemLida }
  | {
      fonte: 'comentario';
      id: string;
      em: Date;
      dados: { userId: string; content: string; visibility: string };
    }
  | {
      fonte: 'historico';
      id: string;
      em: Date;
      dados: {
        action: string;
        actorType: string;
        userId: string | null;
        observacoes: string;
        statusAnterior: string | null;
        statusNovo: string | null;
        decisaoIaId: string | null;
      };
    };

export type LinhaDoTempo = Resultado<{
  itens: ItemLinhaDoTempo[];
  /** Verdadeiro quando alguma fonte bateu no teto e foi cortada. */
  truncado: boolean;
}>;

export type { IaSituacao };
