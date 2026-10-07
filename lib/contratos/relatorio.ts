import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import {
  calcularFiltro,
  type CorretivoLido,
  dentro,
  filtroCorretivo,
  type InfoDoAtivo,
  janelaDoPeriodo,
  lerInfoDosAtivos,
  numerosDoAtivo,
  PROJECAO_CORRETIVO,
  STATUS_FORA_DO_CORRETIVO,
} from '@/lib/ativos/indicadores';
import { FILTRO_VINCULAVEL } from '@/lib/ativos/seletor';
import { dbConnect } from '@/lib/db';
import { endOfDay, startOfDay, tempoDeReparoMs } from '@/lib/imr-service';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ChamadoModel } from '@/models/Chamado';
import { ContratoModel } from '@/models/Contrato';
import { RelatorioContratoEmissaoModel } from '@/models/RelatorioContratoEmissao';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceTypeModel } from '@/models/ServiceType';
import { type TipoServico, tipoServicoDoNomeDoTipo } from '@/shared/chamados/tipo-servico';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import { janelaDoMes, mesesPermitidos } from '@/shared/contratos/janela';
import type {
  ContagemSla,
  ContratoDoRelatorio,
  EmissaoRelatorioContrato,
  LinhaAtivoRelatorio,
  LinhaCategoriaRelatorio,
  RelatorioContrato,
} from '@/shared/contratos/relatorio.types';

/**
 * Relatório mensal por contrato (spec 0016). O topo sai de `calcularFiltro`
 * da spec 0014 (AC-10: os seis números batem com a aba Ativos do IMR por
 * construção) e as linhas por ativo de `numerosDoAtivo`. A parte pura
 * (`calcularRelatorio`) não lê o banco; `montarRelatorioContrato` lê e chama.
 * Não autoriza: quem chama confere o perfil (Admin).
 */

/** Status de espera: o prazo só é estendido na retomada, então um pausado nunca conta como fora (AC-13). */
const STATUS_PAUSADOS = new Set(['aguardando_solicitante', 'aguardando_terceiros']);

/** Um chamado com ativo do contrato, corretivo ou preventiva. */
export type ChamadoDoContrato = CorretivoLido & {
  originTemplateId: string | null;
  status: string;
  resolutionDueAt: Date | null;
};

export type SituacaoSla = keyof ContagemSla;

/** A regra do SLA de um corretivo com ativo (AC-13). */
export function situacaoSla(c: ChamadoDoContrato, agora: Date): SituacaoSla {
  if (!c.resolutionDueAt) return 'semSla';
  if (c.resolvedAt)
    return c.resolvedAt.getTime() <= c.resolutionDueAt.getTime() ? 'dentro' : 'fora';
  if (STATUS_PAUSADOS.has(c.status)) return 'emAndamento';
  return c.resolutionDueAt.getTime() < agora.getTime() ? 'fora' : 'emAndamento';
}

function contagemVazia(): ContagemSla {
  return { dentro: 0, fora: 0, emAndamento: 0, semSla: 0 };
}

function media(valores: number[]): number | null {
  return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

function percentual(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 10000) / 100 : null;
}

function paraCorretivoLido(c: ChamadoDoContrato): CorretivoLido {
  return {
    ativoId: c.ativoId,
    createdAt: c.createdAt,
    tipoServico: c.tipoServico,
    resolvedAt: c.resolvedAt,
    totalPausedMinutes: c.totalPausedMinutes,
  };
}

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

export type EntradaDoCalculo = {
  contrato: ContratoDoRelatorio;
  mes: string;
  /** Janela já fechada com `startOfDay`/`endOfDay` (AC-6). */
  inicio: Date;
  fim: Date;
  inicioYmd: string;
  fimYmd: string;
  /** Corretivos e preventivas com ativo dos tipos do contrato, de `leituraDesde` até `fim`. */
  chamados: readonly ChamadoDoContrato[];
  /** Corretivos do contrato na janela, com e sem ativo (denominador do percentual). */
  totalCorretivos: number;
  info: ReadonlyMap<string, InfoDoAtivo>;
  /** Categorias ativas ligadas aos tipos do contrato pelo catálogo (AC-11). */
  categoriasDoEscopo: readonly { id: string; nome: string }[];
  /** Ativos vinculáveis por `categoriaId`, retrato do momento. */
  ativosNoEscopo: ReadonlyMap<string, number>;
  agora: Date;
  geradoPorNome: string;
};

