'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';

import { generateTicketNumber } from '@/lib/chamado-utils';
import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { toAttendanceNature } from '@/shared/chamados/chamado.constants';
import type { NewTicketFormValues } from '@/shared/chamados/new-ticket.schemas';
import {
  SubmitEvaluationSchema,
  type SubmitEvaluationInput,
} from '@/shared/chamados/evaluation.schemas';

/**
 * Gera um título automático para o chamado baseado nos dados do formulário.
 */
function generateTitulo(data: NewTicketFormValues): string {
  const partes: string[] = [data.tipoServico];
  if (data.localExato) {
    partes.push(`— ${data.localExato}`);
  }
  if (data.naturezaAtendimento === 'Urgente') {
    partes.push('[URGENTE]');
  }
  return partes.join(' ');
}

/**
 * Persiste um novo chamado no banco de dados.
 */
export async function createTicketAction(
  data: NewTicketFormValues,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    await dbConnect();

    // Gera título automático
    const titulo = generateTitulo(data);

    // Gera número único do ticket
    const ticket_number = await generateTicketNumber();

    if (!ticket_number || ticket_number.trim() === '') {
      throw new Error('Falha ao gerar número do ticket');
    }

    console.log('Gerando ticket_number:', ticket_number);

    // Prepara os dados do chamado (natureza SOLICITADA apenas informativa)
    const chamadoData = {
      ticket_number: ticket_number.trim(),
      titulo,
      descricao: data.descricao,
      unitId: new Types.ObjectId(data.unitId),
      localExato: data.localExato,
      tipoServico: data.tipoServico,
      naturezaAtendimento: data.naturezaAtendimento,
      requestedAttendanceNature: toAttendanceNature(data.naturezaAtendimento),
      grauUrgencia: data.grauUrgencia,
      telefoneContato: data.telefoneContato ?? '',
      subtypeId:
        data.subtypeId && data.subtypeId.trim() !== ''
          ? new Types.ObjectId(data.subtypeId)
          : undefined,
      catalogServiceId:
        data.catalogServiceId && data.catalogServiceId.trim() !== ''
          ? new Types.ObjectId(data.catalogServiceId)
          : undefined,
      status: 'aberto' as const,
      solicitanteId: new Types.ObjectId(session.userId),
    };

    console.log('Dados do chamado a serem criados:', {
      ...chamadoData,
      solicitanteId: String(chamadoData.solicitanteId),
      unitId: String(chamadoData.unitId),
    });

    // Cria o documento do chamado
    const doc = await ChamadoModel.create(chamadoData);

    // Validação de urgência: se for urgente, pode precisar de autorização
    // Por enquanto apenas criamos o chamado, validação pode ser implementada depois
    if (data.naturezaAtendimento === 'Urgente') {
      // TODO: Implementar validação/autorização por papel (Fiscal/Gestor)
      // Por enquanto apenas registramos o chamado como urgente
    }

    // Cria registro de histórico para auditoria
    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId: new Types.ObjectId(session.userId),
      action: 'abertura',
      statusAnterior: null,
      statusNovo: 'aberto',
      observacoes: `Chamado criado: ${titulo}`,
    });

    console.log('Chamado criado com sucesso:', {
      _id: doc._id,
      ticket_number: doc.ticket_number,
    });

    return { ok: true };
  } catch (error) {
    console.error('Erro ao criar chamado:', error);
    if (error instanceof Error) {
      console.error('Detalhes do erro:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Erro ao criar chamado. Tente novamente.',
    };
  }
}

export type SubmitEvaluationResult = { ok: true } | { ok: false; error: string };

/**
 * Registra avaliação do chamado pelo solicitante (criador).
 * Apenas chamados encerrados, ainda não avaliados; só o criador pode avaliar.
 */
export async function submitTicketEvaluationAction(
  raw: SubmitEvaluationInput,
): Promise<SubmitEvaluationResult> {
  try {
    const session = await requireSession();
    const parsed = SubmitEvaluationSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.ticketId?.[0] ?? first.rating?.[0] ?? first.comment?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId, rating, comment } = parsed.data;
    await dbConnect();

    const userId = new Types.ObjectId(session.userId);

    const updated = await ChamadoModel.findOneAndUpdate(
      {
        _id: ticketId,
        status: 'encerrado',
        solicitanteId: userId,
        'evaluation.rating': { $exists: false },
      },
      {
        $set: {
          evaluation: {
            rating,
            notes: (comment ?? '').trim() || '',
            createdAt: new Date(),
            createdByUserId: userId,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      const existing = await ChamadoModel.findById(ticketId).lean();
      if (!existing) return { ok: false, error: 'Chamado não encontrado.' };
      if (String(existing.solicitanteId) !== session.userId) {
        return { ok: false, error: 'Apenas o criador do chamado pode avaliar.' };
      }
      if (existing.status !== 'encerrado') {
        return {
          ok: false,
          error: 'Somente chamados com status "Encerrado" podem ser avaliados.',
        };
      }
      if (existing.evaluation?.rating != null) {
        return { ok: false, error: 'Este chamado já foi avaliado.' };
      }
      return { ok: false, error: 'Não foi possível registrar a avaliação. Tente novamente.' };
    }

    await ChamadoHistoryModel.create({
      chamadoId: updated._id,
      userId,
      action: 'avaliado',
      statusAnterior: 'encerrado',
      statusNovo: 'encerrado',
      observacoes: `Avaliação: ${rating}/5`,
    });

    revalidatePath('/meus-chamados');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return { ok: true };
  } catch (e) {
    console.error('submitTicketEvaluationAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao enviar avaliação. Tente novamente.',
    };
  }
}
