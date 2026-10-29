import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { lerContrato } from '@/lib/contratos/relatorio';
import { dbConnect } from '@/lib/db';
import { lerMaterialConfig } from '@/lib/material/config';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import { ImrMarcacaoModel } from '@/models/ImrMarcacao';
import { UnitModel } from '@/models/unit';
import { UserModel } from '@/models/user.model';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';
import { mesesPermitidos } from '@/shared/contratos/janela';
import type { ContratoDoRelatorio } from '@/shared/contratos/relatorio.types';
import {
  DIAS_ANTES_DO_MES,
  DIAS_AUTORIZACAO_ESTIMADA,
  type PapelImr,
  type TipoMarcacao,
} from '@/shared/imr-contrato/imr-contrato.constants';
import type {
  ApuracaoMes,
  EstadoDoMes,
  LinhaI3,
  LinhaI4,
} from '@/shared/imr-contrato/imr-contrato.types';
import type { SituacaoCotacao } from '@/shared/material/material.constants';

import {
  apurarComBase,
  type ChamadoLidoI3,
  type CotacaoLidaI4,
  type MarcacaoLida,
} from './apuracao';
import { lerCalendarioImr } from './calendario';
import { lerEstadoDoMes } from './estado';
import { type CalendarioImr, limitesDoMesEmBelem } from './prazo';

const DIA_MS = 24 * 60 * 60 * 1000;

type DocChamado = {
  _id: Types.ObjectId;
  ticket_number: string;
  titulo?: string | null;
  status: ChamadoStatus;
  solicitanteId?: Types.ObjectId | null;
  unitId?: Types.ObjectId | null;
  originTemplateId?: Types.ObjectId | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sla?: { responseStartedAt?: Date | null } | null;
};

/**
 * O calendário do SLA com os feriados de uma única leitura: da abertura mais
 * antiga que importa (30 dias antes do mês, ou a autorização antiga 60 dias
 * antes do fim) até 60 dias depois do fim do mês.
 */
async function lerCalendario(competencia: string): Promise<CalendarioImr> {
  const { inicio, fim } = limitesDoMesEmBelem(competencia);
  const de = Math.min(
    inicio.getTime() - DIAS_ANTES_DO_MES * DIA_MS,
    fim.getTime() - DIAS_AUTORIZACAO_ESTIMADA * DIA_MS,
  );
  return lerCalendarioImr(new Date(de), new Date(fim.getTime() + 60 * DIA_MS));
}

