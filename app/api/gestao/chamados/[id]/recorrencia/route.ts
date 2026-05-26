import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { findChamadosRecorrentes } from '@/lib/recorrencia';
import { ChamadoModel } from '@/models/Chamado';

/**
 * GET /api/gestao/chamados/[id]/recorrencia
 * Lista chamados do mesmo defeito (unidade + tipo + subtipo) concluídos nos últimos 30 dias.
 * Sinalização informativa para a triagem. Apenas Admin ou Preposto.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const alvo = await ChamadoModel.findById(id)
    .select('unitId tipoServico subtypeId')
    .lean<{
      _id: Types.ObjectId;
      unitId?: Types.ObjectId;
      tipoServico?: string;
      subtypeId?: Types.ObjectId;
    }>();

  if (!alvo || !alvo.unitId || !alvo.tipoServico || !alvo.subtypeId) {
    return NextResponse.json({ items: [] });
  }

  const items = await findChamadosRecorrentes({
    _id: alvo._id,
    unitId: alvo.unitId,
    tipoServico: alvo.tipoServico,
    subtypeId: alvo.subtypeId,
  });

  return NextResponse.json({ items });
}
