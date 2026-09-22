import 'server-only';

import { Types } from 'mongoose';

import { criarComentario } from '@/lib/chamados/comentarios';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { ConversaModel } from '@/models/Conversa';
import { ConversaMensagemModel } from '@/models/ConversaMensagem';
import { DecisaoIaModel } from '@/models/DecisaoIa';
import type {
  ConversaAutor,
  ConversaMensagemTipo,
  ConversaSituacao,
  DecisaoCampo,
} from '@/shared/conversas/conversa.constants';
import {
  CONVERSA_PAYLOAD_SCHEMAS,
  conversaTextoSchema,
  objectIdSchema,
} from '@/shared/conversas/conversa.schemas';

import {
  CONVERSA_MENSAGENS_MAX,
  CONVERSA_PREVIA_MAX,
  CONVERSA_RASCUNHO_MS,
  CONVERSA_RASCUNHOS_MAX,
  CONVERSA_RESERVA_MS,
} from './config';
import { garantirHistoricoDecisao } from './decisoes';
import type {
  Confirmacao,
  ConversaLida,
  Falha,
  MensagemLida,
  RascunhoListado,
  Resultado,
  Viewer,
} from './types';

/**
 * Posse, limites e ciclo de vida da conversa (spec 0002).
 *
 * Rascunho é do dono e de mais ninguém, nem do Admin. Toda resposta negativa é
 * `sem_permissao` ou `nao_encontrada` sem revelar se a conversa existe para quem
 * não tem direito a ela.
 */

const falha = (reason: Falha['reason']): Falha => ({ ok: false, reason });

/** Documento cru da conversa, como as consultas com `lean()` o devolvem. */
type ConversaCrua = {
  _id: Types.ObjectId;
  solicitanteId: Types.ObjectId;
  chamadoId: Types.ObjectId | null;
  chamadoIdReservado: Types.ObjectId | null;
  vinculandoEm: Date | null;
  previa: string;
  mensagensCount: number;
  ultimaMensagemEm: Date;
  expiresAt: Date | null;
  createdAt: Date;
  /** Interno do servidor (spec 0004). Daqui só sai o ponteiro do cartão. */
  propostaIa?: {
    cartaoMensagemId?: Types.ObjectId | null;
    origemMensagemId?: Types.ObjectId | null;
  } | null;
};

export function situacaoDe(conversa: {
  chamadoId: Types.ObjectId | null;
  vinculandoEm: Date | null;
}): ConversaSituacao {
  if (conversa.chamadoId) return 'vinculada';
  if (conversa.vinculandoEm) return 'reservada';
  return 'rascunho';
}

/** A reserva ainda vale, ou já passou da janela e conta como abandonada? */
export function reservaAtiva(vinculandoEm: Date | null, agora = new Date()): boolean {
  if (!vinculandoEm) return false;
  return agora.getTime() - vinculandoEm.getTime() < CONVERSA_RESERVA_MS;
}

export function vencimentoRascunho(base: Date): Date {
  return new Date(base.getTime() + CONVERSA_RASCUNHO_MS);
}

function paraConversaLida(doc: ConversaCrua): ConversaLida {
  return {
    id: String(doc._id),
    solicitanteId: String(doc.solicitanteId),
    chamadoId: doc.chamadoId ? String(doc.chamadoId) : null,
    situacao: situacaoDe(doc),
    previa: doc.previa ?? '',
    mensagensCount: doc.mensagensCount ?? 0,
    ultimaMensagemEm: doc.ultimaMensagemEm,
    expiresAt: doc.expiresAt ?? null,
    createdAt: doc.createdAt,
    cartaoAtualId: doc.propostaIa?.cartaoMensagemId
      ? String(doc.propostaIa.cartaoMensagemId)
      : null,
  };
}

/** Busca sem filtro de posse. Quem chama decide o que revelar. */
export async function buscarConversa(conversaId: string): Promise<ConversaCrua | null> {
  if (!objectIdSchema.safeParse(conversaId).success) return null;
  return (await ConversaModel.findById(conversaId).lean()) as ConversaCrua | null;
}

