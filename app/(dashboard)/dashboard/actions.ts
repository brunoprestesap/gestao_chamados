'use server';

import { Types } from 'mongoose';

import { requireManager, requireSession, requireTechnician } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { UserModel } from '@/models/user.model';

const STATUS_EM_ANDAMENTO = ['aberto', 'emvalidacao', 'em atendimento'] as const;

export type DashboardSolicitanteData = {
  emAndamento: number;
  avaliacoesPendentes: number;
  ultimosChamados: Array<{
    _id: string;
    ticket_number: string;
    titulo: string;
    status: string;
    createdAt: Date;
  }>;
  encerradosTotal: number;
  encerradosAvaliados: number;
};

/** Status ativos para carga do técnico (gestao) */
const ACTIVE_STATUSES = ['emvalidacao', 'validado', 'em atendimento'] as const;

export type DashboardPrepostoData = {
  aguardandoClassificacao: number;
  aguardandoAtribuicao: number;
  emAtendimento: number;
  aguardandoEncerramento: number;
  encerradosHoje: number;
  encerradosSemana: number;
  sobrecargaTecnicos: number;
  reatribuicoesHoje: number;
  reatribuicoesSemana: number;
  resumoGeral: {
    emvalidacao: number;
    'em atendimento': number;
    concluído: number;
    encerrado: number;
  };
  /** Soma de atendimentos realizados (chamados concluídos/encerrados) por técnico */
  atendimentosPorTecnico: Array<{ tecnicoId: string; nome: string; total: number }>;
};

/**
 * Retorna início do dia (00:00:00) em horário local do servidor.
 */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Retorna início da semana (domingo 00:00:00) em horário local do servidor.
 */
