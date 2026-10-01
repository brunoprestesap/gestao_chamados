import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import type { ResumoAtivoChamado } from '@/shared/ativos/seletor.types';

/**
 * Código e descrição dos ativos de uma lista de chamados, numa consulta só,
 * para o DTO do chamado (`ativo: { id, codigo, descricao } | null`, spec 0011).
 */
export async function resumosDosAtivos(
  chamados: { ativoId?: unknown }[],
): Promise<Map<string, ResumoAtivoChamado>> {
  const ids = [
    ...new Set(
      chamados
        .map((c) => (c.ativoId ? String(c.ativoId) : ''))
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  const ativos = await AtivoModel.find({ _id: { $in: ids } })
    .select('codigo descricao')
    .lean<{ _id: Types.ObjectId; codigo: string; descricao: string }[]>();
  return new Map(
    ativos.map((a) => [
      String(a._id),
      { id: String(a._id), codigo: a.codigo, descricao: a.descricao },
    ]),
  );
}

export function resumoDoChamado(
  chamado: { ativoId?: unknown },
  mapa: Map<string, ResumoAtivoChamado>,
): ResumoAtivoChamado | null {
  return chamado.ativoId ? (mapa.get(String(chamado.ativoId)) ?? null) : null;
}
