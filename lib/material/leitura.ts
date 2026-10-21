import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { escapeRegex } from '@/lib/regex';
import { ArquivoCotacaoModel } from '@/models/ArquivoCotacao';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import { EmpenhoModel } from '@/models/Empenho';
import { LocalizacaoModel } from '@/models/Localizacao';
import { UserModel } from '@/models/user.model';
import {
  type PapelEvento,
  type SituacaoCotacao,
  SITUACOES_COM_RESERVA,
  SITUACOES_EDITAVEIS,
} from '@/shared/material/material.constants';

import { lerMaterialConfig } from './config';
import { itensComVariacaoAcima, orcamentosVencidos, pesquisaCompleta } from './controles';
import {
  aprovadoresQueCobrem,
  type Designado,
  limiteDoAprovador,
  type Papeis,
  papeisDe,
} from './papeis';
import {
  FILTRO_NOTA_FISCAL_PENDENTE,
  FILTRO_PENDENCIA_DA_CONTRATADA,
  filtroVisivelParaContratada,
  notaFiscalPendente,
  pesquisaDaUrgenciaPendente,
} from './pendencia';
import { type PrazoAteste, prazoDoAteste } from './prazos';
import { marcasDeConferencia } from './precos';
import { consomeParcelaRelevante, type Projecao, projecoesDosEmpenhos } from './projecao';
import { type EmpenhoElegivel, empenhosElegiveis } from './saldo';
import {
  type ArquivoBruto,
  type CotacaoBruta,
  type CotacaoDTO,
  type EmpenhoDoDetalheDTO,
  type EventoBruto,
  serializarCotacao,
  visaoDe,
} from './serializar';

/**
 * Leituras da cotação de material (spec 0019): a fila, o detalhe e o cartão
 * do chamado. Tudo sai por `serializarCotacao`, e as ações que a tela mostra
 * vêm daqui (o servidor confere de novo em cada action).
 */

export type Sessao = { userId: string; role: string };

export type Acoes = {
  editarDiagnostico: boolean;
  montar: boolean;
  enviar: boolean;
  assumir: boolean;
  devolver: boolean;
  reprovar: boolean;
  encaminhar: boolean;
  aprovar: boolean;
  alterar: boolean;
  cancelar: boolean;
  executar: boolean;
  receberProvisorio: boolean;
  receberDefinitivo: boolean;
  registrarNotaFiscal: boolean;
  /** O PDF da cotação é do lado TRF1, inclusive o Admin sem designação, a única ação dele (AC-23). */
  gerarPdf: boolean;
  /** Fatia 4: o fiscal que assumiu acrescenta e retira as próprias referências (AC-32). */
  referenciasDoFiscal: boolean;
  /** Fatia 4: o fiscal que assumiu recusa a urgência pedida e ainda não decidida (AC-35). */
  recusarUrgencia: boolean;
  /** Fatia 4: a contratada completa a pesquisa da urgência aceita (AC-35). */
  completarPesquisa: boolean;
};

export function acoesDisponiveis(
  cot: Pick<
    CotacaoBruta,
    | 'situacao'
    | 'emTramite'
    | 'montadoPorUserId'
    | 'valorTotalCentavos'
    | 'recebimentoProvisorio'
    | 'notaFiscal'
    | 'fiscalUserId'
    | 'urgencia'
  >,
  papeis: Papeis,
  ehTecnicoAtribuido: boolean,
): Acoes {
  const s = cot.situacao;
  const rt = papeis.tem('responsavel_tecnico');
  const fiscal = papeis.tem('fiscal');
  const aprovador = papeis.tem('aprovador');
  const lim = limiteDoAprovador(papeis);
  const montei = !!cot.montadoPorUserId && String(cot.montadoPorUserId) === papeis.userId;
  const fiscalQueAssumiu =
    fiscal && s === 'em_analise' && String(cot.fiscalUserId ?? '') === papeis.userId;
  return {
    referenciasDoFiscal: fiscalQueAssumiu,
    recusarUrgencia: fiscalQueAssumiu && !!cot.urgencia?.pedida && !cot.urgencia.decisao,
    completarPesquisa: rt && pesquisaDaUrgenciaPendente(cot),
    editarDiagnostico: ehTecnicoAtribuido && s === 'rascunho' && !cot.montadoPorUserId && !rt,
    montar: rt && SITUACOES_EDITAVEIS.includes(s),
    enviar: rt && SITUACOES_EDITAVEIS.includes(s),
    assumir: fiscal && s === 'enviada',
    devolver:
      (fiscal && (s === 'em_analise' || s === 'em_aprovacao')) ||
      (aprovador && s === 'em_aprovacao'),
    reprovar:
      (fiscal && (s === 'em_analise' || s === 'em_aprovacao')) ||
      (aprovador && s === 'em_aprovacao'),
    encaminhar: fiscal && s === 'em_analise',
    aprovar:
      aprovador &&
      s === 'em_aprovacao' &&
      !montei &&
      !!lim &&
      lim.limiteCentavos >= cot.valorTotalCentavos,
    alterar: rt && s === 'autorizada',
    cancelar:
      ((rt || papeis.tem('gestor')) && cot.emTramite) ||
      (ehTecnicoAtribuido && s === 'rascunho' && !cot.montadoPorUserId),
    executar: ehTecnicoAtribuido && s === 'autorizada',
    receberProvisorio: papeis.tem('gestor') && s === 'executada' && !cot.recebimentoProvisorio,
    // A urgência só é atestada com a pesquisa completa (AC-35); o servidor confere de novo.
    receberDefinitivo:
      papeis.tem('gestor') &&
      s === 'executada' &&
      !!cot.recebimentoProvisorio &&
      !(cot.urgencia?.pedida && !cot.urgencia.pesquisaCompletaEm),
    registrarNotaFiscal: rt && s === 'atestada' && !cot.notaFiscal,
    gerarPdf: (papeis.ladoTrf1 || papeis.leitorAdmin) && s !== 'rascunho',
  };
}

