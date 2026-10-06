import 'server-only';

import { Types } from 'mongoose';

import { podeVerDocumentos } from '@/lib/ativos/documentos/permissao';
import { type IndicadoresDaFicha, indicadoresDoAtivo } from '@/lib/ativos/indicadores';
import { canManage, type SessionLike } from '@/lib/dal';
import { AtivoModel } from '@/models/Ativo';
import { AtivoHistoryModel } from '@/models/AtivoHistory';
import { CampanhaVistoriaModel } from '@/models/CampanhaVistoria';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ChamadoModel } from '@/models/Chamado';
import { ConferenciaVistoriaModel } from '@/models/ConferenciaVistoria';
import { LocalizacaoModel } from '@/models/Localizacao';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { UserModel } from '@/models/user.model';
import type {
  AtivoHistoryAcao,
  AtivoHistoryActorType,
  AtivoStatus,
  Criticidade,
  OrigemCodigo,
  StatusCadastro,
  TierManutencao,
} from '@/shared/ativos/ativo.constants';
import { CHAMADO_STATUS_LABELS, type ChamadoStatus } from '@/shared/chamados/chamado.constants';
import type { PapelAutor } from '@/shared/vistoria/vistoria.constants';

/** Quantos chamados vinculados a ficha mostra (os mais recentes). */
export const LIMITE_CHAMADOS_FICHA = 50;

/** Quantos registros da linha do tempo do cadastro a ficha mostra (os mais recentes). */
export const LIMITE_HISTORICO_FICHA = 100;

export type CamposPatrimoniaisFicha = {
  lotacao?: string;
  setor?: string;
  responsavelMatricula?: string;
  responsavelNome?: string;
  dataTombo?: string;
  garantiaInicio?: string;
  garantiaFim?: string;
  valorHistorico?: number;
  codigoMaterial?: string;
  fornecedor?: string;
  numeroSerie?: string;
  importadoEm?: string;
  /** Marca do importador (spec 0012, AC-26): o ativo saiu do export do SICAM. */
  ausenteNoSicamDesde?: string;
};

export type ChamadoDaFicha = {
  id: string;
  numero: string;
  status: ChamadoStatus;
  statusLabel: string;
  servico: string;
  abertoEm: string;
  encerradoEm: string | null;
  /** Só gestão recebe; solicitante e técnico não veem descrição nem solicitante. */
  descricao?: string;
  solicitanteNome?: string;
  /** Ausente quando a pessoa não pode abrir o chamado (AC-13). */
  href?: string;
};

export type EntradaHistoricoAtivo = {
  id: string;
  acao: AtivoHistoryAcao;
  autor: string;
  de: string | null;
  para: string | null;
  observacao: string | null;
  em: string;
};

/** A última conferência da vistoria (spec 0012), vista pelos quatro perfis. */
export type UltimaConferenciaFicha = {
  campanha: string;
  autorNome: string;
  papelAutor: PapelAutor;
  /** Hora do aparelho de quem conferiu. */
  conferidoEm: string;
};

export type FichaAtivo = {
  id: string;
  codigo: string;
  origemCodigo: OrigemCodigo;
  tombamento: string | null;
  descricao: string;
  categoria: { id: string; nome: string };
  local: { id: string; caminho: string } | null;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  dataInstalacao: string | null;
  criticidade: Criticidade;
  tierManutencao: TierManutencao;
  status: AtivoStatus;
  statusCadastro: StatusCadastro;
  validadoPorNome: string | null;
  validadoEm: string | null;
  /** O bloco nunca chega ao cliente para Solicitante e Técnico (LGPD). */
  camposPatrimoniais?: CamposPatrimoniaisFicha;
  ultimaConferencia: UltimaConferenciaFicha | null;
  historico: EntradaHistoricoAtivo[];
  chamados: ChamadoDaFicha[];
  /**
   * Corretivos em 12 meses, MTBF, MTTR e corretivos em 90 dias (spec 0014,
   * AC-20). Só para Admin, Preposto e Técnico; para o Solicitante o servidor
   * nem calcula. `null` quando a leitura falhou.
   */
  indicadores?: IndicadoresDaFicha | null;
};