/** Data do último registro de cancelamento de cada chamado cancelado (AC-3). */
async function lerCancelamentos(ids: Types.ObjectId[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const linhas = await ChamadoHistoryModel.aggregate<{ _id: Types.ObjectId; em: Date }>([
    { $match: { chamadoId: { $in: ids }, action: 'cancelamento' } },
    { $group: { _id: '$chamadoId', em: { $max: '$createdAt' } } },
  ]);
  return new Map(linhas.map((l) => [String(l._id), l.em]));
}

async function lerNomes(
  docs: DocChamado[],
): Promise<{ usuarios: Map<string, string>; unidades: Map<string, string> }> {
  const userIds = [
    ...new Set(
      docs
        .map((d) => d.solicitanteId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const unitIds = [
    ...new Set(
      docs
        .map((d) => d.unitId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [users, units] = await Promise.all([
    userIds.length
      ? UserModel.find({ _id: { $in: userIds } })
          .select('name')
          .lean<{ _id: Types.ObjectId; name: string }[]>()
      : [],
    unitIds.length
      ? UnitModel.find({ _id: { $in: unitIds } })
          .select('name')
          .lean<{ _id: Types.ObjectId; name: string }[]>()
      : [],
  ]);
  return {
    usuarios: new Map(users.map((u) => [String(u._id), u.name])),
    unidades: new Map(units.map((u) => [String(u._id), u.name])),
  };
}

/**
 * Os chamados do contrato abertos do início do mês menos 30 dias ao fim do
 * mês. O prazo vem sempre depois da abertura, então ninguém de fora dessa
 * janela tem prazo dentro do mês; o filtro fino fica na apuração.
 */
async function lerChamados(contrato: ContratoDoRelatorio, competencia: string) {
  const { inicio, fim } = limitesDoMesEmBelem(competencia);
  const docs = await ChamadoModel.find({
    tipoServico: { $in: contrato.tiposServico },
    createdAt: { $gte: new Date(inicio.getTime() - DIAS_ANTES_DO_MES * DIA_MS), $lt: fim },
  })
    .select(
      'ticket_number titulo status solicitanteId unitId originTemplateId rejectedAt createdAt updatedAt sla.responseStartedAt',
    )
    .lean<DocChamado[]>();

  const [cancelamentos, nomes] = await Promise.all([
    lerCancelamentos(docs.filter((d) => d.status === 'cancelado').map((d) => d._id)),
    lerNomes(docs),
  ]);

  return docs.map((d): ChamadoLidoI3 => {
    const id = String(d._id);
    let encerradoEm: Date | null = null;
    if (d.status === 'recusado') encerradoEm = d.rejectedAt ?? d.updatedAt;
    if (d.status === 'cancelado') encerradoEm = cancelamentos.get(id) ?? d.updatedAt;
    return {
      id,
      ticketNumber: d.ticket_number,
      solicitanteNome: d.solicitanteId
        ? (nomes.usuarios.get(String(d.solicitanteId)) ?? 'Usuário removido')
        : 'Usuário removido',
      setor: (d.unitId && nomes.unidades.get(String(d.unitId))) || 'Sem unidade',
      titulo: d.titulo ?? '',
      createdAt: d.createdAt,
      responseStartedAt: d.sla?.responseStartedAt ?? null,
      status: d.status,
      preventiva: Boolean(d.originTemplateId),
      encerradoEm,
    };
  });
}

type DocCotacao = {
  _id: Types.ObjectId;
  numero: string;
  chamadoId: Types.ObjectId;
  situacao: SituacaoCotacao;
  autorizadoEm?: Date | null;
  fornecimentoAte?: Date | null;
  executadoEm?: Date | null;
};

const COTACAO_ENCERRADA: readonly SituacaoCotacao[] = ['cancelada', 'reprovada'];

/** O `em` do último evento para `cancelada` ou `reprovada` de cada cotação (AC-5). */
async function lerEncerramentos(ids: Types.ObjectId[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const linhas = await CotacaoMaterialEventoModel.aggregate<{ _id: Types.ObjectId; em: Date }>([
    { $match: { cotacaoId: { $in: ids }, para: { $in: COTACAO_ENCERRADA } } },
    { $group: { _id: '$cotacaoId', em: { $max: '$em' } } },
  ]);
  return new Map(linhas.map((l) => [String(l._id), l.em]));
}

/**
 * As cotações com prazo de fornecimento que pode cair no mês (o gravado no
 * mês, ou a autorização antiga sem prazo até 60 dias antes do fim), de
 * chamados do contrato, inclusive preventiva. A busca parte do prazo, e não
 * dos chamados lidos para o I3, porque a cotação costuma vir semanas depois
 * da abertura do chamado; o filtro fino fica na apuração.
 */
async function lerCotacoes(
  contrato: ContratoDoRelatorio,
  competencia: string,
): Promise<CotacaoLidaI4[]> {
  const { inicio, fim } = limitesDoMesEmBelem(competencia);
  const docs = await CotacaoMaterialModel.find({
    $or: [
      { fornecimentoAte: { $gte: inicio, $lt: fim } },
      {
        fornecimentoAte: null,
        autorizadoEm: {
          $gte: new Date(fim.getTime() - DIAS_AUTORIZACAO_ESTIMADA * DIA_MS),
          $lt: fim,
        },
      },
    ],
  })
    .select('numero chamadoId situacao autorizadoEm fornecimentoAte executadoEm')
    .lean<DocCotacao[]>();
  if (docs.length === 0) return [];

  const chamados = await ChamadoModel.find({
    _id: { $in: [...new Set(docs.map((d) => String(d.chamadoId)))] },
    tipoServico: { $in: contrato.tiposServico },
  })
    .select('ticket_number')
    .lean<{ _id: Types.ObjectId; ticket_number: string }[]>();
  const numeros = new Map(chamados.map((c) => [String(c._id), c.ticket_number]));
  const doContrato = docs.filter((d) => numeros.has(String(d.chamadoId)));

  const encerramentos = await lerEncerramentos(
    doContrato.filter((d) => COTACAO_ENCERRADA.includes(d.situacao)).map((d) => d._id),
  );
  return doContrato.map((d) => ({
    id: String(d._id),
    numero: d.numero,
    chamadoTicketNumber: numeros.get(String(d.chamadoId))!,
    situacao: d.situacao,
    autorizadoEm: d.autorizadoEm ?? null,
    fornecimentoAte: d.fornecimentoAte ?? null,
    executadoEm: d.executadoEm ?? null,
    encerradoEm: encerramentos.get(String(d._id)) ?? null,
  }));
}

type DocMarcacao = {
  _id: Types.ObjectId;
  indicador: 3 | 4;
  alvoTipo: 'chamado' | 'cotacao';
  alvoId: Types.ObjectId;
  tipo: TipoMarcacao;
  motivo: string;
  porUserId: Types.ObjectId;
  papel: PapelImr;
  em: Date;
};

/**
 * Os eventos de marcação do contrato e mês (AC-7, AC-8), com o nome do autor
 * e o número do alvo, que a lista "fora da base" mostra mesmo quando o alvo
 * não está entre os lidos.
 */
async function lerMarcacoes(contratoId: string, competencia: string): Promise<MarcacaoLida[]> {
  const docs = await ImrMarcacaoModel.find({
    contratoId: new Types.ObjectId(contratoId),
    competencia,
  })
    .select('indicador alvoTipo alvoId tipo motivo porUserId papel em')
    .lean<DocMarcacao[]>();
  if (docs.length === 0) return [];

  const ids = (tipo: DocMarcacao['alvoTipo']) => [
    ...new Set(docs.filter((d) => d.alvoTipo === tipo).map((d) => String(d.alvoId))),
  ];
  const chamadoIds = ids('chamado');
  const cotacaoIds = ids('cotacao');
  const [autores, chamados, cotacoes] = await Promise.all([
    UserModel.find({ _id: { $in: [...new Set(docs.map((d) => String(d.porUserId)))] } })
      .select('name')
      .lean<{ _id: Types.ObjectId; name: string }[]>(),
    chamadoIds.length
      ? ChamadoModel.find({ _id: { $in: chamadoIds } })
          .select('ticket_number')
          .lean<{ _id: Types.ObjectId; ticket_number: string }[]>()
      : [],
    cotacaoIds.length
      ? CotacaoMaterialModel.find({ _id: { $in: cotacaoIds } })
          .select('numero')
          .lean<{ _id: Types.ObjectId; numero: string }[]>()
      : [],
  ]);
  const nomes = new Map(autores.map((u) => [String(u._id), u.name]));
  const numeros = new Map<string, string>([
    ...chamados.map((c): [string, string] => [String(c._id), c.ticket_number]),
    ...cotacoes.map((c): [string, string] => [String(c._id), c.numero]),
  ]);
  return docs.map((d) => ({
    id: String(d._id),
    indicador: d.indicador,
    alvoId: String(d.alvoId),
    alvoNumero: numeros.get(String(d.alvoId)) ?? '',
    tipo: d.tipo,
    motivo: d.motivo,
    porNome: nomes.get(String(d.porUserId)) ?? 'Usuário removido',
    papel: d.papel,
    em: d.em,
  }));
}

export type ResultadoPrevia =
  | {
      ok: true;
      contrato: ContratoDoRelatorio;
      apuracao: ApuracaoMes;
      /** Aberto ou fechado; com o mês fechado, a prévia ainda sai, mas marcar é recusado (AC-9). */
      estado: EstadoDoMes;
      /** A base completa do mês, para conferir o alvo de uma marcação. */
      baseI3: Map<string, LinhaI3>;
      baseI4: Map<string, LinhaI4>;
    }
  | { ok: false; motivo: 'contrato_inexistente' | 'mes_fora_da_vigencia' };

/**
 * A prévia ao vivo de um contrato num mês (AC-1 a AC-9, AC-16), e a mesma
 * apuração que o fechamento grava (AC-15). Marcação feita com o mês fechado
 * (corrida rara) é ignorada pelos intervalos fechados (AC-9).
 */
export async function montarPreviaImr(params: {
  contratoId: string;
  competencia: string;
  agora?: Date;
}): Promise<ResultadoPrevia> {
  const agora = params.agora ?? new Date();
  const contrato = await lerContrato(params.contratoId);
  if (!contrato) return { ok: false, motivo: 'contrato_inexistente' };
  if (!mesesPermitidos(contrato, hojeEmBelem(agora)).includes(params.competencia)) {
    return { ok: false, motivo: 'mes_fora_da_vigencia' };
  }
  await dbConnect();
  const [calendario, chamados, cotacoes, marcacoes, estado, material] = await Promise.all([
    lerCalendario(params.competencia),
    lerChamados(contrato, params.competencia),
    lerCotacoes(contrato, params.competencia),
    lerMarcacoes(params.contratoId, params.competencia),
    lerEstadoDoMes(params.contratoId, params.competencia),
    lerMaterialConfig(),
  ]);
  const r = apurarComBase({
    competencia: params.competencia,
    agora,
    calendario,
    chamados,
    cotacoes,
    marcacoes,
    intervalosFechados: estado.intervalos,
    prazoFornecimentoDiasUteis: material.prazoFornecimentoDiasUteis,
  });
  return { ok: true, contrato, estado, ...r };
}