async function lerBruta(filtro: Record<string, unknown>) {
  return CotacaoMaterialModel.findOne(filtro).sort({ createdAt: -1 }).lean<CotacaoBruta>();
}

/** Nomes de quem recebeu, registrou a nota fiscal ou conferiu um item. */
async function nomesDe(cot: CotacaoBruta): Promise<Map<string, string>> {
  const ids = [
    cot.recebimentoProvisorio?.porUserId,
    cot.recebimentoDefinitivo?.porUserId,
    cot.notaFiscal?.porUserId,
    ...cot.itens.map((i) => i.conferencia?.porUserId),
    // Fatia 4: quem incluiu cada referência, quem decidiu a urgência e quem confirmou o vencido.
    ...cot.itens.flatMap((i) => (i.referencias ?? []).map((r) => r.incluidaPorUserId)),
    cot.urgencia?.decididaPorUserId,
    ...cot.advertencias.map((a) => a.confirmadaPorUserId),
    // Spec 0021: quem montou (cabeçalho do detalhe) e o fiscal que assumiu (quem age agora).
    cot.montadoPorUserId,
    cot.fiscalUserId,
  ].filter((id): id is Types.ObjectId => !!id);
  if (!ids.length) return new Map();
  const usuarios = await UserModel.find({ _id: { $in: ids } })
    .select('name')
    .lean();
  return new Map(usuarios.map((u) => [String(u._id), u.name as string]));
}

async function extras(cot: CotacaoBruta) {
  const cotacaoId = cot._id;
  const [eventos, arquivos, nomes] = await Promise.all([
    CotacaoMaterialEventoModel.find({ cotacaoId }).sort({ em: 1, _id: 1 }).lean<EventoBruto[]>(),
    ArquivoCotacaoModel.find({ cotacaoId, removidoEm: null })
      .sort({ em: 1 })
      .lean<ArquivoBruto[]>(),
    nomesDe(cot),
  ]);
  return { eventos, arquivos, nomes };
}

export type DetalheCotacao = {
  cotacao: CotacaoDTO;
  acoes: Acoes;
  chamado: { id: string; numero: string; titulo: string; status: string; ativo: string | null };
  /** Os papéis de quem lê nesta cotação (designações e o técnico atribuído), para o painel "Sua vez". */
  papeis: PapelEvento[];
  /** Só TRF1. */
  empenhosElegiveis?: EmpenhoElegivel[];
  /**
   * Só TRF1, em aprovação: a projeção de cada empenho elegível em que a
   * cotação consome a parcela relevante do saldo (AC-38).
   */
  projecoes?: Projecao[];
  aprovadoresQueCobrem?: Designado[];
  /** Só TRF1: o número do empenho da cotação, para o PDF. */
  empenhoNumero?: string | null;
  /**
   * Só TRF1, na análise: o que o encaminhar vai pedir (fatia 4). Os orçamentos
   * vencidos hoje em Belém (AC-34), se a urgência precisa do aceite (AC-35) e
   * os itens com variação acima da referência (AC-33).
   */
  encaminhar?: {
    orcamentosVencidos: string[];
    urgenciaPrecisaAceite: boolean;
    itensComVariacaoAcima: string[];
  };
};

