/**
 * Script de migração para adicionar ticket_number aos chamados existentes
 * Execute este script uma vez para migrar os dados existentes
 */

import { dbConnect } from '../lib/db';
import { ChamadoModel } from '../models/Chamado';
import { generateTicketNumber } from '../lib/chamado-utils';

async function migrateTicketNumbers() {
  try {
    await dbConnect();
    console.log('Conectado ao banco de dados');

    // Busca todos os chamados sem ticket_number
    const chamadosSemTicket = await ChamadoModel.find({
      $or: [{ ticket_number: { $exists: false } }, { ticket_number: null }, { ticket_number: '' }],
    }).lean();

    console.log(`Encontrados ${chamadosSemTicket.length} chamados sem ticket_number`);

    for (const chamado of chamadosSemTicket) {
      try {
        // Gera um novo ticket_number
        const ticket_number = await generateTicketNumber();

        // Atualiza o chamado
        await ChamadoModel.updateOne({ _id: chamado._id }, { $set: { ticket_number } });

        console.log(`Chamado ${chamado._id} atualizado com ticket_number: ${ticket_number}`);
      } catch (error) {
        console.error(`Erro ao atualizar chamado ${chamado._id}:`, error);
      }
    }

    console.log('Migração concluída!');
    process.exit(0);
  } catch (error) {
    console.error('Erro na migração:', error);
    process.exit(1);
  }
}

migrateTicketNumbers();
