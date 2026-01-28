'use server';

import { Types } from 'mongoose';

import { generateTicketNumber } from '@/lib/chamado-utils';
import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
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

    // Gera número único do ticket
    const ticket_number = await generateTicketNumber();

    if (!ticket_number || ticket_number.trim() === '') {
      throw new Error('Falha ao gerar número do ticket');
    }

    console.log('Gerando ticket_number:', ticket_number);

    // Prepara os dados do chamado
    const chamadoData = {
      ticket_number: ticket_number.trim(),
      titulo,
      descricao: data.descricao,
      unitId: new Types.ObjectId(data.unitId),
      localExato: data.localExato,
      tipoServico: data.tipoServico,
      naturezaAtendimento: data.naturezaAtendimento,
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
