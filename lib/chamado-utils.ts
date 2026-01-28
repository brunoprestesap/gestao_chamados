import { dbConnect } from './db';
import { ChamadoModel } from '@/models/Chamado';

/**
 * Gera o próximo número de ticket no formato CHM-YYYY-NNNNN
 * Exemplo: CHM-2026-00001
 */
export async function generateTicketNumber(): Promise<string> {
  await dbConnect();

  const year = new Date().getFullYear();
  const prefix = `CHM-${year}-`;

  // Busca o último ticket_number do ano atual
  // Filtra apenas documentos que têm ticket_number definido
  const lastTicket = await ChamadoModel.findOne({
    ticket_number: { $exists: true, $regex: `^${prefix}` },
  })
    .sort({ ticket_number: -1 })
    .select('ticket_number')
    .lean();

  let nextNumber = 1;

  if (lastTicket?.ticket_number) {
    // Extrai o número do último ticket (ex: "CHM-2026-00001" -> 1)
    const match = lastTicket.ticket_number.match(/-(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  // Formata o número com 5 dígitos (ex: 00001)
  const formattedNumber = nextNumber.toString().padStart(5, '0');

  const ticketNumber = `${prefix}${formattedNumber}`;
  console.log('Ticket number gerado:', ticketNumber);

  return ticketNumber;
}