/** O detalhe para `/cotacoes/[id]`; `null` quando não existe ou não pode ver. */
export async function lerDetalhe(id: string, sessao: Sessao): Promise<DetalheCotacao | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const cot = await lerBruta({ _id: new Types.ObjectId(id) });
  if (!cot) return null;
  const chamado = await ChamadoModel.findById(cot.chamadoId)
    .select('ticket_number titulo status assignedToUserId solicitanteId ativoId')
    .lean();
  if (!chamado) return null;
  const papeis = await papeisDe(sessao.userId, sessao.role);
  const ehTecnicoAtribuido = String(chamado.assignedToUserId ?? '') === sessao.userId;
  const visao = visaoDe(
    {
      userId: sessao.userId,
      papeis,
      ehTecnicoAtribuido,
      ehSolicitante: String(chamado.solicitanteId) === sessao.userId,
    },
    cot,
  );
  if (!visao || visao === 'solicitante') return null;

  const ativo = chamado.ativoId
    ? await AtivoModel.findById(chamado.ativoId).select('codigo descricao').lean()
    : null;
  // A lista de conferência obrigatória é lida agora, enquanto a análise pode encaminhar (AC-29).
  const marcas =
    visao === 'trf1' && (cot.situacao === 'enviada' || cot.situacao === 'em_analise')
      ? await marcasDeConferencia(cot.itens)
      : undefined;
  // A cotação serializada entra no fim, depois do bloco Empenho do TRF1 (spec 0021).
  const detalhe: Omit<DetalheCotacao, 'cotacao'> = {
    acoes: acoesDisponiveis(cot, papeis, ehTecnicoAtribuido),
    chamado: {
      id: String(chamado._id),
      numero: chamado.ticket_number,
      titulo: chamado.titulo,
      status: chamado.status,
      ativo: ativo ? `${ativo.codigo} · ${ativo.descricao}` : null,
    },
    papeis: [
      ...papeis.designacoes.map((d) => d.papel),
      ...(ehTecnicoAtribuido ? (['tecnico'] as const) : []),
    ],
  };
  let empenho: EmpenhoDoDetalheDTO | undefined;
  if (visao === 'trf1') {
    if (cot.situacao === 'em_analise') {
      const { percentualSinapi } = await lerMaterialConfig();
      const u = cot.urgencia;
      detalhe.encaminhar = {
        orcamentosVencidos: orcamentosVencidos(cot.itens, cot.orcamentos, hojeEmBelem(new Date())),
        urgenciaPrecisaAceite:
          !!u?.pedida &&
          u.decisao !== 'recusada' &&
          !u.pesquisaCompletaEm &&
          !pesquisaCompleta(cot.itens, cot.orcamentos),
        itensComVariacaoAcima: itensComVariacaoAcima(cot.itens, percentualSinapi),
      };
      // O aceite da urgência e a confirmação do vencido são do fiscal que assumiu:
      // os outros fiscais não veem o botão quando o encaminhar pede uma dessas decisões.
      const pedeDecisao =
        detalhe.encaminhar.urgenciaPrecisaAceite ||
        detalhe.encaminhar.orcamentosVencidos.length > 0;
      if (pedeDecisao && String(cot.fiscalUserId ?? '') !== sessao.userId) {
        detalhe.acoes = { ...detalhe.acoes, encaminhar: false };
      }
    }
    detalhe.empenhosElegiveis = await empenhosElegiveis();
    detalhe.aprovadoresQueCobrem = await aprovadoresQueCobrem(cot.valorTotalCentavos);
    const naBarra = await empenhosDaBarra(cot, detalhe.empenhosElegiveis);
    // Uma leitura da projeção serve à barra e ao diálogo de aprovar (o saldo é o de agora).
    const projecoes = await projecoesDosEmpenhos(naBarra.empenhos);
    if (cot.situacao === 'em_aprovacao') {
      const { parcelaRelevantePercentual } = await lerMaterialConfig();
      detalhe.projecoes = projecoes.filter((p) =>
        consomeParcelaRelevante(
          cot.valorTotalCentavos,
          p.saldoCentavos,
          parcelaRelevantePercentual,
        ),
      );
    }
    empenho = barrasDoEmpenho(cot, naBarra, projecoes, detalhe.aprovadoresQueCobrem);
    if (cot.empenhoId) {
      const daBarra = naBarra.modo === 'da_cotacao' ? naBarra.empenhos[0] : undefined;
      detalhe.empenhoNumero =
        daBarra?.numero ??
        (await EmpenhoModel.findById(cot.empenhoId).select('numero').lean())?.numero ??
        null;
    }
  }
  return {
    ...detalhe,
    cotacao: serializarCotacao(cot, visao, sessao, { ...(await extras(cot)), marcas, empenho }),
  };
}

/**
 * Os empenhos do bloco Empenho (AC-8): o da cotação quando a reserva existe
 * (de `autorizada` em diante), senão os elegíveis. O da cotação é lido mesmo
 * fora da elegibilidade de hoje; sem ele no banco, o bloco fica sem barra.
 */
