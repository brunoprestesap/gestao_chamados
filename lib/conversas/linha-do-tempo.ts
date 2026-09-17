import 'server-only';

import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoCommentModel } from '@/models/ChamadoComment';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { ConversaModel } from '@/models/Conversa';
import { ConversaMensagemModel } from '@/models/ConversaMensagem';
import type { ConversaAutor } from '@/shared/conversas/conversa.constants';
import { objectIdSchema } from '@/shared/conversas/conversa.schemas';

import { LINHA_DO_TEMPO_MAX } from './config';
import { registrarErro } from './conversa-store';
import type { Falha, ItemLinhaDoTempo, LinhaDoTempo, Viewer } from './types';

/**
 * A leitura combinada (spec 0002, AC-12).
 *
 * Depois da abertura nada é copiado: as mensagens da conversa, os comentários e
 * o histórico continuam onde sempre estiveram, e a tela junta os três na hora
 * da leitura. Cada fonte devolve no máximo `LINHA_DO_TEMPO_MAX` itens, sempre
 * os mais recentes.
 */

const falha = (reason: Falha['reason']): Falha => ({ ok: false, reason });

export async function lerLinhaDoTempo(viewer: Viewer, chamadoId: string): Promise<LinhaDoTempo> {
  if (!objectIdSchema.safeParse(chamadoId).success) return falha('nao_encontrada');

  try {
    await dbConnect();

    const chamado = await ChamadoModel.findById(chamadoId)
      .select('solicitanteId assignedToUserId conversaId')
      .lean();
    if (!chamado) return falha('nao_encontrada');

    const gestao = viewer.role === 'Admin' || viewer.role === 'Preposto';
    const solicitante = String(chamado.solicitanteId) === viewer.userId;
    const tecnicoAtribuido = Boolean(
      chamado.assignedToUserId && String(chamado.assignedToUserId) === viewer.userId,
    );
    if (!gestao && !solicitante && !tecnicoAtribuido) return falha('sem_permissao');

    // Comentário interno é só da gestão e do técnico atribuído.
    const veInterno = gestao || tecnicoAtribuido;

    const conversaId = chamado.conversaId ?? null;
    const conversaExiste = conversaId
      ? Boolean(await ConversaModel.exists({ _id: conversaId }))
      : false;

    const [mensagens, comentarios, historico] = await Promise.all([
      conversaExiste
        ? ConversaMensagemModel.find({ conversaId })
            .sort({ createdAt: -1, _id: -1 })
            .limit(LINHA_DO_TEMPO_MAX)
            .lean()
        : Promise.resolve([]),
      ChamadoCommentModel.find(veInterno ? { chamadoId } : { chamadoId, visibility: 'publico' })
        .sort({ createdAt: -1, _id: -1 })
        .limit(LINHA_DO_TEMPO_MAX)
        .lean(),
      ChamadoHistoryModel.find({ chamadoId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(LINHA_DO_TEMPO_MAX)
        .lean(),
    ]);

    const truncado =
      mensagens.length === LINHA_DO_TEMPO_MAX ||
      comentarios.length === LINHA_DO_TEMPO_MAX ||
      historico.length === LINHA_DO_TEMPO_MAX;

    const itens: ItemLinhaDoTempo[] = [
      ...mensagens.map(
        (m): ItemLinhaDoTempo => ({
          fonte: 'mensagem',
          id: String(m._id),
          em: m.createdAt as Date,
          dados: {
            id: String(m._id),
            autor: m.autor as ConversaAutor,
            userId: m.userId ? String(m.userId) : null,
            tipo: m.tipo as 'texto',
            texto: m.texto,
            payload: m.payload ?? null,
            llmCallId: m.llmCallId ? String(m.llmCallId) : null,
            createdAt: m.createdAt as Date,
          },
        }),
      ),
      ...comentarios.map(
        (c): ItemLinhaDoTempo => ({
          fonte: 'comentario',
          id: String(c._id),
          em: c.createdAt as Date,
          dados: {
            userId: String(c.userId),
            content: c.content,
            visibility: String(c.visibility),
          },
        }),
      ),
      ...historico.map(
        (h): ItemLinhaDoTempo => ({
          fonte: 'historico',
          id: String(h._id),
          em: h.createdAt as Date,
          dados: {
            action: String(h.action),
            actorType: String(h.actorType ?? 'usuario'),
            userId: h.userId ? String(h.userId) : null,
            observacoes: String(h.observacoes ?? ''),
            statusAnterior: h.statusAnterior ? String(h.statusAnterior) : null,
            statusNovo: h.statusNovo ? String(h.statusNovo) : null,
            decisaoIaId: h.decisaoIaId ? String(h.decisaoIaId) : null,
          },
        }),
      ),
    ];

    // Cada fonte veio do mais recente para o mais antigo; aqui vira ordem de
    // exibição: data e, no empate, `_id`.
    itens.sort((a, b) => {
      const diff = a.em.getTime() - b.em.getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    return { ok: true, itens, truncado };
  } catch (err) {
    registrarErro('lerLinhaDoTempo', { chamadoId }, err);
    return falha('erro');
  }
}
