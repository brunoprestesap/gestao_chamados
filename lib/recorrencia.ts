import { Types } from 'mongoose';

import { ChamadoModel } from '@/models/Chamado';

/** Status considerados "defeito resolvido" para fins de recorrência */
const CLOSED_STATUSES = ['concluído', 'encerrado'] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ChamadoRecorrenciaAlvo = {
  _id: Types.ObjectId | string;
  unitId: Types.ObjectId | string;
  tipoServico: string;
  subtypeId: Types.ObjectId | string;
};

export type RecorrenciaItem = {
  _id: string;
  ticket_number: string;
  titulo: string;
  status: string;
  concludedAt: string | null;
  diasDesdeConclusao: number | null;
};

type Options = {
  /** Janela de recorrência em dias (padrão 30) */
  dias?: number;
  /** Máximo de chamados retornados (padrão 5) */
  limite?: number;
  /** Momento de referência (padrão: agora) — facilita testes */
  agora?: Date;
};

/**
 * Busca chamados anteriores do MESMO defeito (mesma unidade + tipo + subtipo) que já
 * foram concluídos/encerrados dentro da janela de recorrência. Usado na triagem para
 * sinalizar (sem bloquear) que o defeito pode ser recorrente.
 */
export async function findChamadosRecorrentes(
  chamado: ChamadoRecorrenciaAlvo,
  { dias = 30, limite = 5, agora = new Date() }: Options = {},
): Promise<RecorrenciaItem[]> {
  if (!chamado.unitId || !chamado.tipoServico || !chamado.subtypeId) return [];

  const desde = new Date(agora.getTime() - dias * MS_PER_DAY);

  const docs = await ChamadoModel.find({
    _id: { $ne: chamado._id },
    unitId: chamado.unitId,
    tipoServico: chamado.tipoServico,
    subtypeId: chamado.subtypeId,
    status: { $in: CLOSED_STATUSES },
    concludedAt: { $gte: desde },
  })
    .sort({ concludedAt: -1 })
    .limit(limite)
    .select('ticket_number titulo status concludedAt')
    .lean();

  return docs.map((d) => {
    const concludedAt = d.concludedAt ? new Date(d.concludedAt as Date) : null;
    return {
      _id: String(d._id),
      ticket_number: (d.ticket_number as string) ?? '',
      titulo: (d.titulo as string) ?? '',
      status: (d.status as string) ?? '',
      concludedAt: concludedAt ? concludedAt.toISOString() : null,
      diasDesdeConclusao: concludedAt
        ? Math.floor((agora.getTime() - concludedAt.getTime()) / MS_PER_DAY)
        : null,
    };
  });
}
