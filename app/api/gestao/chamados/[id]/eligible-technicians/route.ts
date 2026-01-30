import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { UserModel } from '@/models/user.model';

/**
 * Status considerados "ativos" para cálculo de carga do técnico
 */
const ACTIVE_STATUSES = ['emvalidacao', 'validado', 'em atendimento'] as const;

/**
 * GET /api/gestao/chamados/[id]/eligible-technicians
 * Lista técnicos elegíveis para atribuição de um chamado específico.
 * Retorna técnicos com a especialidade necessária e sua carga atual.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    await dbConnect();

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID de chamado inválido' }, { status: 400 });
    }

    // Busca o chamado para obter o catalogServiceId
    const chamado = await ChamadoModel.findById(id).lean();
    if (!chamado) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    if (chamado.status !== 'validado' && chamado.status !== 'emvalidacao') {
      return NextResponse.json(
        { error: 'Somente chamados com status "Validado" ou "Em validação" podem ser atribuídos' },
        { status: 400 },
      );
    }

    if (!chamado.catalogServiceId) {
      return NextResponse.json(
        { error: 'Chamado não possui serviço catalogado. Classifique o chamado primeiro.' },
        { status: 400 },
      );
    }

    // Especialidades do técnico são subtipos de serviço; obtém o subtypeId do serviço catalogado
    const service = await ServiceCatalogModel.findById(chamado.catalogServiceId)
      .select('subtypeId')
      .lean();
    if (!service?.subtypeId) {
      return NextResponse.json(
        { error: 'Serviço catalogado do chamado não possui subtipo definido.' },
        { status: 400 },
      );
    }
    // Normaliza para ObjectId para garantir match na query (especialidades = array de subtypeId)
    const subtypeId = new Types.ObjectId(String(service.subtypeId));

    // Busca todos os técnicos ativos que possuem a especialidade (subtipo) exigida pelo chamado
    const tecnicos = await UserModel.find({
      role: 'Técnico',
      isActive: true,
      specialties: { $in: [subtypeId] },
    }).lean();

    // Conta chamados ativos por técnico usando aggregation
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

    // Cria mapa de carga
    const cargaMap = new Map<string, number>();
    cargaPorTecnico.forEach((item) => {
      cargaMap.set(String(item._id), item.count);
    });

    // Monta lista de técnicos elegíveis com carga
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

    // Ordena por menor carga (não sobrecarregados primeiro)
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
    console.error('Erro ao buscar técnicos elegíveis:', error);
    return NextResponse.json({ error: 'Erro ao buscar técnicos elegíveis' }, { status: 500 });
  }
}
