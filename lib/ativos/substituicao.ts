import 'server-only';

import { Types } from 'mongoose';

import { gravarHistoricoOuDesfazer } from '@/lib/ativos/auditoria';
import {
  custoDaFicha,
  custoPorAtivo,
  lerCustosDosChamados,
  PROJECAO_CUSTO,
} from '@/lib/ativos/custo';
import {
  anosCompletos,
  dataSemHora,
  hojeEmBelem,
  paraYmd,
  somarAnos,
  somarMeses,
} from '@/lib/ativos/documentos/situacao';
import { falha, type Resultado } from '@/lib/ativos/erros';
import {
  agruparPorAtivo,
  type ChamadoLido,
  dentro,
  filtroCorretivo,
  type IndicadoresDaFicha,
  indicadoresDoAtivo,
  janelaDeHoje,
  numerosDoAtivo,
  paraCorretivo,
  PROJECAO_CORRETIVO,
} from '@/lib/ativos/indicadores';
import { compararCodigo } from '@/lib/ativos/lista';
import { AtivoModel } from '@/models/Ativo';
import { AtivoHistoryModel } from '@/models/AtivoHistory';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ChamadoModel } from '@/models/Chamado';
import { LocalizacaoModel } from '@/models/Localizacao';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceTypeModel } from '@/models/ServiceType';
import { UserModel } from '@/models/user.model';
import {
  type AtivoStatus,
  type TierManutencao,
  TIERS_VINCULAVEIS,
} from '@/shared/ativos/ativo.constants';
import {
  type CriterioSubstituicao,
  ERRO_ATIVO_MUDOU,
  ERRO_NAO_CANDIDATO,
  ERRO_SEM_DISPENSA_VIGENTE,
  erroJaDispensado,
  formatarDia,
  type IdadeNaoAvaliada,
  LIMITE_CORRETIVOS_12M_PADRAO,
  LIMITE_CUSTO_PERCENTUAL_12M_PADRAO,
  LIMITE_REINCIDENCIA_90D_PADRAO,
  MESES_DISPENSA_SUBSTITUICAO,
  type MotivoSubstituicao,
  type SituacaoCalculadaSubstituicao,
  STATUS_FORA_DA_SUBSTITUICAO,
  textoDosCriterios,
} from '@/shared/ativos/substituicao.constants';
import { centavos } from '@/shared/chamados/custo';
import { type TipoServico, tipoServicoDoNomeDoTipo } from '@/shared/chamados/tipo-servico';

/**
 * Candidatos à substituição (spec 0015). A situação nunca é gravada: é
 * refeita a cada leitura por `avaliarSubstituicao`, pura, sobre os mesmos
 * números de corretivo da ficha (spec 0014) e os limites da categoria. A única
 * escrita é a dispensa, subdocumento do ativo, com histórico e escrita
 * condicional ao `em` lido. Nada aqui muda status, categoria, tier, chamado
 * nem cria aviso (AC-16).
 */

export type {
  CriterioSubstituicao,
  MotivoSubstituicao,
} from '@/shared/ativos/substituicao.constants';

export type EntradaAvaliacao = {
  ativo: {
    tierManutencao: TierManutencao;
    status: AtivoStatus;
    dataInstalacao: Date | null;
    /** De `camposPatrimoniais`. */
    dataTombo: Date | null;
    dispensa: { ate: Date; em: Date; motivosNaDispensa: CriterioSubstituicao[] } | null;
    /** De `camposPatrimoniais`, em reais (spec 0018). */
    valorHistorico: number | null;
  };
  categoria: {
    vidaUtilAnos: number | null;
    limiteCorretivos12m: number | null;
    limiteReincidencia90d: number | null;
    limiteCustoPercentual12m: number | null;
  };
  corretivos12m: number;
  corretivos90d: number;
  /** Custo corretivo dos 12 meses (spec 0018); `null` quando a conta falhou (não avalia). */
  custoCorretivo12mCentavos: number | null;
  /** `hojeEmBelem(agora)`, `YYYY-MM-DD`. */
  hoje: string;
};