async function empenhosDaBarra(
  cot: CotacaoBruta,
  elegiveis: EmpenhoElegivel[],
): Promise<{ modo: EmpenhoDoDetalheDTO['modo']; empenhos: EmpenhoElegivel[] }> {
  if (cot.empenhoId && SITUACOES_COM_RESERVA.includes(cot.situacao)) {
    const d = await EmpenhoModel.findById(cot.empenhoId)
      .select('numero valorLiquidoCentavos comprometidoCentavos')
      .lean();
    return {
      modo: 'da_cotacao',
      empenhos: d
        ? [
            {
              id: String(d._id),
              numero: d.numero,
              saldoCentavos: d.valorLiquidoCentavos - d.comprometidoCentavos,
              liquidoCentavos: d.valorLiquidoCentavos,
              comprometidoCentavos: d.comprometidoCentavos,
            },
          ]
        : [],
    };
  }
  return { modo: cot.situacao === 'em_aprovacao' ? 'aprovacao' : 'elegiveis', empenhos: elegiveis };
}

/**
 * As barras do bloco Empenho (AC-8). Em aprovação, o saldo depois é o saldo
 * menos o valor da cotação. Com a reserva feita, ela já está no comprometido:
 * a barra a separa como "esta cotação" e o saldo depois é o saldo de agora,
 * sem descontar de novo. Antes da aprovação, nada é descontado.
 */
export function barrasDoEmpenho(
  cot: Pick<
    CotacaoBruta,
    'valorTotalCentavos' | 'valorAutorizadoCentavos' | 'valorExecutadoCentavos' | 'executadoEm'
  >,
  naBarra: { modo: EmpenhoDoDetalheDTO['modo']; empenhos: EmpenhoElegivel[] },
  projecoes: readonly Projecao[],
  aprovadores: readonly Designado[],
): EmpenhoDoDetalheDTO {
  // Depois da execução, a reserva é ajustada ao executado (spec 0019, AC-10).
  const reserva = (cot.executadoEm ? cot.valorExecutadoCentavos : cot.valorAutorizadoCentavos) ?? 0;
  const barras = naBarra.empenhos.map((e) => {
    const projecao = projecoes.find((p) => p.empenhoId === e.id) ?? null;
    const comum = {
      empenhoId: e.id,
      numero: e.numero,
      liquidoCentavos: e.liquidoCentavos,
      projecao,
    };
    if (naBarra.modo === 'da_cotacao') {
      return {
        ...comum,
        comprometidoCentavos: Math.max(0, e.comprometidoCentavos - reserva),
        estaCotacaoCentavos: reserva,
        saldoDepoisCentavos: e.saldoCentavos,
      };
    }
    if (naBarra.modo === 'aprovacao') {
      return {
        ...comum,
        comprometidoCentavos: e.comprometidoCentavos,
        estaCotacaoCentavos: cot.valorTotalCentavos,
        saldoDepoisCentavos: e.saldoCentavos - cot.valorTotalCentavos,
      };
    }
    return {
      ...comum,
      comprometidoCentavos: e.comprometidoCentavos,
      estaCotacaoCentavos: null,
      saldoDepoisCentavos: e.saldoCentavos,
    };
  });
  return {
    modo: naBarra.modo,
    barras,
    podemAprovar: naBarra.modo === 'aprovacao' ? aprovadores.map((a) => a.nome) : null,
  };
}

export type CartaoCotacao = {
  cotacao: CotacaoDTO | null;
  acoes: Acoes | null;
  /** O técnico atribuído pode registrar material agora. */
  podeCriar: boolean;
};

/** O cartão do chamado: a cotação em trâmite, ou a mais recente. */
export async function cartaoDoChamado(
  chamadoId: string,
  sessao: Sessao,
): Promise<CartaoCotacao | null> {
  if (!Types.ObjectId.isValid(chamadoId)) return null;
  const chamado = await ChamadoModel.findById(chamadoId)
    .select('status assignedToUserId solicitanteId')
    .lean();
  if (!chamado) return null;
  const papeis = await papeisDe(sessao.userId, sessao.role);
  const ehTecnicoAtribuido = String(chamado.assignedToUserId ?? '') === sessao.userId;
  const ehSolicitante = String(chamado.solicitanteId) === sessao.userId;
  const gestao = sessao.role === 'Admin' || sessao.role === 'Preposto';
  if (!ehTecnicoAtribuido && !ehSolicitante && !gestao && !papeis.contratada) return null;

  const cot =
    (await lerBruta({ chamadoId: chamado._id, emTramite: true })) ??
    (await lerBruta({ chamadoId: chamado._id }));
  const podeCriar = ehTecnicoAtribuido && chamado.status === 'em atendimento' && !cot?.emTramite;
  if (!cot) return { cotacao: null, acoes: null, podeCriar };

  const visao = visaoDe({ userId: sessao.userId, papeis, ehTecnicoAtribuido, ehSolicitante }, cot);
  if (!visao) return { cotacao: null, acoes: null, podeCriar };
  return {
    cotacao: serializarCotacao(
      cot,
      visao,
      sessao,
      visao === 'solicitante' ? {} : await extras(cot),
    ),
    acoes: visao === 'solicitante' ? null : acoesDisponiveis(cot, papeis, ehTecnicoAtribuido),
    podeCriar,
  };
}