/**
 * Cria o rascunho antes de existir qualquer mensagem, já com a data de
 * expiração 30 dias à frente (AC-1, AC-2).
 */
export async function criarConversa(viewer: Viewer): Promise<Resultado<{ conversaId: string }>> {
  try {
    await dbConnect();

    const rascunhos = await ConversaModel.countDocuments({
      solicitanteId: viewer.userId,
      chamadoId: null,
    });
    if (rascunhos >= CONVERSA_RASCUNHOS_MAX) return falha('limite_rascunhos');

    const agora = new Date();
    const criada = await ConversaModel.create({
      solicitanteId: new Types.ObjectId(viewer.userId),
      ultimaMensagemEm: agora,
      expiresAt: vencimentoRascunho(agora),
      previa: '',
      mensagensCount: 0,
    });

    return { ok: true, conversaId: String(criada._id) };
  } catch (err) {
    registrarErro('criarConversa', { userId: viewer.userId }, err);
    return falha('erro');
  }
}

export type EnviarMensagemParams = {
  viewer: Viewer;
  conversaId: string;
  autor: ConversaAutor;
  tipo: 'texto';
  texto: string;
  payload?: unknown;
  llmCallId?: string | null;
};

/**
 * Grava uma mensagem na conversa e atualiza `previa`, `ultimaMensagemEm` e
 * `mensagensCount` na mesma gravação condicional que aplica o teto (AC-1).
 *
 * O teto de mensagens vale só enquanto a conversa é rascunho. Depois do vínculo
 * o caminho do solicitante é o comentário do chamado, tratado em `index.ts`.
 */
export async function enviarMensagem(
  params: EnviarMensagemParams,
): Promise<Resultado<{ destino: 'conversa' | 'comentario'; id: string }>> {
  const texto = conversaTextoSchema.safeParse(params.texto);
  if (!texto.success) return falha('invalida');

  const payloadSchema = CONVERSA_PAYLOAD_SCHEMAS[params.tipo];
  if (!payloadSchema) return falha('invalida');
  const payload = payloadSchema.safeParse(params.payload ?? null);
  if (!payload.success) return falha('invalida');

  if (params.llmCallId && !objectIdSchema.safeParse(params.llmCallId).success) {
    return falha('invalida');
  }

  try {
    await dbConnect();

    const conversa = await buscarConversa(params.conversaId);
    if (!conversa) return falha('nao_encontrada');
    if (String(conversa.solicitanteId) !== params.viewer.userId) return falha('sem_permissao');

    const ligada = Boolean(conversa.chamadoId);

    // Depois da abertura, o que o solicitante escreve é comentário do chamado:
    // o texto do relato existe em um lugar só (AC-13). Mensagem de `ia` ou
    // `sistema` continua sendo gravada na conversa.
    if (ligada && params.autor === 'solicitante') {
      const comentario = await criarComentario({
        chamadoId: String(conversa.chamadoId),
        autorUserId: params.viewer.userId,
        autorRole: params.viewer.role,
        content: texto.data,
        visibility: 'publico',
      });
      if (!comentario.ok) return falha('sem_permissao');
      return { ok: true, destino: 'comentario', id: comentario.id };
    }

    const agora = new Date();

    // O teto entra no filtro: a gravação só acontece se ainda houver espaço.
    const filtro: Record<string, unknown> = { _id: conversa._id };
    if (!ligada) filtro.mensagensCount = { $lt: CONVERSA_MENSAGENS_MAX };

    const primeiraDoSolicitante = params.autor === 'solicitante' && !conversa.previa;
    const reservado = await ConversaModel.findOneAndUpdate(
      filtro,
      [
        {
          $set: {
            mensagensCount: { $add: [{ $ifNull: ['$mensagensCount', 0] }, 1] },
            ultimaMensagemEm: agora,
            // Rascunho renova a expiração; reservada e vinculada seguem sem ela.
            expiresAt: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $ifNull: ['$chamadoId', null] }, null] },
                    { $eq: [{ $ifNull: ['$vinculandoEm', null] }, null] },
                  ],
                },
                vencimentoRascunho(agora),
                null,
              ],
            },
            ...(primeiraDoSolicitante ? { previa: texto.data.slice(0, CONVERSA_PREVIA_MAX) } : {}),
          },
        },
      ],
      { returnDocument: 'after', updatePipeline: true },
    ).lean();

    if (!reservado) return falha('limite_mensagens');

    const expiresAt = (reservado as ConversaCrua).expiresAt ?? null;

    try {
      const mensagem = await ConversaMensagemModel.create({
        conversaId: conversa._id,
        autor: params.autor,
        userId: params.autor === 'solicitante' ? new Types.ObjectId(params.viewer.userId) : null,
        tipo: params.tipo,
        texto: texto.data,
        payload: payload.data ?? null,
        llmCallId: params.llmCallId ? new Types.ObjectId(params.llmCallId) : null,
        expiresAt,
      });
      return { ok: true, destino: 'conversa', id: String(mensagem._id) };
    } catch (err) {
      // A vaga foi tomada e a mensagem não entrou: devolve a vaga ao contador.
      await ConversaModel.updateOne({ _id: conversa._id }, { $inc: { mensagensCount: -1 } }).catch(
        () => undefined,
      );
      throw err;
    }
  } catch (err) {
    registrarErro('enviarMensagem', { conversaId: params.conversaId }, err);
    return falha('erro');
  }
}