/** O cálculo puro do relatório (AC-9 a AC-14), sem leitura de banco. */
export function calcularRelatorio(e: EntradaDoCalculo): RelatorioContrato {
  const janela = janelaDoPeriodo(e.inicio, e.fim, e.fim);
  const corretivos = e.chamados.filter((c) => !c.originTemplateId);
  const preventivas = e.chamados.filter(
    (c) => c.originTemplateId && dentro(c, janela.inicio, janela.fim),
  );

  const topo14 = calcularFiltro({
    corretivos: corretivos.map(paraCorretivoLido),
    totalCorretivos: e.totalCorretivos,
    janela,
    info: e.info,
  }).topo;

  const doPeriodo = corretivos.filter((c) => dentro(c, janela.inicio, janela.fim));
  const da90d = corretivos.filter((c) =>
    dentro(c, janela.inicioReincidencia, janela.fimReincidencia),
  );

  const agrupar = (lista: readonly ChamadoDoContrato[]) => {
    const mapa = new Map<string, ChamadoDoContrato[]>();
    for (const c of lista) {
      const l = mapa.get(c.ativoId);
      if (l) l.push(c);
      else mapa.set(c.ativoId, [c]);
    }
    return mapa;
  };
  const periodoPorAtivo = agrupar(doPeriodo);
  const noventaPorAtivo = agrupar(da90d);
  const preventivasPorAtivo = agrupar(preventivas);

  const slaTopo = contagemVazia();
  const ativoIds = new Set([...periodoPorAtivo.keys(), ...preventivasPorAtivo.keys()]);
  const linhas: (LinhaAtivoRelatorio & { somaMttrMs: number; reparos: number[] })[] = [];

  for (const ativoId of ativoIds) {
    const doAtivo = periodoPorAtivo.get(ativoId) ?? [];
    const n = numerosDoAtivo(
      doAtivo.map(paraCorretivoLido),
      (noventaPorAtivo.get(ativoId) ?? []).map(paraCorretivoLido),
    );
    const sla = contagemVazia();
    for (const c of doAtivo) {
      const s = situacaoSla(c, e.agora);
      sla[s] += 1;
      slaTopo[s] += 1;
    }
    const prev = preventivasPorAtivo.get(ativoId) ?? [];
    const i = e.info.get(ativoId);
    linhas.push({
      ativoId,
      codigo: i?.codigo ?? '—',
      descricao: i?.descricao ?? '',
      categoriaId: i?.categoriaId ?? null,
      categoria: i?.categoria ?? null,
      caminho: i?.caminho ?? null,
      corretivos: n.corretivos,
      mtbfMs: n.mtbfMs,
      mttrMs: n.mttrMs,
      corretivos90d: n.corretivos90d,
      reincidente: n.corretivos90d >= 2,
      sla,
      preventivasGeradas: prev.length,
      preventivasConcluidas: prev.filter((p) => p.resolvedAt).length,
      somaMttrMs: n.somaMttrMs,
      reparos: doAtivo.map(tempoDeReparoMs).filter((ms): ms is number => ms !== null),
    });
  }

  linhas.sort(
    (a, b) =>
      (a.categoria === null ? 1 : 0) - (b.categoria === null ? 1 : 0) ||
      porNome(a.categoria ?? '', b.categoria ?? '') ||
      b.corretivos - a.corretivos ||
      b.somaMttrMs - a.somaMttrMs ||
      a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }),
  );

  // Categorias: as do escopo do contrato mais as que aparecem em algum ativo da tabela.
  const nomes = new Map(e.categoriasDoEscopo.map((c) => [c.id, c.nome]));
  for (const l of linhas) {
    if (l.categoriaId && !nomes.has(l.categoriaId)) nomes.set(l.categoriaId, l.categoria ?? '—');
  }
  const montarCategoria = (
    categoriaId: string | null,
    nome: string,
    daCategoria: typeof linhas,
  ): LinhaCategoriaRelatorio => ({
    categoriaId,
    nome,
    ativosNoEscopo: categoriaId ? (e.ativosNoEscopo.get(categoriaId) ?? 0) : 0,
    ativosComChamado: daCategoria.length,
    corretivos: daCategoria.reduce((s, l) => s + l.corretivos, 0),
    mttrMedioMs: media(daCategoria.flatMap((l) => l.reparos)),
    reincidentes: daCategoria.filter((l) => l.reincidente).length,
    slaDentro: daCategoria.reduce((s, l) => s + l.sla.dentro, 0),
    slaFora: daCategoria.reduce((s, l) => s + l.sla.fora, 0),
    preventivasGeradas: daCategoria.reduce((s, l) => s + l.preventivasGeradas, 0),
    preventivasConcluidas: daCategoria.reduce((s, l) => s + l.preventivasConcluidas, 0),
  });
  const categorias = [...nomes.entries()]
    .sort((a, b) => porNome(a[1], b[1]))
    .map(([id, nome]) =>
      montarCategoria(
        id,
        nome,
        linhas.filter((l) => l.categoriaId === id),
      ),
    );
  const semCategoria = linhas.filter((l) => !l.categoriaId);
  if (semCategoria.length > 0)
    categorias.push(montarCategoria(null, 'Sem categoria', semCategoria));

  return {
    contrato: e.contrato,
    janela: {
      inicio: e.inicioYmd,
      fim: e.fimYmd,
      mes: e.mes,
      parcial: e.mes === hojeEmBelem(e.agora).slice(0, 7),
    },
    geradoEm: e.agora.toISOString(),
    geradoPorNome: e.geradoPorNome,
    topo: {
      corretivosTotal: e.totalCorretivos,
      corretivosSemAtivo: Math.max(0, e.totalCorretivos - topo14.corretivosComAtivo),
      ...topo14,
      preventivasGeradas: preventivas.length,
      preventivasConcluidas: preventivas.filter((p) => p.resolvedAt).length,
      sla: {
        ...slaTopo,
        percentualDentro: percentual(slaTopo.dentro, slaTopo.dentro + slaTopo.fora),
      },
    },
    categorias,
    ativos: linhas.map((l) => {
      const { somaMttrMs, reparos, ...linha } = l;
      void somaMttrMs;
      void reparos;
      return linha;
    }),
  };
}