export const ABAS_FILA = ['minhas', 'analise', 'aprovacao', 'ateste', 'todas'] as const;
export type AbaFila = (typeof ABAS_FILA)[number];

/** A contratada não analisa nem aprova: as abas dela são estas (AC-21). */
export const ABAS_FILA_CONTRATADA: readonly AbaFila[] = ['minhas', 'ateste', 'todas'];

/** As abas que cada lado vê; aba fora da lista cai em `minhas`. */
export function abasDaFila(trf1: boolean): readonly AbaFila[] {
  return trf1 ? ABAS_FILA : ABAS_FILA_CONTRATADA;
}

/** Spec 0021, AC-3: páginas de 25. */
export const POR_PAGINA_FILA = 25;

/** Nas abas de trâmite a ordem é "Mais tempo na etapa"; em `todas`, "Mais recentes". */
export const ABAS_DE_TRAMITE: readonly AbaFila[] = ['minhas', 'analise', 'aprovacao', 'ateste'];

/** A busca vai até aqui; o resto é cortado. */
const MAX_BUSCA = 100;

const DIA_MS = 86_400_000;

export type LinhaFila = {
  id: string;
  numero: string;
  quantidadeItens: number;
  chamadoId: string;
  chamadoNumero: string;
  chamadoTitulo: string;
  ativoId: string | null;
  ativo: string | null;
  /** Caminho do local da cotação; `null` sem local. */
  local: string | null;
  situacao: SituacaoCotacao;
  /** De onde veio a última mudança de situação, para marcar o desvio na jornada. */
  situacaoAnterior: SituacaoCotacao | null;
  /** Só TRF1. */
  valorCentavos: number | null;
  /** Desde quando está na situação atual: o último evento da trilha com `de` diferente de `para`. */
  naEtapaDesde: string;
  naEtapaDias: number;
  urgente: boolean;
  /** Selo de atraso do ateste, só em `executada` e só no lado TRF1 (AC-21). */
  prazoAteste: PrazoAteste | null;
  /** Datas do recebimento provisório e do definitivo, sem o nome de quem recebeu. */
  recebimentoProvisorioEm: string | null;
  recebimentoDefinitivoEm: string | null;
  /** A atestada ainda sem nota fiscal (AC-22). */
  notaFiscalPendente: boolean;
  /** A urgência aceita ainda sem os 3 orçamentos por item (AC-35). */
  pesquisaPendente: boolean;
};

export type PedidoFila = { aba?: string; q?: string; urgente?: boolean; pagina?: number };

export type Fila = {
  linhas: LinhaFila[];
  trf1: boolean;
  papeis: string[];
  aba: AbaFila;
  abas: readonly AbaFila[];
  q: string;
  urgente: boolean;
  total: number;
  pagina: number;
  porPagina: number;
  /** Respeitam `q` e `urgente` (AC-3). */
  contagens: Partial<Record<AbaFila, number>>;
};

/** O que espera cada papel, para a aba "Minhas ações". */
function filtroDoQueEspera(papeis: Papeis): Record<string, unknown> {
  const out = new Set<SituacaoCotacao>();
  if (papeis.tem('responsavel_tecnico')) {
    out.add('rascunho');
    out.add('devolvida');
  }
  if (papeis.tem('fiscal')) {
    out.add('enviada');
    out.add('em_analise');
  }
  if (papeis.tem('aprovador')) out.add('em_aprovacao');
  if (papeis.tem('gestor')) out.add('executada');
  const ou: Record<string, unknown>[] = [{ situacao: { $in: [...out] } }];
  // A contratada ainda deve a nota fiscal da atestada (AC-22) ou a pesquisa da urgência (AC-35).
  if (papeis.tem('responsavel_tecnico')) ou.push({ ...FILTRO_PENDENCIA_DA_CONTRATADA });
  return { $or: ou };
}

