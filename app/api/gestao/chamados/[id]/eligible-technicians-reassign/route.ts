import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { UserModel } from '@/models/user.model';

/**
 * Status considerados "ativos" para cálculo de carga do técnico
 */
const ACTIVE_STATUSES = ['emvalidacao', 'validado', 'em atendimento'] as const;

/**
 * GET /api/gestao/chamados/[id]/eligible-technicians-reassign
 * Lista técnicos elegíveis para REATRIBUIÇÃO (chamado já em atendimento).
 * Exclui o técnico atualmente atribuído. Retorna carga atual e max.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    await dbConnect();

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID de chamado inválido' }, { status: 400 });
    }

    const chamado = await ChamadoModel.findById(id).lean();
    if (!chamado) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    if (chamado.status !== 'em atendimento') {
      return NextResponse.json(
        { error: 'Somente chamados com status "Em atendimento" podem ser reatribuídos.' },
        { status: 400 },
      );
    }

    if (!chamado.catalogServiceId) {
      return NextResponse.json(
        { error: 'Chamado não possui serviço catalogado.' },
        { status: 400 },
      );
    }

    const currentAssignedId = chamado.assignedToUserId
      ? new Types.ObjectId(chamado.assignedToUserId)
      : null;
    if (!currentAssignedId) {
      return NextResponse.json(
        { error: 'Chamado não está atribuído a um técnico.' },
        { status: 400 },
      );
    }

    const serviceCatalogId = chamado.catalogServiceId;

    // Técnicos com a especialidade, EXCLUINDO o atual
    const tecnicos = await UserModel.find({
      role: 'Técnico',
      isActive: true,
      specialties: { $in: [serviceCatalogId] },
      _id: { $ne: currentAssignedId },
    }).lean();

    const cargaPorTecnico = await ChamadoModel.aggregate([
      {
        $match: {
          assignedToUserId: { $in: tecnicos.map((t) => t._id) },
          status: { $in: [...ACTIVE_STATUSES] },
        },
      },
      {
        $group: {
          _id: '$assignedToUserId',
          count: { $sum: 1 },
        },
      },
    ]);

    const cargaMap = new Map<string, number>();
    cargaPorTecnico.forEach((item) => {
      cargaMap.set(String(item._id), item.count);
    });

    const elegiveis = tecnicos.map((t) => {
      const tecnicoId = String(t._id);
      const currentLoad = cargaMap.get(tecnicoId) ?? 0;
      const maxAssignedTickets = t.maxAssignedTickets ?? 5;
      const isOverloaded = currentLoad >= maxAssignedTickets;

      return {
        _id: tecnicoId,
        name: t.name,
        username: t.username,
        currentLoad,
        maxAssignedTickets,
        isOverloaded,
      };
    });

    elegiveis.sort((a, b) => {
      if (a.isOverloaded !== b.isOverloaded) {
        return a.isOverloaded ? 1 : -1;
      }
      if (a.currentLoad !== b.currentLoad) {
        return a.currentLoad - b.currentLoad;
      }
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ items: elegiveis });
  } catch (error) {
    console.error('Erro ao buscar técnicos para reatribuição:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar técnicos para reatribuição' },
      { status: 500 },
    );
  }
}