/* ─────────────────────────────── Leitura ─────────────────────────────── */

type ContratoLido = {
  _id: Types.ObjectId;
  numero: string;
  empresa: string;
  cnpj: string;
  processoSei: string;
  objeto?: string | null;
  fiscal?: string | null;
  tiposServico: string[];
  vigenciaInicio: string;
  vigenciaFim: string;
  isActive: boolean;
};

export function paraContratoDoRelatorio(c: ContratoLido): ContratoDoRelatorio {
  return {
    id: String(c._id),
    numero: c.numero,
    empresa: c.empresa,
    cnpjFormatado: formatarCnpj(c.cnpj),
    processoSei: c.processoSei,
    objeto: c.objeto ?? null,
    fiscal: c.fiscal ?? null,
    tiposServico: c.tiposServico as TipoServico[],
    vigenciaInicio: c.vigenciaInicio,
    vigenciaFim: c.vigenciaFim,
    isActive: c.isActive,
  };
}

/** O contrato pelo id, ou `null` (id malformado também). */
export async function lerContrato(id: string): Promise<ContratoDoRelatorio | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await dbConnect();
  const c = await ContratoModel.findById(id).lean<ContratoLido | null>();
  return c ? paraContratoDoRelatorio(c) : null;
}

/** Todos os contratos, do mais recente pela vigência; o seletor do relatório mostra os inativos também (AC-4). */
export async function listarContratos(): Promise<ContratoDoRelatorio[]> {
  await dbConnect();
  const lista = await ContratoModel.find()
    .sort({ vigenciaInicio: -1, numero: 1 })
    .lean<ContratoLido[]>();
  return lista.map(paraContratoDoRelatorio);
}