/** As condições de uma aba, já com a visibilidade de cada lado. */
function condicoesDaAba(
  aba: AbaFila,
  papeis: Papeis,
  trf1: boolean,
  agora: Date,
): Record<string, unknown>[] {
  const e: Record<string, unknown>[] = [];
  if (aba === 'minhas') e.push(filtroDoQueEspera(papeis));
  if (aba === 'analise') e.push({ situacao: { $in: ['enviada', 'em_analise'] } });
  if (aba === 'aprovacao') e.push({ situacao: 'em_aprovacao' });
  if (aba === 'ateste') {
    // A contratada acompanha o recebimento e a nota fiscal que ela ainda deve (AC-21, AC-22).
    if (trf1) e.push({ situacao: 'executada' });
    else e.push({ $or: [{ situacao: 'executada' }, { ...FILTRO_NOTA_FISCAL_PENDENTE }] });
  }
  if (trf1 && !papeis.contratada && (aba === 'minhas' || aba === 'todas')) {
    // O rascunho não aparece para fiscal, aprovador nem gestor (AC-1).
    e.push({ situacao: { $ne: 'rascunho' } });
  }
  if (!trf1) {
    // Contratada: em trâmite, encerradas nos últimos 90 dias (AC-15) e a atestada
    // que ainda deve a nota fiscal, por mais velha que seja (AC-22). Mesma regra de `visaoDe`.
    e.push(filtroVisivelParaContratada(agora));
  }
  return e;
}

/**
 * A busca da fila (spec 0021, AC-3): o número da cotação por prefixo, sem
 * caixa, o número exato do chamado ou o código exato do ativo. As duas
 * consultas prévias rodam antes do filtro principal. `null` sem busca.
 */
