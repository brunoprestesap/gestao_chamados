import 'server-only';

import { Types } from 'mongoose';

import { fimDoDiaEmBelem } from '@/lib/ativos/documentos/situacao';
import { dbConnect } from '@/lib/db';
import { tempoDeReparoMs } from '@/lib/imr-service';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ChamadoModel } from '@/models/Chamado';
import { LocalizacaoModel } from '@/models/Localizacao';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import type { TipoServico } from '@/shared/chamados/tipo-servico';

/**
 * Indicadores por equipamento (spec 0014, AC-14 a AC-20): MTBF, MTTR,
 * reincidência em 90 dias e o ranking dos ativos com mais corretivos. São só
 * informativos: nunca entram nos números contratuais do IMR.
 *
 * A leitura é uma consulta própria, fora do `$facet` do IMR (que filtra por
 * `closedAt` e só `encerrado`). O cálculo roda em JS sobre os documentos
 * lidos, em funções puras testáveis sem banco.
 */

export const MS_DIA = 24 * 60 * 60 * 1000;
export const JANELA_REINCIDENCIA_DIAS = 90;
export const JANELA_FICHA_DIAS = 365;
export const RANKING_MAX = 10;

/**
 * Status que tiram o chamado da conta de corretivo. Não é
 * `STATUS_SEM_VINCULO_ATIVO`, que inclui `encerrado` (AC-14).
 */
export const STATUS_FORA_DO_CORRETIVO = ['cancelado', 'recusado'] as const;

/** O filtro de corretivo: sem `originTemplateId` (não é preventiva) e fora dos status acima. */
export function filtroCorretivo(inicio: Date, fim: Date) {
  return {
    originTemplateId: null,
    status: { $nin: [...STATUS_FORA_DO_CORRETIVO] },
    createdAt: { $gte: inicio, $lte: fim },
  };
}

/** Um corretivo com ativo, já lido do banco. */
export type CorretivoLido = {
  ativoId: string;
  createdAt: Date;
  tipoServico: string | null;
  resolvedAt: Date | null;
  totalPausedMinutes: number | null;
};

export type NumerosDoAtivo = {
  /** Corretivos dentro da janela principal. */
  corretivos: number;
  /** Média dos intervalos entre corretivos seguidos; `null` com menos de 2. */
  mtbfMs: number | null;
  /** Média dos tempos de reparo dos corretivos resolvidos; `null` sem nenhum. */
  mttrMs: number | null;
  /** Soma dos tempos de reparo, usada no desempate do ranking. */
  somaMttrMs: number;
  /** Corretivos nos 90 dias que terminam no fim da janela. */
  corretivos90d: number;
};

