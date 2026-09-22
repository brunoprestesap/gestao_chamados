import mongoose, { InferSchemaType, Model, Schema, Types } from 'mongoose';

import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import {
  CONVERSA_PREVIA_MAX,
  DECISAO_MOTIVO_MAX,
  LOCAL_EXATO_MAX,
} from '@/shared/conversas/conversa.schemas';

/**
 * Conversa do solicitante (spec 0002). Nasce como rascunho do dono, antes de
 * existir qualquer chamado, e passa a pertencer a um chamado na confirmação.
 *
 * Ninguém escreve nesta coleção sem passar por `lib/conversas/`: os valores
 * derivados (`previa`, `mensagensCount`, `ultimaMensagemEm`) são mantidos lá,
 * na mesma gravação condicional que aplica os limites.
 */

/**
 * O que a IA propôs até agora para o chamado desta conversa (spec 0004).
 *
 * Interno do servidor: escrito só por `lib/conversas/`, sempre em gravação
 * condicional ao rascunho, e nunca devolvido por `lerConversa`,
 * `listarRascunhos` nem `lerLinhaDoTempo`. Confiança, motivo e prioridade
 * sugerida não saem daqui nesta fatia.
 *
 * Os campos da extração e o `meta` da chamada ficam nulos só quando o cartão
 * manual nasceu antes de qualquer resposta boa da IA: aí a proposta existe
 * apenas para guardar o ponteiro do cartão.
 */
const PropostaServicoSchema = new Schema(
  {
    catalogServiceId: { type: Schema.Types.ObjectId, ref: 'ServiceCatalog', required: true },
    subtypeId: { type: Schema.Types.ObjectId, ref: 'ServiceSubType', required: true },
    tipoServico: { type: String, enum: TIPO_SERVICO_OPTIONS, required: true },
    confianca: { type: Number, min: 0, max: 1, required: true },
    motivo: { type: String, required: true, maxlength: DECISAO_MOTIVO_MAX },
  },
  { _id: false },
);

const PropostaPrioridadeSchema = new Schema(
  {
    prioridade: { type: String, enum: FINAL_PRIORITY_VALUES, required: true },
    confianca: { type: Number, min: 0, max: 1, required: true },
    motivo: { type: String, required: true, maxlength: DECISAO_MOTIVO_MAX },
  },
  { _id: false },
);

const PropostaIaSchema = new Schema(
  {
    /** O único cartão que vale. Gravado antes da própria mensagem (AC-12). */
    cartaoMensagemId: { type: Schema.Types.ObjectId, ref: 'ConversaMensagem', default: null },
    /** Só com código conferido no catálogo ativo. */
    servico: { type: PropostaServicoSchema, default: null },
    /** Nunca exibida nesta fatia: existe para medir o acerto às cegas. */
    prioridade: { type: PropostaPrioridadeSchema, default: null },
    localExato: { type: String, default: null, maxlength: LOCAL_EXATO_MAX },
    /** O relato fala de outro lugar que não a unidade do perfil. */
    localForaDoPerfil: { type: Boolean, default: false },
    /** A IA julga que não falta nada importante. */
    completo: { type: Boolean, default: false },
    llmCallId: { type: Schema.Types.ObjectId, ref: 'LlmCall', default: null },
    modelo: { type: String, default: null },
    promptVersion: { type: String, default: null },
    task: { type: String, default: null },
    /**
     * A mensagem do solicitante que esta proposta responde. A reescrita só
     * vale com id maior que o guardado: resposta atrasada nunca passa por cima
     * de uma mais nova (AC-3).
     */
    origemMensagemId: { type: Schema.Types.ObjectId, ref: 'ConversaMensagem', default: null },
    atualizadaEm: { type: Date, default: null },
  },
  { _id: false },
);

const ConversaSchema = new Schema(
  {
    /** Dono da conversa. Vem sempre da sessão verificada, nunca do corpo do pedido. */
    solicitanteId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Gravado uma única vez, no vínculo. Depois disso nunca muda. */
    chamadoId: { type: Schema.Types.ObjectId, ref: 'Chamado', default: null },
    /** Id gerado na reserva e reusado em toda repetição da confirmação. */
    chamadoIdReservado: { type: Schema.Types.ObjectId, default: null },
    /** Marca a reserva em andamento; vale por `CONVERSA_RESERVA_MS`. */
    vinculandoEm: { type: Date, default: null },
    /** Começo da primeira mensagem do solicitante, para a lista lateral. */
    previa: { type: String, default: '', maxlength: CONVERSA_PREVIA_MAX },
    /** Incrementado na mesma gravação que aplica o teto de mensagens do rascunho. */
    mensagensCount: { type: Number, required: true, default: 0, min: 0 },
    /** Ordena a lista lateral. Começa igual ao `createdAt`, antes de existir mensagem. */
    ultimaMensagemEm: { type: Date, required: true },
    /**
     * `ultimaMensagemEm` mais `CONVERSA_RASCUNHO_DIAS` enquanto é rascunho.
     * Vira `null` na reserva e nunca volta: conversa ligada não expira.
     */
    expiresAt: { type: Date, default: null },
    /** A proposta da IA para o chamado (spec 0004). Nula até a primeira resposta boa. */
    propostaIa: { type: PropostaIaSchema, default: null },
  },
  { timestamps: true },
);

ConversaSchema.index({ solicitanteId: 1, chamadoId: 1, ultimaMensagemEm: -1 });
/** TTL do rascunho. O Mongo ignora documento cujo `expiresAt` não é data. */
ConversaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/** Uma conversa pertence a um único chamado. O parcial deixa vários `null` conviverem. */
ConversaSchema.index(
  { chamadoId: 1 },
  { unique: true, partialFilterExpression: { chamadoId: { $type: 'objectId' } } },
);

export type Conversa = InferSchemaType<typeof ConversaSchema>;

export type ConversaDoc = Conversa & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

if (mongoose.models.Conversa) {
  delete mongoose.models.Conversa;
}

export const ConversaModel: Model<Conversa> = mongoose.model<Conversa>('Conversa', ConversaSchema);