type AtivoLean = {
  _id: Types.ObjectId;
  codigo: string;
  origemCodigo: OrigemCodigo;
  tombamento?: string | null;
  descricao: string;
  categoriaId: Types.ObjectId;
  localizacaoId?: Types.ObjectId | null;
  fabricante?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;
  dataInstalacao?: Date | null;
  criticidade: Criticidade;
  tierManutencao: TierManutencao;
  status: AtivoStatus;
  statusCadastro: StatusCadastro;
  validadoPor?: Types.ObjectId | null;
  validadoEm?: Date | null;
  camposPatrimoniais?: Record<string, unknown> | null;
};

type ChamadoLean = {
  _id: Types.ObjectId;
  ticket_number: string;
  status: ChamadoStatus;
  tipoServico?: string;
  catalogServiceId?: Types.ObjectId | null;
  createdAt: Date;
  closedAt?: Date | null;
  descricao?: string;
  solicitanteId?: Types.ObjectId;
  assignedToUserId?: Types.ObjectId | null;
};

function iso(d: unknown): string | undefined {
  return d instanceof Date ? d.toISOString() : undefined;
}

function serializarPatrimoniais(c: Record<string, unknown>): CamposPatrimoniaisFicha {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out as CamposPatrimoniaisFicha;
}

/**
 * Link e destino do chamado na ficha (AC-13): gestão sempre vai para
 * `/meus-chamados/[id]`; o técnico atribuído vai para
 * `/chamados-atribuidos/[id]`; o solicitante, para `/meus-chamados/[id]`;
 * qualquer outra pessoa vê o chamado sem link.
 */
export function destinoDoChamado(
  chamado: { id: string; solicitanteId?: string | null; assignedToUserId?: string | null },
  sessao: { userId: string; gestao: boolean },
): string | undefined {
  if (sessao.gestao) return `/meus-chamados/${chamado.id}`;
  if (chamado.assignedToUserId && chamado.assignedToUserId === sessao.userId) {
    return `/chamados-atribuidos/${chamado.id}`;
  }
  if (chamado.solicitanteId && chamado.solicitanteId === sessao.userId) {
    return `/meus-chamados/${chamado.id}`;
  }
  return undefined;
}

