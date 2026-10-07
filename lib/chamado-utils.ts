import { ehChaveDuplicada } from '@/lib/ativos/erros';
import { ChamadoModel } from '@/models/Chamado';
import { ContadorModel } from '@/models/Contador';

import { dbConnect } from './db';

/**
 * Gera o próximo número de ticket no formato CHM-YYYY-NNNNN
 * Exemplo: CHM-2026-00001
 *
 * A sequência vem de um `Contador` por ano (`chamado_<ano>`), incrementado com
 * `$inc`, que é atômico: duas aberturas ao mesmo tempo, ou o lote da preventiva
 * por categoria, nunca recebem o mesmo número.
 */
export async function generateTicketNumber(): Promise<string> {
  await dbConnect();

  const year = new Date().getFullYear();
  const prefix = `CHM-${year}-`;
  const chave = `chamado_${year}`;

  const incrementar = () =>
    ContadorModel.findOneAndUpdate(
      { _id: chave },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' },
    ).lean<{ seq: number }>();

  let doc = await incrementar();
  if (!doc) {
    // Primeiro número do ano neste banco: o contador parte do maior número já
    // gravado, para continuar a sequência dos chamados criados antes dele.
    await semearContador(chave, prefix);
    doc = await incrementar();
  }
  if (!doc) throw new Error('Contador de número de chamado indisponível.');

  // Formata o número com 5 dígitos (ex: 00001)
  return `${prefix}${doc.seq.toString().padStart(5, '0')}`;
}

/**
 * Cria o contador do ano com o maior número existente. Se duas gerações semearem
 * ao mesmo tempo, só a primeira grava (E11000 no `_id`); a outra segue e incrementa.
 */
async function semearContador(chave: string, prefix: string): Promise<void> {
  const lastTicket = await ChamadoModel.findOne({
    ticket_number: { $exists: true, $regex: `^${prefix}` },
  })
    .sort({ ticket_number: -1 })
    .select('ticket_number')
    .lean();

  // Extrai o número do último ticket (ex: "CHM-2026-00001" -> 1)
  const match = lastTicket?.ticket_number?.match(/-(\d+)$/);
  const seq = match ? parseInt(match[1], 10) : 0;

  try {
    await ContadorModel.create({ _id: chave, seq });
  } catch (e) {
    if (!ehChaveDuplicada(e)) throw e;
  }
}
