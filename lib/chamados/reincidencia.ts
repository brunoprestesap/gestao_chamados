import 'server-only';

import { Types } from 'mongoose';

import { ChamadoModel } from '@/models/Chamado';

/**
 * O `ticket_number` de cada chamado anterior (spec 0010, AC-12), numa consulta
 * só por página. Quem chama já conferiu que pode ver o chamado novo; o número
 * do anterior é do mesmo solicitante, então não vaza dado de terceiro.
 */
export async function numerosDosChamadosAnteriores(
  itens: { chamadoAnteriorId?: unknown }[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      itens.flatMap((c) =>
        c.chamadoAnteriorId && Types.ObjectId.isValid(String(c.chamadoAnteriorId))
          ? [String(c.chamadoAnteriorId)]
          : [],
      ),
    ),
  ];
  const numeros = new Map<string, string>();
  if (ids.length === 0) return numeros;
  const anteriores = await ChamadoModel.find({ _id: { $in: ids } })
    .select('ticket_number')
    .lean();
  for (const a of anteriores) numeros.set(String(a._id), a.ticket_number);
  return numeros;
}