export type ResultadoAvaliacao = {
  situacao: SituacaoCalculadaSubstituicao;
  /** Os critérios que batem hoje, na ordem idade, corretivos, reincidência. */
  motivos: MotivoSubstituicao[];
  idadeNaoAvaliada: IdadeNaoAvaliada | null;
  /** Sem `valorHistorico` positivo, o critério de custo não é avaliado (spec 0018, AC-15). */
  custoNaoAvaliado: boolean;
  dispensaVigente: boolean;
  /** `YYYY-MM-DD` da dispensa gravada (vigente ou não); `null` sem dispensa ou fora do AC-1. */
  dispensaGravadaAte: string | null;
};

/** Só Tier A ou B, fora de `baixado` e `aguardando_baixa` (AC-1). */
export function elegivelParaSubstituicao(tier: TierManutencao, status: AtivoStatus): boolean {
  return TIERS_VINCULAVEIS.includes(tier) && !STATUS_FORA_DA_SUBSTITUICAO.includes(status);
}

/** A regra inteira (AC-1 a AC-6 e AC-12), sem banco. */
export function avaliarSubstituicao(e: EntradaAvaliacao): ResultadoAvaliacao {
  if (!elegivelParaSubstituicao(e.ativo.tierManutencao, e.ativo.status)) {
    return {
      situacao: 'fora',
      motivos: [],
      idadeNaoAvaliada: null,
      custoNaoAvaliado: false,
      dispensaVigente: false,
      dispensaGravadaAte: null,
    };
  }

  const motivos: MotivoSubstituicao[] = [];
  let idadeNaoAvaliada: IdadeNaoAvaliada | null = null;

  const vidaUtilAnos = e.categoria.vidaUtilAnos;
  const referencia = e.ativo.dataInstalacao ?? e.ativo.dataTombo;
  if (!vidaUtilAnos) {
    idadeNaoAvaliada = 'sem_vida_util';
  } else if (!referencia) {
    idadeNaoAvaliada = 'sem_data';
  } else {
    // O dia de Belém da data gravada, como "hoje": uma data salva às 21:00 de
    // Belém continua no dia dela.
    const dia = hojeEmBelem(referencia);
    if (e.hoje >= somarAnos(dia, vidaUtilAnos)) {
      motivos.push({ criterio: 'idade', anos: anosCompletos(dia, e.hoje), vidaUtilAnos });
    }
  }

  const limiteCorretivos = e.categoria.limiteCorretivos12m ?? LIMITE_CORRETIVOS_12M_PADRAO;
  if (e.corretivos12m >= limiteCorretivos) {
    motivos.push({ criterio: 'corretivos', quantidade: e.corretivos12m, limite: limiteCorretivos });
  }
  const limiteReincidencia = e.categoria.limiteReincidencia90d ?? LIMITE_REINCIDENCIA_90D_PADRAO;
  if (e.corretivos90d >= limiteReincidencia) {
    motivos.push({
      criterio: 'reincidencia',
      quantidade: e.corretivos90d,
      limite: limiteReincidencia,
    });
  }

  // Custo (spec 0018, AC-15): só inteiros, `custo × 100 ≥ limite × valor`.
  const valorHistoricoCentavos =
    e.ativo.valorHistorico !== null && e.ativo.valorHistorico > 0
      ? centavos(e.ativo.valorHistorico)
      : 0;
  const custoNaoAvaliado = valorHistoricoCentavos <= 0;
  const limiteCusto = e.categoria.limiteCustoPercentual12m ?? LIMITE_CUSTO_PERCENTUAL_12M_PADRAO;
  if (
    !custoNaoAvaliado &&
    e.custoCorretivo12mCentavos !== null &&
    e.custoCorretivo12mCentavos * 100 >= limiteCusto * valorHistoricoCentavos
  ) {
    motivos.push({
      criterio: 'custo',
      custoCentavos: e.custoCorretivo12mCentavos,
      percentual: Math.round((e.custoCorretivo12mCentavos * 100) / valorHistoricoCentavos),
      limite: limiteCusto,
    });
  }

  const dispensa = e.ativo.dispensa;
  // A dispensa vale até a véspera de `ate` e só cobre os critérios que batiam
  // quando foi dada: um critério novo devolve o ativo à lista (AC-12).
  const dispensaVigente =
    motivos.length > 0 &&
    !!dispensa &&
    e.hoje < paraYmd(dispensa.ate) &&
    motivos.every((m) => dispensa.motivosNaDispensa.includes(m.criterio));

  return {
    situacao: motivos.length === 0 ? 'fora' : dispensaVigente ? 'dispensado' : 'candidato',
    motivos,
    idadeNaoAvaliada,
    custoNaoAvaliado,
    dispensaVigente,
    dispensaGravadaAte: dispensa ? paraYmd(dispensa.ate) : null,
  };
}