async function condicaoDaBusca(q: string): Promise<Record<string, unknown> | null> {
  if (!q) return null;
  const [chamados, ativos] = await Promise.all([
    ChamadoModel.find({ ticket_number: q.replace(/^#/, '') })
      .select('_id')
      .lean(),
    AtivoModel.find({ codigo: { $in: [q, q.toUpperCase()] } })
      .select('_id')
      .lean(),
  ]);
  const ou: Record<string, unknown>[] = [
    { numero: { $regex: `^${escapeRegex(q)}`, $options: 'i' } },
  ];
  if (chamados.length) ou.push({ chamadoId: { $in: chamados.map((c) => c._id) } });
  if (ativos.length) ou.push({ ativoId: { $in: ativos.map((a) => a._id) } });
  return { $or: ou };
}

function juntar(condicoes: (Record<string, unknown> | null)[]): Record<string, unknown> {
  const e = condicoes.filter((c): c is Record<string, unknown> => !!c);
  return e.length ? { $and: e } : {};
}

type DesdeDaEtapa = { desde: Date; de: SituacaoCotacao | null };

/**
 * Desde quando cada cotação está na situação atual: o `em` do último evento
 * com `de` diferente de `para` (a criação conta; a conciliação, que grava
 * `para` igual a `de`, não). Uma agregação só para todos os ids.
 */
async function desdeDaEtapa(ids: Types.ObjectId[]): Promise<Map<string, DesdeDaEtapa>> {
  if (!ids.length) return new Map();
  const grupos = await CotacaoMaterialEventoModel.aggregate<{
    _id: Types.ObjectId;
    desde: Date;
    de: SituacaoCotacao | null;
  }>([
    { $match: { cotacaoId: { $in: ids }, $expr: { $ne: ['$de', '$para'] } } },
    { $sort: { cotacaoId: 1, em: 1, _id: 1 } },
    { $group: { _id: '$cotacaoId', desde: { $last: '$em' }, de: { $last: '$de' } } },
  ]);
  return new Map(grupos.map((g) => [String(g._id), { desde: g.desde, de: g.de ?? null }]));
}

const CAMPOS_DA_LINHA =
  'numero itens chamadoId ativoId localizacaoId situacao valorTotalCentavos executadoEm recebimentoProvisorio recebimentoDefinitivo notaFiscal urgencia createdAt';

type DocDaLinha = Pick<
  CotacaoBruta,
  | '_id'
  | 'itens'
  | 'chamadoId'
  | 'situacao'
  | 'valorTotalCentavos'
  | 'recebimentoProvisorio'
  | 'notaFiscal'
  | 'urgencia'
> & {
  numero: string;
  ativoId?: Types.ObjectId | null;
  localizacaoId?: Types.ObjectId | null;
  executadoEm?: Date | null;
  recebimentoDefinitivo?: { em: Date } | null;
  createdAt: Date;
};

/** Chamado, ativo e local das linhas da página, cada um numa consulta em lote. */
async function montarLinhas(
  docs: DocDaLinha[],
  desde: Map<string, DesdeDaEtapa>,
  trf1: boolean,
  agora: Date,
): Promise<LinhaFila[]> {
  const ativoIds = docs.map((d) => d.ativoId).filter((a): a is Types.ObjectId => !!a);
  const localIds = docs.map((d) => d.localizacaoId).filter((l): l is Types.ObjectId => !!l);
  const [chamados, ativos, locais] = await Promise.all([
    ChamadoModel.find({ _id: { $in: docs.map((d) => d.chamadoId) } })
      .select('ticket_number titulo')
      .lean(),
    ativoIds.length
      ? AtivoModel.find({ _id: { $in: ativoIds } })
          .select('codigo')
          .lean()
      : [],
    localIds.length
      ? LocalizacaoModel.find({ _id: { $in: localIds } })
          .select('caminho')
          .lean()
      : [],
  ]);
  const chamado = new Map(chamados.map((c) => [String(c._id), c]));
  const codigo = new Map(ativos.map((a) => [String(a._id), a.codigo as string]));
  const caminho = new Map(locais.map((l) => [String(l._id), l.caminho as string]));
  return docs.map((d) => {
    const etapa = desde.get(String(d._id));
    const naEtapaDesde = etapa?.desde ?? d.createdAt;
    const ch = chamado.get(String(d.chamadoId));
    return {
      id: String(d._id),
      numero: d.numero,
      quantidadeItens: d.itens?.length ?? 0,
      chamadoId: String(d.chamadoId),
      chamadoNumero: ch?.ticket_number ?? '',
      chamadoTitulo: ch?.titulo ?? '',
      ativoId: d.ativoId ? String(d.ativoId) : null,
      ativo: d.ativoId ? (codigo.get(String(d.ativoId)) ?? null) : null,
      local: d.localizacaoId ? (caminho.get(String(d.localizacaoId)) ?? null) : null,
      situacao: d.situacao,
      situacaoAnterior: etapa?.de ?? null,
      valorCentavos: trf1 ? d.valorTotalCentavos : null,
      naEtapaDesde: naEtapaDesde.toISOString(),
      naEtapaDias: Math.max(0, Math.floor((agora.getTime() - naEtapaDesde.getTime()) / DIA_MS)),
      urgente: !!d.urgencia?.pedida,
      prazoAteste: !trf1
        ? null
        : prazoDoAteste(
            {
              situacao: d.situacao,
              executadoEm: d.executadoEm,
              recebimentoProvisorio: d.recebimentoProvisorio,
            },
            agora,
          ),
      recebimentoProvisorioEm: d.recebimentoProvisorio?.em?.toISOString() ?? null,
      recebimentoDefinitivoEm: d.recebimentoDefinitivo?.em?.toISOString() ?? null,
      notaFiscalPendente: notaFiscalPendente({ situacao: d.situacao, notaFiscal: d.notaFiscal }),
      pesquisaPendente: pesquisaDaUrgenciaPendente({
        situacao: d.situacao,
        urgencia: d.urgencia,
      }),
    };
  });
}

function normalizarPedido(pedido: AbaFila | PedidoFila): Required<PedidoFila> {
  const p = typeof pedido === 'string' ? { aba: pedido } : pedido;
  const pagina = p.pagina !== undefined && Number.isFinite(p.pagina) ? Math.floor(p.pagina) : 1;
  return {
    aba: p.aba ?? 'minhas',
    q: (p.q ?? '').trim().slice(0, MAX_BUSCA),
    urgente: !!p.urgente,
    pagina: Math.max(1, pagina),
  };
}

/**
 * A fila de `/cotacoes` (spec 0021): busca, "Só urgentes", páginas de 25 e a
 * contagem de cada aba. Nas abas de trâmite a ordem é "Mais tempo na etapa"
 * (o conjunto é pequeno: busca os ids, agrega o "desde" e pagina depois de
 * ordenar); em `todas`, `updatedAt` decrescente no banco. Página além do
 * total vai para a última. `null` quando a pessoa não tem acesso.
 */
export async function listarFila(
  sessao: Sessao,
  pedido: AbaFila | PedidoFila,
  agora: Date = new Date(),
): Promise<Fila | null> {
  const papeis = await papeisDe(sessao.userId, sessao.role);
  const trf1 = papeis.ladoTrf1 || papeis.leitorAdmin;
  if (!trf1 && !papeis.contratada) return null;
  const p = normalizarPedido(pedido);
  const abas = abasDaFila(trf1);
  const aba: AbaFila = (abas as readonly string[]).includes(p.aba) ? (p.aba as AbaFila) : 'minhas';

  const busca = await condicaoDaBusca(p.q);
  const urgente = p.urgente ? { 'urgencia.pedida': true } : null;
  const filtroDe = (a: AbaFila) =>
    juntar([...condicoesDaAba(a, papeis, trf1, agora), busca, urgente]);

  const contagens: Partial<Record<AbaFila, number>> = Object.fromEntries(
    await Promise.all(
      abas.map(async (a) => [a, await CotacaoMaterialModel.countDocuments(filtroDe(a))] as const),
    ),
  );
  const total = contagens[aba] ?? 0;
  const ultima = Math.max(1, Math.ceil(total / POR_PAGINA_FILA));
  const pagina = Math.min(p.pagina, ultima);
  const inicio = (pagina - 1) * POR_PAGINA_FILA;
  const filtro = filtroDe(aba);

  let docs: DocDaLinha[];
  let desde: Map<string, DesdeDaEtapa>;
  if (ABAS_DE_TRAMITE.includes(aba)) {
    const todos = await CotacaoMaterialModel.find(filtro)
      .select('_id createdAt')
      .lean<{ _id: Types.ObjectId; createdAt: Date }[]>();
    desde = await desdeDaEtapa(todos.map((d) => d._id));
    const chave = (d: { _id: Types.ObjectId; createdAt: Date }) =>
      (desde.get(String(d._id))?.desde ?? d.createdAt).getTime();
    const daPagina = todos
      .sort((a, b) => chave(a) - chave(b) || String(a._id).localeCompare(String(b._id)))
      .slice(inicio, inicio + POR_PAGINA_FILA)
      .map((d) => d._id);
    const lidos = await CotacaoMaterialModel.find({ _id: { $in: daPagina } })
      .select(CAMPOS_DA_LINHA)
      .lean<DocDaLinha[]>();
    const porId = new Map(lidos.map((d) => [String(d._id), d]));
    docs = daPagina.map((id) => porId.get(String(id))).filter((d): d is DocDaLinha => !!d);
  } else {
    docs = await CotacaoMaterialModel.find(filtro)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(inicio)
      .limit(POR_PAGINA_FILA)
      .select(CAMPOS_DA_LINHA)
      .lean<DocDaLinha[]>();
    desde = await desdeDaEtapa(docs.map((d) => d._id));
  }

  return {
    trf1,
    aba,
    abas,
    q: p.q,
    urgente: p.urgente,
    total,
    pagina,
    porPagina: POR_PAGINA_FILA,
    contagens,
    papeis: papeis.designacoes.map((d) => d.papel),
    linhas: await montarLinhas(docs, desde, trf1, agora),
  };
}

export type ResumoFila =
  | {
      lado: 'trf1';
      esperandoVoce: number;
      emAprovacao: { qtd: number; valorCentavos: number };
      atesteAtrasado: number;
      /** `null` sem empenho elegível: a tela não mostra zero no lugar. */
      saldoElegivelCentavos: number | null;
    }
  | { lado: 'contratada'; esperandoVoce: number; devolvidas: number; nfPendente: number };

/**
 * O resumo do topo da fila (spec 0021, AC-2), global por papel: ignora a
 * busca e o "Só urgentes". O lado TRF1 (inclusive o Admin leitor sem
 * designação) vê valor e saldo; a contratada só contagens, nunca valor. Sem
 * papel nenhum, zeros.
 */
export async function resumoDaFila(sessao: Sessao, agora: Date = new Date()): Promise<ResumoFila> {
  const papeis = await papeisDe(sessao.userId, sessao.role);
  const trf1 = papeis.ladoTrf1 || papeis.leitorAdmin;
  if (!trf1 && !papeis.contratada) {
    return { lado: 'contratada', esperandoVoce: 0, devolvidas: 0, nfPendente: 0 };
  }
  const visivel = (extra: Record<string, unknown>) =>
    juntar([...condicoesDaAba('todas', papeis, trf1, agora), extra]);
  const esperandoVoce = CotacaoMaterialModel.countDocuments(
    juntar(condicoesDaAba('minhas', papeis, trf1, agora)),
  );
  if (!trf1) {
    const [esperando, devolvidas, nfPendente] = await Promise.all([
      esperandoVoce,
      CotacaoMaterialModel.countDocuments(visivel({ situacao: 'devolvida' })),
      CotacaoMaterialModel.countDocuments(visivel({ ...FILTRO_NOTA_FISCAL_PENDENTE })),
    ]);
    return { lado: 'contratada', esperandoVoce: esperando, devolvidas, nfPendente };
  }
  const [esperando, emAprovacao, executadas, elegiveis] = await Promise.all([
    esperandoVoce,
    CotacaoMaterialModel.aggregate<{ qtd: number; valor: number }>([
      { $match: { situacao: 'em_aprovacao' } },
      { $group: { _id: null, qtd: { $sum: 1 }, valor: { $sum: '$valorTotalCentavos' } } },
    ]),
    CotacaoMaterialModel.find({ situacao: 'executada' })
      .select('situacao executadoEm recebimentoProvisorio')
      .lean<Pick<DocDaLinha, 'situacao' | 'executadoEm' | 'recebimentoProvisorio'>[]>(),
    empenhosElegiveis(agora),
  ]);
  return {
    lado: 'trf1',
    esperandoVoce: esperando,
    emAprovacao: { qtd: emAprovacao[0]?.qtd ?? 0, valorCentavos: emAprovacao[0]?.valor ?? 0 },
    // O mesmo `prazoDoAteste` que gera o selo da linha.
    atesteAtrasado: executadas.filter((d) => prazoDoAteste(d, agora)?.atrasado).length,
    saldoElegivelCentavos: elegiveis.length
      ? elegiveis.reduce((s, e) => s + e.saldoCentavos, 0)
      : null,
  };
}
