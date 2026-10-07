import 'server-only';

import { Types } from 'mongoose';

import { ChamadoModel } from '@/models/Chamado';

/**
 * "Possível duplicado de #N" na gestão (spec 0017, AC-13). O chamado aberto
 * mesmo depois do aviso guarda só os ids dos parecidos; os números são lidos
 * na hora, uma consulta só por página. Id que não existe mais é omitido.
 *
 * Só a gestão chama isto: o campo nunca sai para solicitante nem técnico.
 */

export type AvisoDuplicadoGestao = { chamadoId: string; ticketNumber: string }[];

type ComAviso = { avisoDuplicado?: { chamadoIds?: unknown[] } | null };

function idsDoAviso(item: ComAviso): string[] {
  return (item.avisoDuplicado?.chamadoIds ?? [])
    .map(String)
    .filter((id) => Types.ObjectId.isValid(id));
}

export async function numerosDosAvisosDuplicado(
  itens: readonly ComAviso[],
): Promise<Map<string, string>> {
  const ids = [...new Set(itens.flatMap(idsDoAviso))];
  const numeros = new Map<string, string>();
  if (ids.length === 0) return numeros;
  const chamados = await ChamadoModel.find({ _id: { $in: ids } })
    .select('ticket_number')
    .lean<{ _id: Types.ObjectId; ticket_number: string }[]>();
  for (const c of chamados) numeros.set(String(c._id), c.ticket_number);
  return numeros;
}

/** Os parecidos que ainda existem, na ordem do cartão; `null` sem nenhum. */
export function avisoDuplicadoParaGestao(
  item: ComAviso,
  numeros: Map<string, string>,
): AvisoDuplicadoGestao | null {
  const lista = idsDoAviso(item).flatMap((chamadoId) => {
    const ticketNumber = numeros.get(chamadoId);
    return ticketNumber ? [{ chamadoId, ticketNumber }] : [];
  });
  return lista.length > 0 ? lista : null;
}