/** Mensagens da conversa, em ordem de data e, no empate, de `_id`. */
export async function lerMensagens(conversaId: string): Promise<MensagemLida[]> {
  const docs = await ConversaMensagemModel.find({ conversaId })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    autor: doc.autor as ConversaAutor,
    userId: doc.userId ? String(doc.userId) : null,
    tipo: doc.tipo as ConversaMensagemTipo,
    texto: doc.texto,
    payload: doc.payload ?? null,
    llmCallId: doc.llmCallId ? String(doc.llmCallId) : null,
    createdAt: doc.createdAt as Date,
  }));
}

/** Apaga o rascunho e suas mensagens na hora. Só o dono descarta (AC-2). */
export async function descartarRascunho(viewer: Viewer, conversaId: string): Promise<Confirmacao> {
  try {
    await dbConnect();

    const conversa = await buscarConversa(conversaId);
    if (!conversa) return falha('nao_encontrada');
    if (String(conversa.solicitanteId) !== viewer.userId) return falha('sem_permissao');
    if (conversa.chamadoId) return falha('sem_permissao');
    if (reservaAtiva(conversa.vinculandoEm)) return falha('confirmacao_em_andamento');

    await ConversaMensagemModel.deleteMany({ conversaId: conversa._id });
    await ConversaModel.deleteOne({ _id: conversa._id, chamadoId: null });

    return { ok: true };
  } catch (err) {
    registrarErro('descartarRascunho', { conversaId }, err);
    return falha('erro');
  }
}

// ---------------------------------------------------------------------------
// Reserva e reparo
// ---------------------------------------------------------------------------

/** Antes disso a reserva ainda vale; a partir daí conta como abandonada. */
function expiradaEm(agora: Date): Date {
  return new Date(agora.getTime() - CONVERSA_RESERVA_MS);
}

/**
 * Passo 1 da abertura. Uma gravação só: marca a reserva, preserva o
 * `chamadoIdReservado` já existente (ou gera um novo) e zera a expiração na
 * conversa e nas mensagens (AC-3).
 */
