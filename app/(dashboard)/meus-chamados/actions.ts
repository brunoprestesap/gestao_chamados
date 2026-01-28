'use server';

import { Types } from 'mongoose';

import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import type { NewTicketFormValues } from '@/shared/chamados/new-ticket.schemas';

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

    // Cria o documento do chamado
    const doc = await ChamadoModel.create({
      titulo,
      descricao: data.descricao,
      unitId: new Types.ObjectId(data.unitId),
      localExato: data.localExato,
      tipoServico: data.tipoServico,
      naturezaAtendimento: data.naturezaAtendimento,
      grauUrgencia: data.grauUrgencia,
      telefoneContato: data.telefoneContato ?? '',
      subtypeId: data.subtypeId ? new Types.ObjectId(data.subtypeId) : undefined,
      catalogServiceId: data.catalogServiceId
        ? new Types.ObjectId(data.catalogServiceId)
        : undefined,
      status: 'aberto',
      solicitanteId: new Types.ObjectId(session.userId),
    });

    // Validação de urgência: se for urgente, pode precisar de autorização
    // Por enquanto apenas criamos o chamado, validação pode ser implementada depois
    if (data.naturezaAtendimento === 'Urgente') {
      // TODO: Implementar validação/autorização por papel (Fiscal/Gestor)
      // Por enquanto apenas registramos o chamado como urgente
    }

    return { ok: true };
  } catch (error) {
    console.error('Erro ao criar chamado:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Erro ao criar chamado. Tente novamente.',
    };
  }
}