// ── Leitura ─────────────────────────────────────────────────────────────────

type DispensaLida = {
  ate: Date;
  motivo: string;
  porUserId: Types.ObjectId;
  em: Date;
  motivosNaDispensa: CriterioSubstituicao[];
};

/** Os campos do ativo que a regra lê. */
export type AtivoParaAvaliar = {
  _id: Types.ObjectId;
  tierManutencao: TierManutencao;
  status: AtivoStatus;
  categoriaId: Types.ObjectId;
  dataInstalacao?: Date | null;
  camposPatrimoniais?:
    | { dataTombo?: Date | null; valorHistorico?: number | null }
    | Record<string, unknown>
    | null;
  dispensaSubstituicao?: DispensaLida | null;
};

export type CategoriaParaAvaliar = {
  vidaUtilAnos?: number | null;
  limiteCorretivos12m?: number | null;
  limiteReincidencia90d?: number | null;
  limiteCustoPercentual12m?: number | null;
};

const CAMPOS_ATIVO_AVALIACAO =
  'tierManutencao status categoriaId dataInstalacao camposPatrimoniais.dataTombo camposPatrimoniais.valorHistorico dispensaSubstituicao';
const CAMPOS_CATEGORIA_AVALIACAO =
  'nome vidaUtilAnos limiteCorretivos12m limiteReincidencia90d limiteCustoPercentual12m';

function dataTomboDe(a: AtivoParaAvaliar): Date | null {
  const v = (a.camposPatrimoniais as { dataTombo?: unknown } | null | undefined)?.dataTombo;
  return v instanceof Date ? v : null;
}

