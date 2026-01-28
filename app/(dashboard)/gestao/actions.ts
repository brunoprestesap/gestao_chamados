'use server';

import { Types } from 'mongoose';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import {
  ClassificarChamadoSchema,
  type ClassificarChamadoInput,
} from '@/shared/chamados/chamado.schemas';

export type ClassificarResult = { ok: true } | { ok: false; error: string };

export async function classificarChamadoAction(
  raw: ClassificarChamadoInput,
): Promise<ClassificarResult> {
  try {
    const session = await requireManager();
    const parsed = ClassificarChamadoSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.naturezaAtendimento?.[0] ??
        first.finalPriority?.[0] ??
        first.chamadoId?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { chamadoId, naturezaAtendimento, finalPriority, classificationNotes } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(chamadoId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };
    if (doc.status !== 'aberto') {
      return { ok: false, error: 'Somente chamados com status "aberto" podem ser classificados.' };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    await ChamadoModel.updateOne(
      { _id: chamadoId },
      {
        $set: {
          status: 'emvalidacao',
          naturezaAtendimento,
          finalPriority,
          classificationNotes: classificationNotes ?? '',
          classifiedByUserId: userId,
          classifiedAt: now,
        },
      },
    );

    const obsParts = [
      `Natureza: ${naturezaAtendimento}, Prioridade: ${finalPriority}`,
      'Status alterado para em validação.',
    ];
    if (classificationNotes) obsParts.push(`Observações: ${classificationNotes}`);
    const observacoes = obsParts.join(' ');
    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'classificacao',
      statusAnterior: 'aberto',
      statusNovo: 'emvalidacao',
      observacoes,
    });

    return { ok: true };
  } catch (e) {
    console.error('classificarChamadoAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao classificar chamado. Tente novamente.',
    };
  }
}