export async function reservar(
  conversaId: string,
  solicitanteId: string,
  agora: Date,
): Promise<{ chamadoIdReservado: string } | null> {
  const novoId = new Types.ObjectId();

  const reservada = await ConversaModel.findOneAndUpdate(
    {
      _id: conversaId,
      solicitanteId,
      chamadoId: null,
      $or: [
        { vinculandoEm: null },
        { vinculandoEm: { $exists: false } },
        { vinculandoEm: { $lte: expiradaEm(agora) } },
      ],
    },
    [
      {
        $set: {
          vinculandoEm: agora,
          chamadoIdReservado: { $ifNull: ['$chamadoIdReservado', novoId] },
          expiresAt: null,
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  )
    .select('chamadoIdReservado')
    .lean();

  if (!reservada) return null;

  await ConversaMensagemModel.updateMany({ conversaId }, { $set: { expiresAt: null } });

  const doc = reservada as unknown as { chamadoIdReservado: Types.ObjectId };
  return { chamadoIdReservado: String(doc.chamadoIdReservado) };
}

/** A reserva ainda é desta execução? Condição de toda gravação seguinte. */
export async function reservaAindaMinha(conversaId: string, chamadoId: string): Promise<boolean> {
  const atual = await ConversaModel.findById(conversaId).select('chamadoIdReservado').lean();
  if (!atual) return false;
  const doc = atual as unknown as { chamadoIdReservado: Types.ObjectId | null };
  return String(doc.chamadoIdReservado) === chamadoId;
}

/** Devolve a conversa ao estado de rascunho quando a confirmação não pôde seguir. */
export async function soltarReserva(
  conversaId: string,
  chamadoId: string,
  ultimaMensagemEm: Date,
): Promise<void> {
  const vencimento = vencimentoRascunho(ultimaMensagemEm);
  await ConversaModel.updateOne(
    { _id: conversaId, chamadoIdReservado: chamadoId, chamadoId: null },
    { $set: { vinculandoEm: null, expiresAt: vencimento } },
  );
  await ConversaMensagemModel.updateMany({ conversaId }, { $set: { expiresAt: vencimento } });
}

/** A entrada de abertura, conferida antes para não duplicar (passo 4). */
export async function garantirHistoricoAbertura(chamadoId: string, userId: string): Promise<void> {
  const existe = await ChamadoHistoryModel.exists({ chamadoId, action: 'abertura' });
  if (existe) return;

  await ChamadoHistoryModel.create({
    chamadoId: new Types.ObjectId(chamadoId),
    userId: new Types.ObjectId(userId),
    actorType: 'usuario',
    action: 'abertura',
    statusNovo: 'aberto',
    observacoes: 'Chamado aberto pela conversa',
  });
}

/**
 * Completa uma confirmação que parou no meio (AC-5).
 *
 * Roda na leitura da conversa e na lista de rascunhos, então o reparo acontece
 * sozinho, sem ninguém precisar tentar de novo. Toda gravação é condicional ao
 * mesmo `chamadoIdReservado`: um processo lento que ressurge encontra a condição
 * falsa, desiste, e o reparo seguinte refaz o caminho pelo estado do banco.
 */
export async function repararSePreciso(conversa: ConversaCrua): Promise<ConversaCrua> {
  const reservado = conversa.chamadoIdReservado;
  if (conversa.chamadoId || !reservado) return conversa;

  const chamado = await ChamadoModel.findById(reservado).select('_id').lean();

  if (chamado) {
    // O chamado existe: faltou fechar o histórico e o vínculo.
    await garantirHistoricoAbertura(String(reservado), String(conversa.solicitanteId));

    const decisoes = await DecisaoIaModel.find({ chamadoId: reservado })
      .select('_id campo valorIa decididoPor')
      .lean();
    for (const decisao of decisoes) {
      await garantirHistoricoDecisao({
        chamadoId: String(reservado),
        decisaoIaId: String(decisao._id),
        campo: decisao.campo as DecisaoCampo,
        rotulo: String((decisao.valorIa as { rotulo?: string })?.rotulo ?? ''),
        decididoPor: decisao.decididoPor as 'ia' | 'regra',
      });
    }

    await ConversaModel.updateOne(
      { _id: conversa._id, chamadoIdReservado: reservado, chamadoId: null },
      { $set: { chamadoId: reservado, expiresAt: null, vinculandoEm: null } },
    );
    await ConversaMensagemModel.updateMany(
      { conversaId: conversa._id },
      { $set: { expiresAt: null } },
    );

    return { ...conversa, chamadoId: reservado, expiresAt: null, vinculandoEm: null };
  }

  // Sem chamado e com a reserva ainda na janela: alguém pode estar no meio dela.
  if (reservaAtiva(conversa.vinculandoEm)) return conversa;

  // Reserva abandonada: volta a ser rascunho e as decisões órfãs somem.
  await DecisaoIaModel.deleteMany({ chamadoId: reservado });
  await soltarReserva(String(conversa._id), String(reservado), conversa.ultimaMensagemEm);

  return {
    ...conversa,
    vinculandoEm: null,
    expiresAt: vencimentoRascunho(conversa.ultimaMensagemEm),
  };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Lê a conversa com a regra de visibilidade (AC-14). Rascunho é só do dono, nem
 * o Admin lê. Conversa ligada é do solicitante, da gestão e do técnico atribuído
 * naquele momento.
 */
export async function lerConversa(
  viewer: Viewer,
  conversaId: string,
): Promise<Resultado<{ conversa: ConversaLida; mensagens: MensagemLida[] }>> {
  try {
    await dbConnect();

    const encontrada = await buscarConversa(conversaId);
    if (!encontrada) return falha('nao_encontrada');

    const conversa = await repararSePreciso(encontrada);
    const dono = String(conversa.solicitanteId) === viewer.userId;

    if (!conversa.chamadoId) {
      if (!dono) return falha('sem_permissao');
    } else if (!dono && !(await podeVerChamado(viewer, String(conversa.chamadoId)))) {
      return falha('sem_permissao');
    }

    return {
      ok: true,
      conversa: paraConversaLida(conversa),
      mensagens: await lerMensagens(conversaId),
    };
  } catch (err) {
    registrarErro('lerConversa', { conversaId }, err);
    return falha('erro');
  }
}

/** Gestão vê tudo; o técnico vê o que está atribuído a ele naquele momento. */
export async function podeVerChamado(viewer: Viewer, chamadoId: string): Promise<boolean> {
  if (viewer.role === 'Admin' || viewer.role === 'Preposto') return true;

  const chamado = await ChamadoModel.findById(chamadoId)
    .select('solicitanteId assignedToUserId')
    .lean();
  if (!chamado) return false;

  if (String(chamado.solicitanteId) === viewer.userId) return true;
  return Boolean(chamado.assignedToUserId) && String(chamado.assignedToUserId) === viewer.userId;
}

/**
 * Rascunhos do dono, do mais recente para o mais antigo. Inclui a conversa com
 * reserva em andamento, marcada como `confirmando`, e repara no caminho, para
 * uma reserva travada não sumir da vista de quem a criou (AC-5).
 */
export async function listarRascunhos(
  viewer: Viewer,
): Promise<Resultado<{ rascunhos: RascunhoListado[] }>> {
  try {
    await dbConnect();

    const docs = (await ConversaModel.find({ solicitanteId: viewer.userId, chamadoId: null })
      .sort({ ultimaMensagemEm: -1 })
      .lean()) as unknown as ConversaCrua[];

    const rascunhos: RascunhoListado[] = [];
    for (const doc of docs) {
      const conversa = await repararSePreciso(doc);
      // O reparo pode ter ligado a conversa a um chamado: aí não é rascunho.
      if (conversa.chamadoId) continue;
      rascunhos.push({
        id: String(conversa._id),
        previa: conversa.previa ?? '',
        mensagensCount: conversa.mensagensCount ?? 0,
        ultimaMensagemEm: conversa.ultimaMensagemEm,
        expiresAt: conversa.expiresAt ?? null,
        confirmando: reservaAtiva(conversa.vinculandoEm),
      });
    }

    return { ok: true, rascunhos };
  } catch (err) {
    registrarErro('listarRascunhos', { userId: viewer.userId }, err);
    return falha('erro');
  }
}

export { paraConversaLida };

/**
 * Log de falha: id, operação e mensagem técnica. Nunca texto de mensagem, que
 * pode trazer nome, telefone e local (LGPD).
 */
export function registrarErro(
  operacao: string,
  contexto: Record<string, string | null | undefined>,
  err: unknown,
): void {
  console.error(
    '[conversa]',
    JSON.stringify({
      operacao,
      ...contexto,
      error: err instanceof Error ? err.message : 'unknown',
    }),
  );
}