function valorHistoricoDe(a: AtivoParaAvaliar): number | null {
  const v = (a.camposPatrimoniais as { valorHistorico?: unknown } | null | undefined)
    ?.valorHistorico;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Monta a entrada da regra a partir do que já foi lido do banco. */
export function entradaDaAvaliacao(
  ativo: AtivoParaAvaliar,
  categoria: CategoriaParaAvaliar | null,
  numeros: { corretivos12m: number; corretivos90d: number },
  hoje: string,
  custoCorretivo12mCentavos: number | null = null,
): EntradaAvaliacao {
  const d = ativo.dispensaSubstituicao;
  return {
    ativo: {
      tierManutencao: ativo.tierManutencao,
      status: ativo.status,
      dataInstalacao: ativo.dataInstalacao ?? null,
      dataTombo: dataTomboDe(ativo),
      dispensa: d ? { ate: d.ate, em: d.em, motivosNaDispensa: d.motivosNaDispensa } : null,
      valorHistorico: valorHistoricoDe(ativo),
    },
    categoria: {
      vidaUtilAnos: categoria?.vidaUtilAnos ?? null,
      limiteCorretivos12m: categoria?.limiteCorretivos12m ?? null,
      limiteReincidencia90d: categoria?.limiteReincidencia90d ?? null,
      limiteCustoPercentual12m: categoria?.limiteCustoPercentual12m ?? null,
    },
    corretivos12m: numeros.corretivos12m,
    corretivos90d: numeros.corretivos90d,
    custoCorretivo12mCentavos,
    hoje,
  };
}

export type LinhaCandidato = {
  ativoId: string;
  codigo: string;
  descricao: string;
  categoria: string;
  caminho: string | null;
  tipoServico: TipoServico | null;
  motivos: MotivoSubstituicao[];
  corretivos12m: number;
};

export type SituacoesSubstituicao = {
  candidatos: LinhaCandidato[];
  dispensados: LinhaCandidato[];
};

/** Mais critérios primeiro, depois mais corretivos, depois o código em ordem numérica (AC-5). */
export function ordenarCandidatos(linhas: LinhaCandidato[]): LinhaCandidato[] {
  return [...linhas].sort(
    (a, b) =>
      b.motivos.length - a.motivos.length ||
      b.corretivos12m - a.corretivos12m ||
      compararCodigo(a.codigo, b.codigo),
  );
}

/** Tipo de serviço de cada categoria: subtipo → tipo → opção fixa (AC-8). */
async function tipoServicoPorCategoria(
  categorias: { _id: Types.ObjectId; serviceSubTypeId?: Types.ObjectId | null }[],
): Promise<Map<string, TipoServico | null>> {
  const subtipoIds = [
    ...new Set(
      categorias
        .map((c) => c.serviceSubTypeId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const mapa = new Map<string, TipoServico | null>();
  if (subtipoIds.length === 0) {
    for (const c of categorias) mapa.set(String(c._id), null);
    return mapa;
  }
  const subtipos = await ServiceSubTypeModel.find({ _id: { $in: subtipoIds } })
    .select('typeId')
    .lean<{ _id: Types.ObjectId; typeId: Types.ObjectId }[]>();
  const tipoIds = [...new Set(subtipos.map((s) => String(s.typeId)))];
  const tipos = await ServiceTypeModel.find({ _id: { $in: tipoIds } })
    .select('name')
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  const nomeTipo = new Map(tipos.map((t) => [String(t._id), String(t.name)]));
  const tipoDoSubtipo = new Map(subtipos.map((s) => [String(s._id), String(s.typeId)]));

  for (const c of categorias) {
    const tipoId = c.serviceSubTypeId ? tipoDoSubtipo.get(String(c.serviceSubTypeId)) : undefined;
    const nome = tipoId ? nomeTipo.get(tipoId) : undefined;
    mapa.set(String(c._id), nome ? tipoServicoDoNomeDoTipo(nome) : null);
  }
  return mapa;
}

/**
 * Todos os candidatos e dispensados de hoje (AC-5, AC-7 e AC-8), numa leitura
 * só: os ativos elegíveis, as categorias, os corretivos da janela de
 * `janelaDeHoje` só desses ativos e o caminho do local. Não autoriza: quem
 * chama confere o papel. Lança só erro inesperado.
 */
export async function listarSituacoesSubstituicao(
  params: { agora?: Date } = {},
): Promise<SituacoesSubstituicao> {
  const agora = params.agora ?? new Date();
  const hoje = hojeEmBelem(agora);
  const janela = janelaDeHoje(agora);

  const ativos = await AtivoModel.find({
    tierManutencao: { $in: [...TIERS_VINCULAVEIS] },
    status: { $nin: [...STATUS_FORA_DA_SUBSTITUICAO] },
  })
    .select(`codigo descricao localizacaoId ${CAMPOS_ATIVO_AVALIACAO}`)
    .lean<
      (AtivoParaAvaliar & {
        codigo: string;
        descricao: string;
        localizacaoId?: Types.ObjectId | null;
      })[]
    >();
  if (ativos.length === 0) return { candidatos: [], dispensados: [] };

  const categoriaIds = [...new Set(ativos.map((a) => String(a.categoriaId)))];
  const [categorias, docs] = await Promise.all([
    CategoriaAtivoModel.find({ _id: { $in: categoriaIds } })
      .select(`${CAMPOS_CATEGORIA_AVALIACAO} serviceSubTypeId`)
      .lean<
        (CategoriaParaAvaliar & {
          _id: Types.ObjectId;
          nome: string;
          serviceSubTypeId?: Types.ObjectId | null;
        })[]
      >(),
    ChamadoModel.find({
      ...filtroCorretivo(janela.inicio, janela.fim),
      ativoId: { $in: ativos.map((a) => a._id) },
    })
      .select({ ...PROJECAO_CORRETIVO, ...PROJECAO_CUSTO })
      .lean<(ChamadoLido & { _id: Types.ObjectId })[]>(),
  ]);
  const categoriaPorId = new Map(categorias.map((c) => [String(c._id), c]));
  const corretivosPorAtivo = agruparPorAtivo(docs.map(paraCorretivo));
  // Custo corretivo dos mesmos chamados da janela (spec 0018, AC-15).
  const custoCorretivo = custoPorAtivo(await lerCustosDosChamados(docs));

  const candidatos: (LinhaCandidato & { localId: string | null })[] = [];
  const dispensados: (LinhaCandidato & { localId: string | null })[] = [];
  for (const a of ativos) {
    const id = String(a._id);
    const lista = corretivosPorAtivo.get(id) ?? [];
    // A mesma conta de `indicadoresDoAtivo`, inclusive para quem não tem corretivo.
    const n = numerosDoAtivo(
      lista,
      lista.filter((c) => dentro(c, janela.inicioReincidencia, janela.fimReincidencia)),
    );
    const categoria = categoriaPorId.get(String(a.categoriaId)) ?? null;
    const r = avaliarSubstituicao(
      entradaDaAvaliacao(
        a,
        categoria,
        { corretivos12m: n.corretivos, corretivos90d: n.corretivos90d },
        hoje,
        custoCorretivo.get(id)?.corretivoCentavos ?? 0,
      ),
    );
    if (r.situacao === 'fora') continue;
    const linha = {
      ativoId: id,
      codigo: a.codigo,
      descricao: a.descricao,
      categoria: categoria?.nome ?? '—',
      caminho: null,
      tipoServico: null,
      motivos: r.motivos,
      corretivos12m: n.corretivos,
      localId: a.localizacaoId ? String(a.localizacaoId) : null,
    };
    (r.situacao === 'candidato' ? candidatos : dispensados).push(linha);
  }

  const sinalizados = [...candidatos, ...dispensados];
  const localIds = [...new Set(sinalizados.map((l) => l.localId).filter(Boolean))] as string[];
  const categoriaDoAtivo = new Map(ativos.map((a) => [String(a._id), String(a.categoriaId)]));
  const idsSinalizados = new Set(sinalizados.map((l) => categoriaDoAtivo.get(l.ativoId)));
  const categoriasSinalizadas = categorias.filter((c) => idsSinalizados.has(String(c._id)));
  const [locais, tipoPorCategoria] = await Promise.all([
    localIds.length
      ? LocalizacaoModel.find({ _id: { $in: localIds } })
          .select('caminho')
          .lean<{ _id: Types.ObjectId; caminho: string }[]>()
      : Promise.resolve([]),
    tipoServicoPorCategoria(categoriasSinalizadas),
  ]);
  const caminhoLocal = new Map(locais.map((l) => [String(l._id), l.caminho]));

  const finalizar = (linhas: (LinhaCandidato & { localId: string | null })[]) =>
    ordenarCandidatos(
      linhas.map(({ localId, ...l }) => ({
        ...l,
        caminho: localId ? (caminhoLocal.get(localId) ?? null) : null,
        tipoServico: tipoPorCategoria.get(categoriaDoAtivo.get(l.ativoId) ?? '') ?? null,
      })),
    );

  return { candidatos: finalizar(candidatos), dispensados: finalizar(dispensados) };
}

export type FiltroSubstituicao = 'candidatos' | 'dispensados';

/**
 * Os ids do filtro "Substituição" da lista `/ativos` (AC-9). Quem não é da
 * gestão nunca chega à conta: o parâmetro é ignorado e `ids` fica ausente. Uma
 * falha na conta não derruba a lista: vira `falhou` com a lista vazia (nunca a
 * lista inteira, que pareceria "todos são candidatos"), como no IMR e na ficha.
 */
export async function idsDoFiltroSubstituicao(params: {
  gestao: boolean;
  filtro?: FiltroSubstituicao;
  agora?: Date;
}): Promise<{ ids?: string[]; falhou: boolean }> {
  if (!params.gestao || !params.filtro) return { falhou: false };
  try {
    const situacoes = await listarSituacoesSubstituicao({ agora: params.agora });
    const linhas = params.filtro === 'candidatos' ? situacoes.candidatos : situacoes.dispensados;
    return { ids: linhas.map((l) => l.ativoId), falhou: false };
  } catch (err) {
    console.error(
      '[ativos]',
      JSON.stringify({
        operacao: 'idsDoFiltroSubstituicao',
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return { ids: [], falhou: true };
  }
}

/** A situação para a ficha, já com quem dispensou. Só gestão recebe (AC-10). */
export type SituacaoSubstituicao = ResultadoAvaliacao & {
  dispensa?: { ate: string; motivo: string; porNome: string; em: string };
};

/**
 * A situação da ficha (AC-10), sobre os `indicadores` que `carregarFicha` já
 * calculou: o selo e a linha de indicadores usam os mesmos números por
 * construção, sem consultar os chamados de novo.
 */
export async function situacaoSubstituicaoDaFicha(params: {
  ativo: AtivoParaAvaliar;
  categoria: CategoriaParaAvaliar | null;
  indicadores: IndicadoresDaFicha;
  /** O custo corretivo dos 12 meses que a ficha já calculou; `null` se a conta falhou. */
  custoCorretivo12mCentavos: number | null;
  agora?: Date;
}): Promise<SituacaoSubstituicao> {
  const { ativo, categoria, indicadores } = params;
  const r = avaliarSubstituicao(
    entradaDaAvaliacao(
      ativo,
      categoria,
      indicadores,
      hojeEmBelem(params.agora ?? new Date()),
      params.custoCorretivo12mCentavos,
    ),
  );
  const d = ativo.dispensaSubstituicao;
  if (!d || r.dispensaGravadaAte === null) return r;
  return {
    ...r,
    dispensa: {
      ate: r.dispensaGravadaAte,
      motivo: d.motivo,
      porNome: await nomeDe(d.porUserId),
      em: d.em.toISOString(),
    },
  };
}

async function nomeDe(userId: Types.ObjectId): Promise<string> {
  const u = await UserModel.findById(userId).select('name').lean<{ name?: string }>();
  return u?.name || 'Usuário removido';
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/** Relê o ativo, a categoria e os corretivos e refaz a conta, no servidor (AC-13). */
async function reavaliar(ativoId: string, agora: Date) {
  const ativo = await AtivoModel.findById(ativoId)
    .select(CAMPOS_ATIVO_AVALIACAO)
    .lean<AtivoParaAvaliar>();
  if (!ativo) return null;
  const [categoria, indicadores, custo] = await Promise.all([
    CategoriaAtivoModel.findById(ativo.categoriaId)
      .select(CAMPOS_CATEGORIA_AVALIACAO)
      .lean<CategoriaParaAvaliar>(),
    indicadoresDoAtivo(ativoId, agora),
    custoDaFicha(ativoId, 0, agora),
  ]);
  const hoje = hojeEmBelem(agora);
  return {
    ativo,
    hoje,
    resultado: avaliarSubstituicao(
      entradaDaAvaliacao(ativo, categoria, indicadores, hoje, custo.doze.corretivoCentavos),
    ),
  };
}

/**
 * Dispensa um candidato por 6 meses (AC-11 a AC-14). A escrita é condicional
 * à dispensa lida: sem dispensa, só grava se continuar sem; com uma que não
 * vale mais, só grava se o `em` dela ainda for o lido. Assim a primeira de
 * duas dispensas simultâneas vale e a outra não cria histórico.
 */
export async function dispensarSubstituicao(params: {
  ativoId: string;
  motivo: string;
  userId: string;
  agora?: Date;
}): Promise<Resultado> {
  const agora = params.agora ?? new Date();
  if (!Types.ObjectId.isValid(params.ativoId)) return falha('Ativo inexistente.');
  const lido = await reavaliar(params.ativoId, agora);
  if (!lido) return falha('Ativo inexistente.');
  const { ativo, hoje, resultado } = lido;

  if (resultado.situacao === 'fora') return falha(ERRO_NAO_CANDIDATO);
  const anterior = ativo.dispensaSubstituicao ?? null;
  if (resultado.situacao === 'dispensado' && anterior) {
    return falha(erroJaDispensado(await nomeDe(anterior.porUserId)));
  }

  const ate = somarMeses(hoje, MESES_DISPENSA_SUBSTITUICAO);
  // `em` é a versão da escrita condicional (AC-14), por isso vem sempre do
  // relógio real, nunca do `agora` que os testes fixam: duas dispensas nunca
  // podem nascer com a mesma versão.
  const em = new Date();
  const motivosNaDispensa = resultado.motivos.map((m) => m.criterio);
  const nova = {
    ate: dataSemHora(ate),
    motivo: params.motivo,
    porUserId: new Types.ObjectId(params.userId),
    em,
    motivosNaDispensa,
  };

  const _id = ativo._id;
  const r = await AtivoModel.updateOne(
    anterior
      ? { _id, 'dispensaSubstituicao.em': anterior.em }
      : { _id, dispensaSubstituicao: { $exists: false } },
    { $set: { dispensaSubstituicao: nova } },
  );
  if (r.matchedCount === 0) {
    const atual = await AtivoModel.findById(_id)
      .select('dispensaSubstituicao')
      .lean<{ dispensaSubstituicao?: DispensaLida | null }>();
    return atual?.dispensaSubstituicao
      ? falha(erroJaDispensado(await nomeDe(atual.dispensaSubstituicao.porUserId)))
      : falha(ERRO_ATIVO_MUDOU);
  }

  // O texto do motivo nunca entra no histórico: o técnico vê o histórico.
  const observacao =
    `Até ${formatarDia(ate)} · critérios: ${textoDosCriterios(motivosNaDispensa)}` +
    (anterior ? ` · substitui a dispensa até ${formatarDia(paraYmd(anterior.ate))}` : '');

  await gravarHistoricoOuDesfazer(
    () =>
      AtivoHistoryModel.create({
        ativoId: _id,
        acao: 'dispensa_substituicao',
        autorId: new Types.ObjectId(params.userId),
        observacao,
      }),
    () =>
      AtivoModel.updateOne(
        { _id, 'dispensaSubstituicao.em': em },
        anterior
          ? { $set: { dispensaSubstituicao: anterior } }
          : { $unset: { dispensaSubstituicao: 1 } },
      ),
  );
  return { ok: true };
}

/** Voltar a sinalizar (AC-15): apaga a dispensa vigente, condicional ao `em` lido. */
export async function desfazerDispensaSubstituicao(params: {
  ativoId: string;
  userId: string;
  agora?: Date;
}): Promise<Resultado> {
  const agora = params.agora ?? new Date();
  if (!Types.ObjectId.isValid(params.ativoId)) return falha('Ativo inexistente.');
  const lido = await reavaliar(params.ativoId, agora);
  if (!lido) return falha('Ativo inexistente.');
  const anterior = lido.ativo.dispensaSubstituicao ?? null;
  if (lido.resultado.situacao !== 'dispensado' || !anterior) {
    return falha(ERRO_SEM_DISPENSA_VIGENTE);
  }

  const _id = lido.ativo._id;
  const r = await AtivoModel.updateOne(
    { _id, 'dispensaSubstituicao.em': anterior.em },
    { $unset: { dispensaSubstituicao: 1 } },
  );
  if (r.matchedCount === 0) return falha(ERRO_SEM_DISPENSA_VIGENTE);

  await gravarHistoricoOuDesfazer(
    () =>
      AtivoHistoryModel.create({
        ativoId: _id,
        acao: 'dispensa_substituicao_desfeita',
        autorId: new Types.ObjectId(params.userId),
        observacao: `Dispensa até ${formatarDia(paraYmd(anterior.ate))} desfeita`,
      }),
    () =>
      AtivoModel.updateOne(
        { _id, dispensaSubstituicao: { $exists: false } },
        { $set: { dispensaSubstituicao: anterior } },
      ),
  );
  return { ok: true };
}