function startOfWeek(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * Busca dados do dashboard do perfil Preposto.
 * Dados globais (não filtrados por criador). Acesso validado por requireManager().
 */
export async function getDashboardPrepostoData(): Promise<DashboardPrepostoData | null> {
  await requireManager();
  await dbConnect();

  const todayStart = startOfToday();
  const weekStart = startOfWeek();

  const [facetResult] = await ChamadoModel.aggregate<{
    aguardandoClassificacao: [{ total: number }];
    aguardandoAtribuicao: [{ total: number }];
    emAtendimento: [{ total: number }];
    aguardandoEncerramento: [{ total: number }];
    encerradosHoje: [{ total: number }];
    encerradosSemana: [{ total: number }];
    reatribuicoesHoje: [{ total: number }];
    reatribuicoesSemana: [{ total: number }];
    resumoGeral: Array<{ _id: string; count: number }>;
  }>([
    {
      $facet: {
        aguardandoClassificacao: [{ $match: { status: 'aberto' } }, { $count: 'total' }],
        aguardandoAtribuicao: [
          {
            $match: {
              status: { $in: ['validado', 'emvalidacao'] },
              $or: [{ assignedToUserId: null }, { assignedToUserId: { $exists: false } }],
            },
          },
          { $count: 'total' },
        ],
        emAtendimento: [{ $match: { status: 'em atendimento' } }, { $count: 'total' }],
        aguardandoEncerramento: [{ $match: { status: 'concluído' } }, { $count: 'total' }],
        encerradosHoje: [
          {
            $match: {
              status: 'encerrado',
              closedAt: { $gte: todayStart, $ne: null },
            },
          },
          { $count: 'total' },
        ],
        encerradosSemana: [
          {
            $match: {
              status: 'encerrado',
              closedAt: { $gte: weekStart, $ne: null },
            },
          },
          { $count: 'total' },
        ],
        reatribuicoesHoje: [
          {
            $match: {
              reassignedAt: { $gte: todayStart, $ne: null },
            },
          },
          { $count: 'total' },
        ],
        reatribuicoesSemana: [
          {
            $match: {
              reassignedAt: { $gte: weekStart, $ne: null },
            },
          },
          { $count: 'total' },
        ],
        resumoGeral: [
          {
            $match: {
              status: { $in: ['emvalidacao', 'em atendimento', 'concluído', 'encerrado'] },
            },
          },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const resumoMap = new Map<string, number>();
  (facetResult?.resumoGeral ?? []).forEach((r) => resumoMap.set(r._id, r.count));

  // Técnicos ativos (com nome para atendimentosPorTecnico)
  const tecnicos = await UserModel.find(
    { role: 'Técnico', isActive: true },
    { _id: 1, name: 1, maxAssignedTickets: 1 },
  ).lean();
  const ids = tecnicos.map((t) => t._id);

  // Atendimentos realizados por técnico (chamados concluídos ou encerrados atribuídos ao técnico)
  const atendimentosAgg =
    ids.length > 0
      ? await ChamadoModel.aggregate<{ _id: Types.ObjectId; total: number }>([
          {
            $match: {
              assignedToUserId: { $in: ids },
              status: { $in: ['concluído', 'encerrado'] },
            },
          },
          { $group: { _id: '$assignedToUserId', total: { $sum: 1 } } },
        ])
      : [];
  const atendimentosMap = new Map<string, number>();
  atendimentosAgg.forEach((r) => atendimentosMap.set(String(r._id), r.total));
  const atendimentosPorTecnico = tecnicos.map((t) => ({
    tecnicoId: String(t._id),
    nome: (t.name as string) ?? '—',
    total: atendimentosMap.get(String(t._id)) ?? 0,
  }));

  const cargaAgg =
    ids.length > 0
      ? await ChamadoModel.aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              assignedToUserId: { $in: ids },
              status: { $in: [...ACTIVE_STATUSES] },
            },
          },
          { $group: { _id: '$assignedToUserId', count: { $sum: 1 } } },
        ])
      : [];
  const cargaMap = new Map<string, number>();
  cargaAgg.forEach((r) => cargaMap.set(String(r._id), r.count));

  let sobrecargaTecnicos = 0;
  tecnicos.forEach((t) => {
    const load = cargaMap.get(String(t._id)) ?? 0;
    const max = t.maxAssignedTickets ?? 5;
    if (load >= max) sobrecargaTecnicos += 1;
  });

  return {
    aguardandoClassificacao: facetResult?.aguardandoClassificacao?.[0]?.total ?? 0,
    aguardandoAtribuicao: facetResult?.aguardandoAtribuicao?.[0]?.total ?? 0,
    emAtendimento: facetResult?.emAtendimento?.[0]?.total ?? 0,
    aguardandoEncerramento: facetResult?.aguardandoEncerramento?.[0]?.total ?? 0,
    encerradosHoje: facetResult?.encerradosHoje?.[0]?.total ?? 0,
    encerradosSemana: facetResult?.encerradosSemana?.[0]?.total ?? 0,
    sobrecargaTecnicos,
    reatribuicoesHoje: facetResult?.reatribuicoesHoje?.[0]?.total ?? 0,
    reatribuicoesSemana: facetResult?.reatribuicoesSemana?.[0]?.total ?? 0,
    resumoGeral: {
      emvalidacao: resumoMap.get('emvalidacao') ?? 0,
      'em atendimento': resumoMap.get('em atendimento') ?? 0,
      concluído: resumoMap.get('concluído') ?? 0,
      encerrado: resumoMap.get('encerrado') ?? 0,
    },
    atendimentosPorTecnico,
  };
}

/**
 * Busca dados do dashboard do perfil Solicitante.
 * Filtra todos os dados por solicitanteId == session.user.id.
 */
export async function getDashboardSolicitanteData(): Promise<DashboardSolicitanteData | null> {
  const session = await requireSession();
  await dbConnect();

  const userId = new Types.ObjectId(session.userId);

  const [result] = await ChamadoModel.aggregate<{
    emAndamento: [{ total: number }];
    avaliacoesPendentes: [{ total: number }];
    ultimosChamados: Array<{
      _id: Types.ObjectId;
      ticket_number: string;
      titulo: string;
      status: string;
      createdAt: Date;
    }>;
    encerradosTotal: [{ total: number }];
    encerradosAvaliados: [{ total: number }];
  }>([
    { $match: { solicitanteId: userId } },
    {
      $facet: {
        emAndamento: [
          { $match: { status: { $in: [...STATUS_EM_ANDAMENTO] } } },
          { $count: 'total' },
        ],
        avaliacoesPendentes: [
          {
            $match: {
              status: 'encerrado',
              $nor: [{ 'evaluation.rating': { $gte: 1, $lte: 5 } }],
            },
          },
          { $count: 'total' },
        ],
        ultimosChamados: [
          { $sort: { createdAt: -1 } },
          { $limit: 3 },
          { $project: { ticket_number: 1, titulo: 1, status: 1, createdAt: 1 } },
        ],
        encerradosTotal: [{ $match: { status: 'encerrado' } }, { $count: 'total' }],
        encerradosAvaliados: [
          {
            $match: {
              status: 'encerrado',
              'evaluation.rating': { $gte: 1, $lte: 5 },
            },
          },
          { $count: 'total' },
        ],
      },
    },
  ]);

  if (!result) {
    return {
      emAndamento: 0,
      avaliacoesPendentes: 0,
      ultimosChamados: [],
      encerradosTotal: 0,
      encerradosAvaliados: 0,
    };
  }

  return {
    emAndamento: result.emAndamento[0]?.total ?? 0,
    avaliacoesPendentes: result.avaliacoesPendentes[0]?.total ?? 0,
    ultimosChamados: (result.ultimosChamados ?? []).map((c) => ({
      _id: String(c._id),
      ticket_number: c.ticket_number ?? '',
      titulo: c.titulo ?? '',
      status: c.status ?? '',
      createdAt: c.createdAt,
    })),
    encerradosTotal: result.encerradosTotal[0]?.total ?? 0,
    encerradosAvaliados: result.encerradosAvaliados[0]?.total ?? 0,
  };
}

/** Status ativos para carga do técnico (igual ao da gestão) */
const ACTIVE_STATUSES_TECNICO = ['emvalidacao', 'validado', 'em atendimento'] as const;

export type DashboardTecnicoData = {
  /** Chamados ativos atribuídos (para carga vs capacidade) */
  cargaAtiva: number;
  maxAssignedTickets: number;
  /** Status "em atendimento" */
  emAtendimento: number;
  /** Prontos para registrar execução (status em atendimento) */
  prontosParaConcluir: number;
  /** Concluídos aguardando encerramento */
  concluidosAguardandoEncerramento: number;
  /** Especialidades do técnico (code, name, contagem de chamados ativos) */
  especialidades: Array<{ _id: string; code: string; name: string; chamadosAtivos: number }>;
  /** Últimos 3 chamados atribuídos */
  ultimosChamados: Array<{
    _id: string;
    ticket_number: string;
    titulo: string;
    status: string;
  }>;
};

/**
 * Busca dados do dashboard do perfil Técnico.
 * Apenas chamados com assignedToUserId == session.userId. Acesso validado por requireTechnician().
 */
export async function getDashboardTecnicoData(): Promise<DashboardTecnicoData | null> {
  const session = await requireTechnician();
  await dbConnect();

  const userId = new Types.ObjectId(session.userId);

  const [facetResult] = await ChamadoModel.aggregate<{
    cargaAtiva: [{ total: number }];
    emAtendimento: [{ total: number }];
    concluidosAguardando: [{ total: number }];
    chamadosPorCatalogo: Array<{ _id: Types.ObjectId | null; count: number }>;
    ultimosChamados: Array<{
      _id: Types.ObjectId;
      ticket_number: string;
      titulo: string;
      status: string;
    }>;
  }>([
    { $match: { assignedToUserId: userId } },
    {
      $facet: {
        cargaAtiva: [
          { $match: { status: { $in: [...ACTIVE_STATUSES_TECNICO] } } },
          { $count: 'total' },
        ],
        emAtendimento: [{ $match: { status: 'em atendimento' } }, { $count: 'total' }],
        concluidosAguardando: [{ $match: { status: 'concluído' } }, { $count: 'total' }],
        chamadosPorCatalogo: [
          {
            $match: {
              status: { $in: [...ACTIVE_STATUSES_TECNICO] },
              catalogServiceId: { $exists: true, $ne: null },
            },
          },
          { $group: { _id: '$catalogServiceId', count: { $sum: 1 } } },
        ],
        ultimosChamados: [
          { $sort: { assignedAt: -1, updatedAt: -1 } },
          { $limit: 3 },
          { $project: { ticket_number: 1, titulo: 1, status: 1 } },
        ],
      },
    },
  ]);

  const tecnico = await UserModel.findById(userId).select('maxAssignedTickets specialties').lean();
  const maxAssignedTickets = tecnico?.maxAssignedTickets ?? 5;
  const specialtyIds = (tecnico?.specialties ?? []) as Types.ObjectId[];

  const chamadosPorCatalogoMap = new Map<string, number>();
  (facetResult?.chamadosPorCatalogo ?? []).forEach((r) => {
    if (r._id) chamadosPorCatalogoMap.set(String(r._id), r.count);
  });

  let especialidades: Array<{ _id: string; code: string; name: string; chamadosAtivos: number }> =
    [];
  if (specialtyIds.length > 0) {
    const catalogs = await ServiceCatalogModel.find(
      { _id: { $in: specialtyIds } },
      { code: 1, name: 1 },
    ).lean();
    especialidades = catalogs.map((c) => ({
      _id: String(c._id),
      code: c.code,
      name: c.name,
      chamadosAtivos: chamadosPorCatalogoMap.get(String(c._id)) ?? 0,
    }));
  }

  const cargaAtiva = facetResult?.cargaAtiva?.[0]?.total ?? 0;
  const emAtendimento = facetResult?.emAtendimento?.[0]?.total ?? 0;
  const concluidosAguardando = facetResult?.concluidosAguardando?.[0]?.total ?? 0;

  return {
    cargaAtiva,
    maxAssignedTickets,
    emAtendimento,
    prontosParaConcluir: emAtendimento,
    concluidosAguardandoEncerramento: concluidosAguardando,
    especialidades,
    ultimosChamados: (facetResult?.ultimosChamados ?? []).map((c) => ({
      _id: String(c._id),
      ticket_number: c.ticket_number ?? '',
      titulo: c.titulo ?? '',
      status: c.status ?? '',
    })),
  };
}