/** Categorias ativas cujo subtipo leva a um `ServiceType` de um dos tipos do contrato (AC-11). */
async function lerCategoriasDoEscopo(
  tipos: readonly TipoServico[],
): Promise<{ id: string; nome: string }[]> {
  const servicos = await ServiceTypeModel.find()
    .select('name')
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  const typeIds = servicos
    .filter((s) => {
      const t = tipoServicoDoNomeDoTipo(s.name);
      return t !== null && tipos.includes(t);
    })
    .map((s) => s._id);
  if (typeIds.length === 0) return [];
  const subtipos = await ServiceSubTypeModel.find({ typeId: { $in: typeIds } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  if (subtipos.length === 0) return [];
  const categorias = await CategoriaAtivoModel.find({
    isActive: true,
    serviceSubTypeId: { $in: subtipos.map((s) => s._id) },
  })
    .select('nome')
    .lean<{ _id: Types.ObjectId; nome: string }[]>();
  return categorias.map((c) => ({ id: String(c._id), nome: c.nome }));
}

type DocDoContrato = {
  ativoId: Types.ObjectId;
  createdAt: Date;
  tipoServico?: string | null;
  totalPausedMinutes?: number | null;
  originTemplateId?: Types.ObjectId | null;
  status: string;
  sla?: { resolvedAt?: Date | null; resolutionDueAt?: Date | null } | null;
};

function paraChamadoDoContrato(d: DocDoContrato): ChamadoDoContrato {
  return {
    ativoId: String(d.ativoId),
    createdAt: d.createdAt,
    tipoServico: d.tipoServico ?? null,
    resolvedAt: d.sla?.resolvedAt ?? null,
    totalPausedMinutes: d.totalPausedMinutes ?? null,
    originTemplateId: d.originTemplateId ? String(d.originTemplateId) : null,
    status: d.status,
    resolutionDueAt: d.sla?.resolutionDueAt ?? null,
  };
}

export type ResultadoRelatorio =
  | { ok: true; relatorio: RelatorioContrato }
  | { ok: false; motivo: 'contrato_inexistente' | 'mes_fora_da_vigencia' };

/**
 * Lê e calcula o relatório de um contrato num mês (AC-5 a AC-15). `agora` é o
 * instante da geração: o mesmo do SLA em andamento, do selo de parcial e do
 * "Gerado em" (a rota do PDF grava esse mesmo valor em `geradoEm`).
 */
export async function montarRelatorioContrato(params: {
  contratoId: string;
  mes: string;
  agora?: Date;
  geradoPorNome: string;
}): Promise<ResultadoRelatorio> {
  const agora = params.agora ?? new Date();
  const contrato = await lerContrato(params.contratoId);
  if (!contrato) return { ok: false, motivo: 'contrato_inexistente' };
  if (!mesesPermitidos(contrato, hojeEmBelem(agora)).includes(params.mes)) {
    return { ok: false, motivo: 'mes_fora_da_vigencia' };
  }

  const j = janelaDoMes(params.mes, contrato.vigenciaInicio, contrato.vigenciaFim);
  const inicio = startOfDay(j.dataInicio);
  const fim = endOfDay(j.dataFim);
  const janela = janelaDoPeriodo(inicio, fim, fim);
  const leituraDesde = new Date(Math.min(inicio.getTime(), janela.inicioReincidencia.getTime()));
  const tipos = { $in: contrato.tiposServico };

  const [docs, total, categoriasDoEscopo] = await Promise.all([
    ChamadoModel.find({
      tipoServico: tipos,
      ativoId: { $type: 'objectId' },
      status: { $nin: [...STATUS_FORA_DO_CORRETIVO] },
      createdAt: { $gte: leituraDesde, $lte: fim },
    })
      .select({
        ...PROJECAO_CORRETIVO,
        originTemplateId: 1,
        status: 1,
        'sla.resolutionDueAt': 1,
      })
      .lean<DocDoContrato[]>(),
    ChamadoModel.countDocuments({ ...filtroCorretivo(inicio, fim), tipoServico: tipos }),
    lerCategoriasDoEscopo(contrato.tiposServico),
  ]);

  const chamados = docs.map(paraChamadoDoContrato);
  // Só os ativos que entram na tabela: corretivo ou preventiva na janela.
  const idsDaTabela = [
    ...new Set(chamados.filter((c) => dentro(c, inicio, fim)).map((c) => c.ativoId)),
  ];
  const info = await lerInfoDosAtivos(idsDaTabela);

  const categoriaIds = [
    ...new Set([
      ...categoriasDoEscopo.map((c) => c.id),
      ...[...info.values()].map((i) => i.categoriaId).filter((id): id is string => id !== null),
    ]),
  ];
  const contagem = categoriaIds.length
    ? await AtivoModel.aggregate<{ _id: Types.ObjectId; total: number }>([
        {
          $match: {
            ...FILTRO_VINCULAVEL,
            categoriaId: { $in: categoriaIds.map((id) => new Types.ObjectId(id)) },
          },
        },
        { $group: { _id: '$categoriaId', total: { $sum: 1 } } },
      ])
    : [];

  return {
    ok: true,
    relatorio: calcularRelatorio({
      contrato,
      mes: params.mes,
      inicio,
      fim,
      inicioYmd: j.inicioYmd,
      fimYmd: j.fimYmd,
      chamados,
      totalCorretivos: total,
      info,
      categoriasDoEscopo,
      ativosNoEscopo: new Map(contagem.map((c) => [String(c._id), c.total])),
      agora,
      geradoPorNome: params.geradoPorNome,
    }),
  };
}

/** As emissões de um contrato e mês, mais recente primeiro, até 20 (AC-19). */
export async function listarEmissoes(
  contratoId: string,
  mes: string,
): Promise<EmissaoRelatorioContrato[]> {
  await dbConnect();
  const lista = await RelatorioContratoEmissaoModel.find({
    contratoId: new Types.ObjectId(contratoId),
    mes,
  })
    .sort({ geradoEm: -1 })
    .limit(20)
    .lean<{ _id: Types.ObjectId; geradoEm: Date; geradoPorNome: string; hashSha256: string }[]>();
  return lista.map((e) => ({
    id: String(e._id),
    geradoEm: e.geradoEm.toISOString(),
    geradoPorNome: e.geradoPorNome,
    hashSha256: e.hashSha256,
  }));
}
