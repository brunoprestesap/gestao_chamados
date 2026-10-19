import 'server-only';

import { Types } from 'mongoose';

import { ArquivoCotacaoModel } from '@/models/ArquivoCotacao';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import { EmpenhoModel } from '@/models/Empenho';
import { UserModel } from '@/models/user.model';
import { type SituacaoCotacao, SITUACOES_EDITAVEIS } from '@/shared/material/material.constants';

import {
  aprovadoresQueCobrem,
  type Designado,
  limiteDoAprovador,
  type Papeis,
  papeisDe,
} from './papeis';
import {
  FILTRO_PENDENCIA_DA_CONTRATADA,
  filtroVisivelParaContratada,
  pendenciaDaContratada,
} from './pendencia';
import { type PrazoAteste, prazoDoAteste } from './prazos';
import { type EmpenhoElegivel, empenhosElegiveis } from './saldo';
import {
  type ArquivoBruto,
  type CotacaoBruta,
  type CotacaoDTO,
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
  return {
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
    cancelar: (rt || papeis.tem('gestor')) && cot.emTramite,
    executar: ehTecnicoAtribuido && s === 'autorizada',
    receberProvisorio: papeis.tem('gestor') && s === 'executada' && !cot.recebimentoProvisorio,
    receberDefinitivo: papeis.tem('gestor') && s === 'executada' && !!cot.recebimentoProvisorio,
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
  /** Só TRF1. */
  empenhosElegiveis?: EmpenhoElegivel[];
  empenhoNumero?: string | null;
  aprovadoresQueCobrem?: Designado[];
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
  const detalhe: DetalheCotacao = {
    cotacao: serializarCotacao(cot, visao, sessao, await extras(cot)),
    acoes: acoesDisponiveis(cot, papeis, ehTecnicoAtribuido),
    chamado: {
      id: String(chamado._id),
      numero: chamado.ticket_number,
      titulo: chamado.titulo,
      status: chamado.status,
      ativo: ativo ? `${ativo.codigo} · ${ativo.descricao}` : null,
    },
  };
  if (visao === 'trf1') {
    detalhe.empenhosElegiveis = await empenhosElegiveis();
    detalhe.aprovadoresQueCobrem = await aprovadoresQueCobrem(cot.valorTotalCentavos);
    if (cot.empenhoId) {
      const emp = await EmpenhoModel.findById(cot.empenhoId).select('numero').lean();
      detalhe.empenhoNumero = emp?.numero ?? null;
    }
  }
  return detalhe;
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

export type LinhaFila = {
  id: string;
  numero: string;
  chamadoId: string;
  chamadoNumero: string;
  ativo: string | null;
  situacao: SituacaoCotacao;
  /** Só TRF1. */
  valorCentavos: number | null;
  atualizadaEm: string;
  criadaEm: string;
  urgente: boolean;
  /** Selo de atraso do ateste, só em `executada` e só no lado TRF1 (AC-21). */
  prazoAteste: PrazoAteste | null;
  /** Datas do recebimento provisório e do definitivo, sem o nome de quem recebeu. */
  recebimentoProvisorioEm: string | null;
  recebimentoDefinitivoEm: string | null;
  /** A atestada ainda sem nota fiscal (AC-22). */
  notaFiscalPendente: boolean;
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
  // A contratada ainda deve a nota fiscal da atestada (AC-22).
  if (papeis.tem('responsavel_tecnico')) ou.push({ ...FILTRO_PENDENCIA_DA_CONTRATADA });
  return { $or: ou };
}

/** A fila de `/cotacoes`. `null` quando a pessoa não tem acesso. */
export async function listarFila(
  sessao: Sessao,
  abaPedida: AbaFila,
): Promise<{
  linhas: LinhaFila[];
  trf1: boolean;
  papeis: string[];
  aba: AbaFila;
  abas: readonly AbaFila[];
} | null> {
  const papeis = await papeisDe(sessao.userId, sessao.role);
  const trf1 = papeis.ladoTrf1 || papeis.leitorAdmin;
  if (!trf1 && !papeis.contratada) return null;
  const abas = abasDaFila(trf1);
  if (!abas.includes(abaPedida)) abaPedida = 'minhas';
  const aba = abaPedida;

  const filtro: Record<string, unknown> = {};
  const e: Record<string, unknown>[] = [];
  if (aba === 'minhas') e.push(filtroDoQueEspera(papeis));
  if (aba === 'analise') filtro.situacao = { $in: ['enviada', 'em_analise'] };
  if (aba === 'aprovacao') filtro.situacao = 'em_aprovacao';
  if (aba === 'ateste') {
    // A contratada acompanha o recebimento e a nota fiscal que ela ainda deve (AC-21, AC-22).
    if (trf1) filtro.situacao = 'executada';
    else e.push({ $or: [{ situacao: 'executada' }, { ...FILTRO_PENDENCIA_DA_CONTRATADA }] });
  }
  if (trf1 && !papeis.contratada && filtro.situacao === undefined) {
    // O rascunho não aparece para fiscal, aprovador nem gestor (AC-1).
    filtro.situacao = { $ne: 'rascunho' };
  }
  if (!trf1) {
    // Contratada: em trâmite, encerradas nos últimos 90 dias (AC-15) e a atestada
    // que ainda deve a nota fiscal, por mais velha que seja (AC-22). Mesma regra de `visaoDe`.
    e.push(filtroVisivelParaContratada(new Date()));
  }
  if (e.length) filtro.$and = e;
  const docs = await CotacaoMaterialModel.find(filtro)
    .sort({ updatedAt: -1 })
    .limit(200)
    .select(
      'numero chamadoId ativoId situacao valorTotalCentavos executadoEm recebimentoProvisorio recebimentoDefinitivo notaFiscal updatedAt createdAt',
    )
    .lean();
  const chamados = await ChamadoModel.find({ _id: { $in: docs.map((d) => d.chamadoId) } })
    .select('ticket_number')
    .lean();
  const numero = new Map(chamados.map((c) => [String(c._id), c.ticket_number as string]));
  const ativoIds = docs.map((d) => d.ativoId).filter((a): a is Types.ObjectId => !!a);
  const ativos = ativoIds.length
    ? await AtivoModel.find({ _id: { $in: ativoIds } })
        .select('codigo')
        .lean()
    : [];
  const codigo = new Map(ativos.map((a) => [String(a._id), a.codigo as string]));
  return {
    trf1,
    aba,
    abas,
    papeis: papeis.designacoes.map((d) => d.papel),
    linhas: docs.map((d) => ({
      id: String(d._id),
      numero: d.numero,
      chamadoId: String(d.chamadoId),
      chamadoNumero: numero.get(String(d.chamadoId)) ?? '',
      ativo: d.ativoId ? (codigo.get(String(d.ativoId)) ?? null) : null,
      situacao: d.situacao as SituacaoCotacao,
      valorCentavos: trf1 ? d.valorTotalCentavos : null,
      atualizadaEm: d.updatedAt.toISOString(),
      criadaEm: d.createdAt.toISOString(),
      // Urgência é da fatia 4.
      urgente: false,
      prazoAteste: !trf1
        ? null
        : prazoDoAteste({
            situacao: d.situacao as SituacaoCotacao,
            executadoEm: d.executadoEm,
            recebimentoProvisorio: d.recebimentoProvisorio,
          }),
      recebimentoProvisorioEm: d.recebimentoProvisorio?.em?.toISOString() ?? null,
      recebimentoDefinitivoEm: d.recebimentoDefinitivo?.em?.toISOString() ?? null,
      notaFiscalPendente: pendenciaDaContratada({
        situacao: d.situacao as SituacaoCotacao,
        notaFiscal: d.notaFiscal,
      }),
    })),
  };
}