function media(valores: number[]): number | null {
  return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

/**
 * Os números de um ativo (AC-17). `doPeriodo` são os corretivos dentro da
 * janela principal; `da90d`, os dos 90 dias que terminam no fim dela (um
 * corretivo anterior ao início da janela entra só aqui).
 */
export function numerosDoAtivo(
  doPeriodo: readonly CorretivoLido[],
  da90d: readonly CorretivoLido[],
): NumerosDoAtivo {
  const datas = doPeriodo.map((c) => c.createdAt.getTime()).sort((a, b) => a - b);
  const intervalos = datas.slice(1).map((t, i) => t - datas[i]!);
  const reparos = doPeriodo
    .map((c) =>
      tempoDeReparoMs({
        createdAt: c.createdAt,
        resolvedAt: c.resolvedAt,
        totalPausedMinutes: c.totalPausedMinutes,
      }),
    )
    .filter((ms): ms is number => ms !== null);

  return {
    corretivos: doPeriodo.length,
    mtbfMs: media(intervalos),
    mttrMs: media(reparos),
    somaMttrMs: reparos.reduce((a, b) => a + b, 0),
    corretivos90d: da90d.length,
  };
}

export type InfoDoAtivo = {
  codigo: string;
  descricao: string;
  /** Usado pelo relatório por contrato (spec 0016); a aba Ativos do IMR ignora. */
  categoriaId: string | null;
  categoria: string | null;
  caminho: string | null;
};

export type LinhaRanking = Omit<InfoDoAtivo, 'categoriaId'> & {
  ativoId: string;
  corretivos: number;
  mtbfMs: number | null;
  mttrMs: number | null;
  corretivos90d: number;
};

export type TopoIndicadores = {
  corretivosComAtivo: number;
  /** Percentual dos corretivos do período que têm ativo; `null` sem corretivo nenhum. */
  percentualComAtivo: number | null;
  ativosAfetados: number;
  mtbfMedioMs: number | null;
  mttrMedioMs: number | null;
  ativosReincidentes: number;
};

export type IndicadoresDoFiltro = {
  topo: TopoIndicadores;
  ranking: LinhaRanking[];
};

export type IndicadoresAtivos = {
  geral: IndicadoresDoFiltro;
  porTipo: Record<TipoServico, IndicadoresDoFiltro>;
};

export type JanelaIndicadores = {
  inicio: Date;
  fim: Date;
  /** A janela de reincidência: 90 dias que terminam em `fimReincidencia`. */
  inicioReincidencia: Date;
  fimReincidencia: Date;
};

export function janelaDoPeriodo(inicio: Date, fim: Date, fimReincidencia = fim): JanelaIndicadores {
  return {
    inicio,
    fim,
    inicioReincidencia: new Date(fimReincidencia.getTime() - JANELA_REINCIDENCIA_DIAS * MS_DIA),
    fimReincidencia,
  };
}

/**
 * A janela "até hoje" da ficha e da leitura em lote dos candidatos à
 * substituição (spec 0015, AC-3 e AC-7): 365 dias corridos e 90 dias, os dois
 * terminando no fim de hoje em Belém. Nunca depende do período do IMR.
 */
export function janelaDeHoje(agora: Date = new Date()): JanelaIndicadores {
  const fim = fimDoDiaEmBelem(agora);
  return janelaDoPeriodo(new Date(fim.getTime() - JANELA_FICHA_DIAS * MS_DIA), fim);
}

export function agruparPorAtivo(
  corretivos: readonly CorretivoLido[],
): Map<string, CorretivoLido[]> {
  const mapa = new Map<string, CorretivoLido[]>();
  for (const c of corretivos) {
    const lista = mapa.get(c.ativoId);
    if (lista) lista.push(c);
    else mapa.set(c.ativoId, [c]);
  }
  return mapa;
}

export function dentro(c: CorretivoLido, inicio: Date, fim: Date): boolean {
  const t = c.createdAt.getTime();
  return t >= inicio.getTime() && t <= fim.getTime();
}

/**
 * Topo e ranking de um filtro (AC-16 a AC-18). `corretivos` já vem filtrado
 * pelo tipo e cobre o período mais a janela de reincidência; `totalCorretivos`
 * é o denominador do percentual (com e sem ativo, só do período).
 */
export function calcularFiltro(params: {
  corretivos: readonly CorretivoLido[];
  totalCorretivos: number;
  janela: JanelaIndicadores;
  info: ReadonlyMap<string, InfoDoAtivo>;
}): IndicadoresDoFiltro {
  const { corretivos, totalCorretivos, janela, info } = params;

  const doPeriodo = corretivos.filter((c) => dentro(c, janela.inicio, janela.fim));
  const da90d = corretivos.filter((c) =>
    dentro(c, janela.inicioReincidencia, janela.fimReincidencia),
  );
  const periodoPorAtivo = agruparPorAtivo(doPeriodo);
  const reincidenciaPorAtivo = agruparPorAtivo(da90d);

  const numeros = new Map<string, NumerosDoAtivo>();
  for (const [ativoId, lista] of periodoPorAtivo) {
    numeros.set(ativoId, numerosDoAtivo(lista, reincidenciaPorAtivo.get(ativoId) ?? []));
  }

  const mtbfs = [...numeros.values()]
    .map((n) => n.mtbfMs)
    .filter((ms): ms is number => ms !== null);
  const reparos = doPeriodo
    .map((c) => tempoDeReparoMs(c))
    .filter((ms): ms is number => ms !== null);
  const reincidentes = [...reincidenciaPorAtivo.values()].filter((l) => l.length >= 2).length;

  const ranking = [...numeros.entries()]
    .map(([ativoId, n]) => ({ ativoId, n, i: info.get(ativoId) }))
    .sort(
      (a, b) =>
        b.n.corretivos - a.n.corretivos ||
        b.n.somaMttrMs - a.n.somaMttrMs ||
        (a.i?.codigo ?? '').localeCompare(b.i?.codigo ?? '', 'pt-BR', { numeric: true }),
    )
    .slice(0, RANKING_MAX)
    .map(({ ativoId, n, i }) => ({
      ativoId,
      codigo: i?.codigo ?? '—',
      descricao: i?.descricao ?? '',
      categoria: i?.categoria ?? null,
      caminho: i?.caminho ?? null,
      corretivos: n.corretivos,
      mtbfMs: n.mtbfMs,
      mttrMs: n.mttrMs,
      corretivos90d: n.corretivos90d,
    }));

  return {
    topo: {
      corretivosComAtivo: doPeriodo.length,
      percentualComAtivo:
        totalCorretivos > 0 ? Math.round((doPeriodo.length / totalCorretivos) * 10000) / 100 : null,
      ativosAfetados: numeros.size,
      mtbfMedioMs: media(mtbfs),
      mttrMedioMs: media(reparos),
      ativosReincidentes: reincidentes,
    },
    ranking,
  };
}

export type ChamadoLido = {
  ativoId: Types.ObjectId;
  createdAt: Date;
  tipoServico?: string | null;
  totalPausedMinutes?: number | null;
  sla?: { resolvedAt?: Date | null } | null;
};

export function paraCorretivo(doc: ChamadoLido): CorretivoLido {
  return {
    ativoId: String(doc.ativoId),
    createdAt: doc.createdAt,
    tipoServico: doc.tipoServico ?? null,
    resolvedAt: doc.sla?.resolvedAt ?? null,
    totalPausedMinutes: doc.totalPausedMinutes ?? null,
  };
}

export const PROJECAO_CORRETIVO = {
  ativoId: 1,
  createdAt: 1,
  tipoServico: 1,
  totalPausedMinutes: 1,
  'sla.resolvedAt': 1,
} as const;

export async function lerInfoDosAtivos(ids: string[]): Promise<Map<string, InfoDoAtivo>> {
  if (ids.length === 0) return new Map();
  const ativos = await AtivoModel.find({ _id: { $in: ids } })
    .select('codigo descricao categoriaId localizacaoId')
    .lean<
      {
        _id: Types.ObjectId;
        codigo: string;
        descricao: string;
        categoriaId: Types.ObjectId;
        localizacaoId?: Types.ObjectId | null;
      }[]
    >();
  const categoriaIds = [...new Set(ativos.map((a) => String(a.categoriaId)))];
  const localIds = [
    ...new Set(
      ativos
        .map((a) => a.localizacaoId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [categorias, locais] = await Promise.all([
    CategoriaAtivoModel.find({ _id: { $in: categoriaIds } })
      .select('nome')
      .lean<{ _id: Types.ObjectId; nome: string }[]>(),
    localIds.length
      ? LocalizacaoModel.find({ _id: { $in: localIds } })
          .select('caminho')
          .lean<{ _id: Types.ObjectId; caminho: string }[]>()
      : Promise.resolve([]),
  ]);
  const nomeCategoria = new Map(categorias.map((c) => [String(c._id), c.nome]));
  const caminhoLocal = new Map(locais.map((l) => [String(l._id), l.caminho]));

  return new Map(
    ativos.map((a) => [
      String(a._id),
      {
        codigo: a.codigo,
        descricao: a.descricao,
        categoriaId: a.categoriaId ? String(a.categoriaId) : null,
        categoria: nomeCategoria.get(String(a.categoriaId)) ?? null,
        caminho: a.localizacaoId ? (caminhoLocal.get(String(a.localizacaoId)) ?? null) : null,
      },
    ]),
  );
}

/**
 * A aba Ativos do IMR (AC-15 a AC-19): "Todos" e cada tipo de serviço numa
 * só leitura. Não autoriza: quem chama confere o perfil (hoje a página do
 * IMR, com `requireAdmin()`). `inicio` e `fim` vêm convertidos como no
 * `computeImrReport` (`startOfDay`, `endOfDay`).
 */
export async function calcularIndicadoresAtivos(params: {
  inicio: Date;
  fim: Date;
  fimReincidencia: Date;
}): Promise<IndicadoresAtivos> {
  await dbConnect();
  const janela = janelaDoPeriodo(params.inicio, params.fim, params.fimReincidencia);
  const leituraDesde = new Date(
    Math.min(janela.inicio.getTime(), janela.inicioReincidencia.getTime()),
  );
  const leituraAte = new Date(Math.max(janela.fim.getTime(), janela.fimReincidencia.getTime()));

  const [docs, totais] = await Promise.all([
    ChamadoModel.find({
      ...filtroCorretivo(leituraDesde, leituraAte),
      ativoId: { $type: 'objectId' },
    })
      .select(PROJECAO_CORRETIVO)
      .lean<ChamadoLido[]>(),
    ChamadoModel.aggregate<{ _id: string | null; total: number }>([
      { $match: filtroCorretivo(params.inicio, params.fim) },
      { $group: { _id: '$tipoServico', total: { $sum: 1 } } },
    ]),
  ]);

  const corretivos = docs.map(paraCorretivo);
  const info = await lerInfoDosAtivos([...new Set(corretivos.map((c) => c.ativoId))]);
  const totalPorTipo = new Map(totais.map((t) => [t._id, t.total]));
  const totalGeral = totais.reduce((soma, t) => soma + t.total, 0);

  const porTipo = Object.fromEntries(
    TIPO_SERVICO_OPTIONS.map((tipo) => [
      tipo,
      calcularFiltro({
        corretivos: corretivos.filter((c) => c.tipoServico === tipo),
        totalCorretivos: totalPorTipo.get(tipo) ?? 0,
        janela,
        info,
      }),
    ]),
  ) as Record<TipoServico, IndicadoresDoFiltro>;

  return {
    geral: calcularFiltro({ corretivos, totalCorretivos: totalGeral, janela, info }),
    porTipo,
  };
}

export type IndicadoresDaFicha = {
  corretivos12m: number;
  mtbfMs: number | null;
  mttrMs: number | null;
  corretivos90d: number;
};

/**
 * A linha de indicadores da ficha (AC-20): últimos 12 meses e 90 dias, as
 * duas janelas terminando no fim de hoje em Belém. Só `carregarFicha` chama,
 * e só para quem pode ver (Admin, Preposto e Técnico).
 */
export async function indicadoresDoAtivo(
  ativoId: string,
  agora: Date = new Date(),
): Promise<IndicadoresDaFicha> {
  const janela = janelaDeHoje(agora);
  const fim = janela.fim;

  const docs = await ChamadoModel.find({
    ...filtroCorretivo(janela.inicio, fim),
    ativoId: new Types.ObjectId(ativoId),
  })
    .select(PROJECAO_CORRETIVO)
    .lean<ChamadoLido[]>();
  const corretivos = docs.map(paraCorretivo);
  const numeros = numerosDoAtivo(
    corretivos,
    corretivos.filter((c) => dentro(c, janela.inicioReincidencia, fim)),
  );

  return {
    corretivos12m: numeros.corretivos,
    mtbfMs: numeros.mtbfMs,
    mttrMs: numeros.mttrMs,
    corretivos90d: numeros.corretivos90d,
  };
}