/** A ficha pronta para o cliente, já recortada pelo perfil da sessão; `null` se não existe. */
export async function carregarFicha(id: string, sessao: SessionLike): Promise<FichaAtivo | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const ativo = await AtivoModel.findById(id).lean<AtivoLean>();
  if (!ativo) return null;

  const gestao = canManage(sessao.role);
  const veIndicadores = podeVerDocumentos(sessao.role);

  const [categoria, local, historicoDocs, chamadosDocs, conferencia, indicadores] =
    await Promise.all([
      CategoriaAtivoModel.findById(ativo.categoriaId).select('nome').lean(),
      ativo.localizacaoId
        ? LocalizacaoModel.findById(ativo.localizacaoId).select('caminho').lean()
        : Promise.resolve(null),
      AtivoHistoryModel.find({ ativoId: ativo._id })
        .sort({ createdAt: -1 })
        .limit(LIMITE_HISTORICO_FICHA)
        .lean(),
      ChamadoModel.find({ ativoId: ativo._id })
        .sort({ createdAt: -1 })
        .limit(LIMITE_CHAMADOS_FICHA)
        .select(
          'ticket_number status tipoServico catalogServiceId createdAt closedAt descricao solicitanteId assignedToUserId',
        )
        .lean<ChamadoLean[]>(),
      ConferenciaVistoriaModel.findOne({ ativoId: ativo._id })
        .sort({ conferidoEm: -1 })
        .select('campanhaId autorId papelAutor conferidoEm')
        .lean<{
          campanhaId: Types.ObjectId;
          autorId: Types.ObjectId;
          papelAutor: PapelAutor;
          conferidoEm: Date;
        }>(),
      veIndicadores
        ? indicadoresDoAtivo(String(ativo._id)).catch((err: unknown) => {
            console.error(
              '[ativos]',
              JSON.stringify({
                operacao: 'indicadoresDoAtivo',
                ativoId: String(ativo._id),
                error: err instanceof Error ? err.message : 'unknown',
              }),
            );
            return null;
          })
        : Promise.resolve(undefined),
    ]);
  const campanha = conferencia
    ? await CampanhaVistoriaModel.findById(conferencia.campanhaId)
        .select('nome')
        .lean<{ nome: string }>()
    : null;

  const userIds = new Set<string>();
  if (ativo.validadoPor) userIds.add(String(ativo.validadoPor));
  if (conferencia) userIds.add(String(conferencia.autorId));
  for (const h of historicoDocs) if (h.autorId) userIds.add(String(h.autorId));
  if (gestao)
    for (const c of chamadosDocs) if (c.solicitanteId) userIds.add(String(c.solicitanteId));
  const catalogIds = [
    ...new Set(
      chamadosDocs
        .map((c) => c.catalogServiceId)
        .filter(Boolean)
        .map(String),
    ),
  ];

  const [usuarios, servicos] = await Promise.all([
    userIds.size
      ? UserModel.find({ _id: { $in: [...userIds] } })
          .select('name')
          .lean()
      : Promise.resolve([]),
    catalogIds.length
      ? ServiceCatalogModel.find({ _id: { $in: catalogIds } })
          .select('name')
          .lean()
      : Promise.resolve([]),
  ]);
  const nomeUsuario = new Map(usuarios.map((u) => [String(u._id), String(u.name ?? '')]));
  const nomeServico = new Map(servicos.map((s) => [String(s._id), String(s.name)]));

  const chamados: ChamadoDaFicha[] = chamadosDocs.map((c) => {
    const cid = String(c._id);
    const href = destinoDoChamado(
      {
        id: cid,
        solicitanteId: c.solicitanteId ? String(c.solicitanteId) : null,
        assignedToUserId: c.assignedToUserId ? String(c.assignedToUserId) : null,
      },
      { userId: sessao.userId, gestao },
    );
    return {
      id: cid,
      numero: c.ticket_number,
      status: c.status,
      statusLabel: CHAMADO_STATUS_LABELS[c.status] ?? c.status,
      servico:
        (c.catalogServiceId && nomeServico.get(String(c.catalogServiceId))) || c.tipoServico || '—',
      abertoEm: c.createdAt.toISOString(),
      encerradoEm: iso(c.closedAt) ?? null,
      ...(gestao && {
        descricao: c.descricao ?? '',
        solicitanteNome: c.solicitanteId ? nomeUsuario.get(String(c.solicitanteId)) : undefined,
      }),
      ...(href && { href }),
    };
  });

  const historico: EntradaHistoricoAtivo[] = historicoDocs.map((h) => ({
    id: String(h._id),
    acao: h.acao as AtivoHistoryAcao,
    autor:
      (h.actorType as AtivoHistoryActorType) === 'sistema' || !h.autorId
        ? 'Sistema'
        : nomeUsuario.get(String(h.autorId)) || 'Usuário removido',
    de: h.de ?? null,
    para: h.para ?? null,
    observacao: h.observacao ?? null,
    em: (h.createdAt as Date).toISOString(),
  }));

  return {
    id: String(ativo._id),
    codigo: ativo.codigo,
    origemCodigo: ativo.origemCodigo,
    tombamento: ativo.tombamento ?? null,
    descricao: ativo.descricao,
    categoria: { id: String(ativo.categoriaId), nome: categoria?.nome ?? '—' },
    local: local ? { id: String(local._id), caminho: local.caminho } : null,
    fabricante: ativo.fabricante ?? null,
    modelo: ativo.modelo ?? null,
    numeroSerie: ativo.numeroSerie ?? null,
    dataInstalacao: iso(ativo.dataInstalacao) ?? null,
    criticidade: ativo.criticidade,
    tierManutencao: ativo.tierManutencao,
    status: ativo.status,
    statusCadastro: ativo.statusCadastro,
    validadoPorNome: ativo.validadoPor
      ? (nomeUsuario.get(String(ativo.validadoPor)) ?? null)
      : null,
    validadoEm: iso(ativo.validadoEm) ?? null,
    ...(gestao &&
      ativo.camposPatrimoniais && {
        camposPatrimoniais: serializarPatrimoniais(ativo.camposPatrimoniais),
      }),
    ultimaConferencia: conferencia
      ? {
          campanha: campanha?.nome ?? '—',
          autorNome: nomeUsuario.get(String(conferencia.autorId)) || 'Usuário removido',
          papelAutor: conferencia.papelAutor,
          conferidoEm: conferencia.conferidoEm.toISOString(),
        }
      : null,
    historico,
    chamados,
    ...(veIndicadores && { indicadores: indicadores ?? null }),
  };
}
