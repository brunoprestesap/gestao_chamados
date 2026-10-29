import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { lerMaterialConfig } from '@/lib/material/config';
import { calcularFornecimentoAte } from '@/lib/material/fornecimento';
import { ArquivoCotacaoModel } from '@/models/ArquivoCotacao';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { ContadorModel } from '@/models/Contador';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialEventoModel } from '@/models/CotacaoMaterialEvento';
import { CotacaoMaterialTentativaModel } from '@/models/CotacaoMaterialTentativa';
import { EmpenhoModel } from '@/models/Empenho';
import { UserModel } from '@/models/user.model';
import {
  type CriarCotacaoInput,
  idsRepetidosDoRascunho,
  type OrcamentoRascunhoInput,
  type ReferenciaEntrada,
  type SalvarRascunhoInput,
} from '@/shared/material/cotacao.schemas';
import {
  type AcaoCotacao,
  ACOES_COM_ADVERTENCIAS_DO_ATO,
  type BaseDeAmbas,
  estaEmTramite,
  MAX_ORCAMENTOS_COTACAO,
  MAX_REFERENCIAS_POR_PAPEL,
  type PapelEvento,
  type SituacaoCotacao,
  SITUACOES_EDITAVEIS,
  SITUACOES_EM_TRAMITE,
} from '@/shared/material/material.constants';
import {
  type CodigoControle,
  type CodigoErroNotaFiscal,
  CODIGOS_ADVERTENCIA_DO_ATO,
  CONTROLES,
  erroCnpjDoOrcamento,
  ERROS_FATIA4,
  ERROS_NOTA_FISCAL,
  MSG_APROVACAO_EM_ANDAMENTO,
  MSG_ITEM_CITADO_POR_ORCAMENTO,
  MSG_VERSAO_DESATUALIZADA,
} from '@/shared/material/mensagens';
import {
  type ItemParaTotal,
  menorPrecoDoItem,
  valorDaLinhaCentavos,
  valorTotalCentavos,
} from '@/shared/material/valores';

import { advertenciasDoAto } from './advertencias';
import { avisarNotaFiscal, avisarPesquisaCompleta, avisarSituacao } from './avisos';
import {
  desfazerPausa,
  pausarPelaCotacao,
  registrarNoChamado,
  retomarPelaCotacao,
} from './chamado';
import {
  advertenciasDePreco,
  daFaseEnvio,
  defeitoDoCnpj,
  doCaminho3,
  ehAdvertenciaRecalculada,
  impedimentosDeEnvio,
  impedimentosDoEncaminhar,
  itensComPesquisaDivergente,
  itensComVariacaoAcima,
  orcamentosVencidos,
  pesquisaCompleta,
} from './controles';
import { limiteDoAprovador, type Papeis, papeisDe } from './papeis';
import {
  carregarTabelas,
  codigosDosItens,
  copiaParaDocumento,
  derivarOrigem,
  escolhaGravada,
  type MarcaAnomalia,
  marcasDeConferencia,
  SEM_TABELA,
} from './precos';
import { calcularProjecaoDoEmpenho, consomeParcelaRelevante, type Projecao } from './projecao';
import {
  copiaDaReferenciaSinapi,
  montarReferencias,
  type ReferenciaDoc,
  referenciaNoAto,
} from './referencias';
import {
  ajustar,
  conciliarReservas,
  haSaldoElegivel,
  liberar,
  reservar,
  temReserva,
} from './saldo';

/**
 * Máquina de estados da cotação de material (spec 0019). Toda ação passa por
 * `transicionar`, nesta ordem: confere papel, situação e impedimentos; no
 * `aprovar`, reserva o saldo; grava a cotação de forma condicional pela
 * `versao`; grava o evento (e desfaz a cotação e a reserva se ele falhar);
 * só então aplica os efeitos no chamado e manda os avisos.
 */

export type Ator =
  | { tipo: 'usuario'; userId: string; role: string }
  | { tipo: 'sistema'; userId: string | null };

export type ResultadoMaterial<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; impedimentos?: CodigoControle[] };

type AcaoDeTransicao = Exclude<AcaoCotacao, 'criar' | 'salvar'>;

const DE: Record<AcaoDeTransicao, readonly SituacaoCotacao[]> = {
  enviar: ['rascunho', 'devolvida'],
  assumir: ['enviada'],
  devolver: ['em_analise', 'em_aprovacao'],
  reprovar: ['em_analise', 'em_aprovacao'],
  encaminhar: ['em_analise'],
  aprovar: ['em_aprovacao'],
  alterar: ['autorizada'],
  executar: ['autorizada'],
  receber_provisorio: ['executada'],
  receber_definitivo: ['executada'],
  registrar_nf: ['atestada'],
  cancelar: SITUACOES_EM_TRAMITE,
  referencia_acrescentada: ['em_analise'],
  referencia_retirada: ['em_analise'],
  urgencia_recusada: ['em_analise'],
  pesquisa_completada: ['autorizada', 'executada'],
};

/** Ações que mantêm a situação: o `PARA` delas é a própria situação de origem. */
const MANTEM_SITUACAO: readonly AcaoDeTransicao[] = [
  'receber_provisorio',
  'registrar_nf',
  'referencia_acrescentada',
  'referencia_retirada',
  'pesquisa_completada',
];

const PARA: Record<AcaoDeTransicao, SituacaoCotacao> = {
  enviar: 'enviada',
  assumir: 'em_analise',
  devolver: 'devolvida',
  reprovar: 'reprovada',
  encaminhar: 'em_aprovacao',
  aprovar: 'autorizada',
  alterar: 'devolvida',
  executar: 'executada',
  receber_provisorio: 'executada',
  receber_definitivo: 'atestada',
  registrar_nf: 'atestada',
  cancelar: 'cancelada',
  referencia_acrescentada: 'em_analise',
  referencia_retirada: 'em_analise',
  urgencia_recusada: 'devolvida',
  // Vale para `autorizada` e `executada`: ver `MANTEM_SITUACAO`.
  pesquisa_completada: 'autorizada',
};

const MOTIVO_OBRIGATORIO: readonly AcaoDeTransicao[] = [
  'devolver',
  'reprovar',
  'cancelar',
  'urgencia_recusada',
];

/** Ações que devolvem a cotação para a contratada e limpam a análise (AC-34, AC-35). */
const DEVOLVEM: readonly AcaoDeTransicao[] = ['devolver', 'urgencia_recusada', 'alterar'];

type UrgenciaLida = {
  pedida: boolean;
  justificativa: string;
  pedidaEm: Date;
  decisao: 'aceita' | 'recusada' | null;
  decididaPorUserId: Types.ObjectId | null;
  decididaEm: Date | null;
  motivoRecusa: string | null;
  pesquisaCompletaEm: Date | null;
};

/**
 * Na devolução (comum, pela recusa ou pelo `alterar`), a aceitação da
 * urgência e `pesquisaCompletaEm` saem; a recusa nunca sai (AC-35).
 */
function urgenciaDevolvida(u: UrgenciaLida | null | undefined): UrgenciaLida | null {
  if (!u) return null;
  const limpaDecisao = u.decisao === 'aceita';
  return {
    ...u,
    decisao: limpaDecisao ? null : u.decisao,
    decididaPorUserId: limpaDecisao ? null : u.decididaPorUserId,
    decididaEm: limpaDecisao ? null : u.decididaEm,
    pesquisaCompletaEm: null,
  };
}

/**
 * A data da nota fiscal (AC-22), em dias `YYYY-MM-DD` de Belém, com os dois
 * limites aceitando o próprio dia: nunca depois de hoje, nunca antes do dia
 * da autorização (a contratada compra depois de autorizada). A data
 * impossível já foi recusada no schema. `null` quando a data passa.
 */
export function recusaDaDataDaNotaFiscal(
  data: string,
  autorizadoEm: Date | null,
  agora: Date,
): Extract<CodigoErroNotaFiscal, 'data_futura' | 'data_antes_da_autorizacao'> | null {
  if (data > hojeEmBelem(agora)) return 'data_futura';
  if (autorizadoEm && data < hojeEmBelem(autorizadoEm)) return 'data_antes_da_autorizacao';
  return null;
}

type CotacaoLida = Awaited<ReturnType<typeof lerCotacao>>;

async function lerCotacao(id: string) {
  return CotacaoMaterialModel.findById(id).lean<{
    _id: Types.ObjectId;
    numero: string;
    chamadoId: Types.ObjectId;
    ativoId?: Types.ObjectId | null;
    situacao: SituacaoCotacao;
    versao: number;
    itens: {
      _id: Types.ObjectId;
      descricao: string;
      unidade: string;
      quantidade: number;
      motivo: string;
      doDiagnostico: boolean;
      origem: string | null;
      baseAplicada: string | null;
      precoAplicadoCentavos: number | null;
      quantidadeExecutada: number | null;
      valorExecutadoCentavos: number | null;
      anexoVItemId?: Types.ObjectId | null;
      anexoVNumero?: number | null;
      anexoVVersao?: number | null;
      anexoVPrecoCentavos?: number | null;
      sinapiCodigo?: string | null;
      sinapiReferencia?: string | null;
      sinapiPrecoCentavos?: number | null;
      justificativaBase?: string | null;
      conferencia?: { texto: string; porUserId: Types.ObjectId; em: Date } | null;
      referencias?: ReferenciaDoc[];
    }[];
    orcamentos: {
      _id: Types.ObjectId;
      fornecedor: string;
      cnpj: string;
      data: Date;
      validade: Date | null;
      arquivoId: Types.ObjectId;
      precos: { itemId: Types.ObjectId; valorUnitarioCentavos: number }[];
      fase?: 'envio' | 'complemento' | null;
    }[];
    montadoPorUserId: Types.ObjectId | null;
    fiscalUserId: Types.ObjectId | null;
    diagnosticadoPorUserId: Types.ObjectId;
    valorTotalCentavos: number;
    advertencias: {
      codigo: string;
      itemId: Types.ObjectId | null;
      orcamentoId?: Types.ObjectId | null;
      confirmadaPorUserId?: Types.ObjectId | null;
      em: Date;
    }[];
    urgencia?: UrgenciaLida | null;
    valorAutorizadoCentavos: number | null;
    valorExecutadoCentavos: number | null;
    empenhoId: Types.ObjectId | null;
    autorizadoEm: Date | null;
    fornecimentoAte?: Date | null;
    recebimentoProvisorio: { porUserId: Types.ObjectId; em: Date } | null;
    recebimentoDefinitivo: { porUserId: Types.ObjectId; em: Date } | null;
    notaFiscal: { numero: string } | null;
    pauseLogId: Types.ObjectId | null;
  }>();
}

/** Quem é o ator naquela etapa, ou o impedimento que o barra. */
function papelDoAto(
  acao: AcaoDeTransicao,
  de: SituacaoCotacao,
  ator: Ator,
  papeis: Papeis | null,
  ehTecnicoAtribuido: boolean,
  rascunhoSoDoTecnico: boolean,
): PapelEvento | null {
  if (ator.tipo === 'sistema') return acao === 'cancelar' ? 'sistema' : null;
  const tem = (p: Parameters<Papeis['tem']>[0]) => !!papeis?.tem(p);
  switch (acao) {
    case 'enviar':
    case 'alterar':
    case 'pesquisa_completada':
      return tem('responsavel_tecnico') ? 'responsavel_tecnico' : null;
    case 'assumir':
    case 'encaminhar':
    case 'referencia_acrescentada':
    case 'referencia_retirada':
    case 'urgencia_recusada':
      return tem('fiscal') ? 'fiscal' : null;
    case 'devolver':
    case 'reprovar':
      if (de === 'em_aprovacao' && tem('aprovador')) return 'aprovador';
      return tem('fiscal') ? 'fiscal' : null;
    case 'aprovar':
      return tem('aprovador') ? 'aprovador' : null;
    case 'executar':
      return ehTecnicoAtribuido ? 'tecnico' : null;
    case 'receber_provisorio':
    case 'receber_definitivo':
      return tem('gestor') ? 'gestor' : null;
    case 'registrar_nf':
      return tem('responsavel_tecnico') ? 'responsavel_tecnico' : null;
    case 'cancelar':
      if (tem('responsavel_tecnico')) return 'responsavel_tecnico';
      if (tem('gestor')) return 'gestor';
      // O técnico atribuído descarta o rascunho enquanto ele é só dele, a mesma
      // janela em que edita o diagnóstico (AC-1).
      return ehTecnicoAtribuido && rascunhoSoDoTecnico ? 'tecnico' : null;
  }
}

export { impedimentosDeEnvio } from './controles';

/** Os orçamentos que formam o preço: o `complemento` da urgência nunca entra (AC-35). */
function orcamentosParaPreco(c: NonNullable<CotacaoLida>) {
  return c.orcamentos.filter(daFaseEnvio).map((o) => ({
    cnpj: o.cnpj,
    precos: o.precos.map((p) => ({
      itemId: String(p.itemId),
      valorUnitarioCentavos: p.valorUnitarioCentavos,
    })),
  }));
}

async function nomeDe(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const u = await UserModel.findById(userId).select('name').lean();
  return (u?.name as string | undefined) ?? null;
}

async function gerarNumero(agora: Date): Promise<string> {
  const ano = agora.getFullYear();
  const doc = await ContadorModel.findOneAndUpdate(
    { _id: `cotacao_material_${ano}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  ).lean<{ seq: number }>();
  if (!doc) throw new Error('Contador de número de cotação indisponível.');
  return `COT-${ano}-${String(doc.seq).padStart(4, '0')}`;
}

async function localDoAtivo(ativoId: Types.ObjectId | null | undefined) {
  if (!ativoId) return null;
  const a = await AtivoModel.findById(ativoId).select('localizacaoId').lean();
  return (a?.localizacaoId as Types.ObjectId | null | undefined) ?? null;
}

/** A cópia de cada item no evento: origem, as duas bases, a escolha, a conferência e a marca. */
function itensNoAto(
  itens: NonNullable<CotacaoLida>['itens'],
  marcas: ReadonlyMap<string, MarcaAnomalia> = new Map(),
) {
  return itens.map((i) => ({
    itemId: i._id,
    descricao: i.descricao,
    quantidade: i.quantidade,
    origem: i.origem,
    baseAplicada: i.baseAplicada,
    precoAplicadoCentavos: i.precoAplicadoCentavos,
    quantidadeExecutada: i.quantidadeExecutada,
    anexoVNumero: i.anexoVNumero ?? null,
    anexoVVersao: i.anexoVVersao ?? null,
    anexoVPrecoCentavos: i.anexoVPrecoCentavos ?? null,
    sinapiCodigo: i.sinapiCodigo ?? null,
    sinapiReferencia: i.sinapiReferencia ?? null,
    sinapiPrecoCentavos: i.sinapiPrecoCentavos ?? null,
    justificativaBase: i.justificativaBase ?? null,
    conferencia: i.conferencia?.texto ?? null,
    marcaAnomalia: marcas.get(String(i._id)) ?? null,
    referencias: (i.referencias ?? []).map(referenciaNoAto),
  }));
}

/** Os campos de tabela que o item guarda entre a classificação e o envio. */
const CAMPOS_DE_TABELA = [
  'origem',
  'anexoVItemId',
  'anexoVNumero',
  'anexoVVersao',
  'anexoVPrecoCentavos',
  'sinapiCodigo',
  'sinapiReferencia',
  'sinapiPrecoCentavos',
  'baseAplicada',
  'justificativaBase',
  'precoAplicadoCentavos',
] as const;

/** Item `ambas` volta a ter valor provisório: base, justificativa e preço saem (AC-27). */
function semBaseEscolhida<T extends { origem: string | null }>(i: T): T {
  return i.origem === 'ambas'
    ? { ...i, baseAplicada: null, justificativaBase: null, precoAplicadoCentavos: null }
    : i;
}

/**
 * Deriva de novo a origem de cada item no envio (AC-26): copia o Anexo V do
 * item vigente de mesmo número e o SINAPI do mês mais recente; a partir daí
 * as cópias congelam. O caminho 3 fica com o menor orçamento.
 */
async function itensDoEnvio(
  cot: NonNullable<CotacaoLida>,
  tipoServico: string,
  agora: Date,
): Promise<{
  itens: NonNullable<CotacaoLida>['itens'];
  desatualizado: boolean;
  referenciaDesatualizada: boolean;
}> {
  // As referências SINAPI da contratada são recopiadas do mês mais recente (AC-32).
  const codigosDasReferencias = cot.itens.flatMap((i) =>
    (i.referencias ?? [])
      .filter((r) => r.tipo === 'sinapi' && r.papel === 'responsavel_tecnico' && r.sinapiCodigo)
      .map((r) => r.sinapiCodigo!),
  );
  const tabelas = await carregarTabelas(
    tipoServico,
    [...codigosDosItens(cot.itens), ...codigosDasReferencias],
    agora,
  );
  const paraPreco = orcamentosParaPreco(cot);
  let desatualizado = false;
  let referenciaDesatualizada = false;
  const itens = cot.itens.map((i) => {
    const escolha = escolhaGravada(i);
    const base = { ...i, conferencia: null };
    if (!escolha) {
      const referencias = (i.referencias ?? []).map((r) => {
        if (r.tipo !== 'sinapi' || r.papel !== 'responsavel_tecnico') return r;
        const insumo = r.sinapiCodigo ? tabelas.sinapi.get(r.sinapiCodigo) : undefined;
        if (!insumo || !tabelas.mes) {
          referenciaDesatualizada = true;
          return r;
        }
        return { ...r, ...copiaDaReferenciaSinapi(insumo, tabelas.mes) };
      });
      return {
        ...base,
        ...SEM_TABELA,
        origem: 'orcamento',
        baseAplicada: 'orcamento',
        precoAplicadoCentavos: menorPrecoDoItem(String(i._id), paraPreco),
        referencias,
      };
    }
    const d = derivarOrigem(escolha, tabelas);
    if (!d.ok) {
      desatualizado = true;
      return base;
    }
    return { ...base, ...copiaParaDocumento(d.copia) };
  });
  return {
    itens: itens as NonNullable<CotacaoLida>['itens'],
    desatualizado,
    referenciaDesatualizada,
  };
}

/** As referências do fiscal num item, e o mapa das gravadas da contratada por id. */
function referenciasPorPapel(refs: readonly ReferenciaDoc[] | undefined) {
  const todas = refs ?? [];
  return {
    doFiscal: todas.filter((r) => r.papel === 'fiscal'),
    daContratada: todas.filter((r) => r.papel !== 'fiscal'),
  };
}

/**
 * As referências da contratada de cada item, da entrada do salvar (AC-32):
 * `referencias` ausente mantém as gravadas, e a lista troca só as dela. As
 * do fiscal ficam sempre. Item classificado nos caminhos 1 e 2 fica só com
 * as do fiscal. Nunca lança.
 */
async function referenciasDoSalvar(
  entrada: SalvarRascunhoInput['itens'],
  atuais: ReadonlyMap<string, NonNullable<CotacaoLida>['itens'][number]>,
  autor: { userId: string; agora: Date },
): Promise<{ ok: true; porItem: Map<string, ReferenciaDoc[]> } | { ok: false; error: string }> {
  const porItem = new Map<string, ReferenciaDoc[]>();
  for (const i of entrada) {
    const atual = atuais.get(i.id);
    const { doFiscal, daContratada } = referenciasPorPapel(atual?.referencias);
    const daTabela = !!atual?.origem && atual.origem !== 'orcamento';
    if (daTabela) {
      porItem.set(i.id, doFiscal);
      continue;
    }
    if (i.referencias === undefined) {
      porItem.set(i.id, [...daContratada, ...doFiscal]);
      continue;
    }
    const idsDoFiscal = new Set(doFiscal.map((r) => String(r._id)));
    if (i.referencias.some((r) => idsDoFiscal.has(r.id))) {
      return { ok: false, error: ERROS_FATIA4.referencia_repetida };
    }
    const montadas = await montarReferencias(
      i.referencias,
      { userId: autor.userId, papel: 'responsavel_tecnico', agora: autor.agora },
      new Map(daContratada.map((r) => [String(r._id), r])),
    );
    if (!montadas.ok) return montadas;
    porItem.set(i.id, [...montadas.referencias, ...doFiscal]);
  }
  return { ok: true, porItem };
}

/** O orçamento da entrada em forma de documento. */
function orcamentoParaDocumento(o: OrcamentoRascunhoInput, fase: 'envio' | 'complemento') {
  return {
    _id: new Types.ObjectId(o.id),
    fornecedor: o.fornecedor,
    cnpj: o.cnpj,
    data: new Date(`${o.data}T12:00:00.000Z`),
    validade: o.validade ? new Date(`${o.validade}T12:00:00.000Z`) : null,
    arquivoId: new Types.ObjectId(o.arquivoId),
    precos: o.precos.map((p) => ({
      itemId: new Types.ObjectId(p.itemId),
      valorUnitarioCentavos: p.valorUnitarioCentavos,
    })),
    fase,
  };
}

// ---------------------------------------------------------------------------
// criar e salvar
// ---------------------------------------------------------------------------

/** O técnico atribuído registra o material do diagnóstico (AC-1). */
export async function criarCotacao(
  ator: { userId: string },
  entrada: CriarCotacaoInput,
): Promise<ResultadoMaterial<{ id: string }>> {
  const chamado = await ChamadoModel.findById(entrada.chamadoId)
    .select('status assignedToUserId ativoId')
    .lean();
  if (!chamado) return { ok: false, error: 'Chamado não encontrado.' };
  if (String(chamado.assignedToUserId ?? '') !== ator.userId) {
    return { ok: false, error: 'Só o técnico atribuído registra o material deste chamado.' };
  }
  if (chamado.status !== 'em atendimento') {
    return { ok: false, error: 'O material só é registrado com o chamado em atendimento.' };
  }
  const existente = await CotacaoMaterialModel.exists({
    chamadoId: chamado._id,
    emTramite: true,
  });
  if (existente) return { ok: false, error: 'Este chamado já tem uma cotação em trâmite.' };
  // A anterior (RN-16) é do mesmo chamado e já saiu do trâmite.
  if (
    entrada.cotacaoAnteriorId &&
    !(await CotacaoMaterialModel.exists({
      _id: new Types.ObjectId(entrada.cotacaoAnteriorId),
      chamadoId: chamado._id,
      emTramite: false,
    }))
  ) {
    return {
      ok: false,
      error: 'A cotação anterior citada não é deste chamado ou ainda está em trâmite.',
    };
  }

  const agora = new Date();
  const numero = await gerarNumero(agora);
  const localizacaoId = await localDoAtivo(chamado.ativoId as Types.ObjectId | null);
  let cot;
  try {
    cot = await CotacaoMaterialModel.create({
      numero,
      chamadoId: chamado._id,
      ativoId: chamado.ativoId ?? null,
      localizacaoId,
      situacao: 'rascunho',
      emTramite: true,
      versao: 1,
      cotacaoAnteriorId: entrada.cotacaoAnteriorId
        ? new Types.ObjectId(entrada.cotacaoAnteriorId)
        : null,
      itens: entrada.itens.map((i) => ({ ...i, doDiagnostico: true })),
      diagnosticadoPorUserId: new Types.ObjectId(ator.userId),
      diagnosticadoEm: agora,
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      return { ok: false, error: 'Este chamado já tem uma cotação em trâmite.' };
    }
    throw e;
  }

  try {
    await CotacaoMaterialEventoModel.create({
      cotacaoId: cot._id,
      de: null,
      para: 'rascunho',
      acao: 'criar',
      autorUserId: new Types.ObjectId(ator.userId),
      autorNome: await nomeDe(ator.userId),
      papel: 'tecnico',
      parametrosNoAto: await lerMaterialConfig(),
      itensNoAto: itensNoAto(cot.toObject().itens as NonNullable<CotacaoLida>['itens']),
      em: agora,
    });
  } catch (e) {
    await CotacaoMaterialModel.deleteOne({ _id: cot._id, versao: 1 }).catch(() => {});
    throw e;
  }

  void avisarSituacao(String(cot._id), 'rascunho', ator.userId);
  return { ok: true, id: String(cot._id) };
}

/**
 * Salva o rascunho (AC-1). O técnico atribuído edita os itens do diagnóstico
 * só enquanto nenhum responsável técnico salvou; o responsável técnico
 * acrescenta itens e orçamentos, mas não remove nem altera descrição,
 * unidade e quantidade dos itens do diagnóstico.
 */
export async function salvarRascunho(
  ator: { userId: string; role: string },
  entrada: SalvarRascunhoInput,
): Promise<ResultadoMaterial<{ versao: number }>> {
  const cot = await lerCotacao(entrada.id);
  if (!cot) return { ok: false, error: 'Cotação não encontrada.' };
  if (!SITUACOES_EDITAVEIS.includes(cot.situacao)) {
    return { ok: false, error: 'Esta cotação não está mais em edição.' };
  }
  if (cot.versao !== entrada.versao) return { ok: false, error: MSG_VERSAO_DESATUALIZADA };
  // A trava do diagnóstico compara por id: id repetido a burlaria (AC-1).
  const repetido = idsRepetidosDoRascunho(entrada);
  if (repetido) return { ok: false, error: repetido };

  const papeis = await papeisDe(ator.userId, ator.role);
  const chamado = await ChamadoModel.findById(cot.chamadoId).select('assignedToUserId').lean();
  const ehTecnico = String(chamado?.assignedToUserId ?? '') === ator.userId;
  const ehRt = papeis.tem('responsavel_tecnico');

  const set: Record<string, unknown> = {};
  if (ehRt) {
    const atuais = new Map(cot.itens.map((i) => [String(i._id), i]));
    const novos = new Map(entrada.itens.map((i) => [i.id, i]));
    for (const i of cot.itens) {
      if (!i.doDiagnostico) continue;
      const n = novos.get(String(i._id));
      if (!n) return { ok: false, error: 'Item do diagnóstico não pode ser removido.' };
      if (
        n.descricao !== i.descricao ||
        n.unidade !== i.unidade ||
        Math.abs(n.quantidade - i.quantidade) > 1e-9
      ) {
        return {
          ok: false,
          error: 'Descrição, unidade e quantidade dos itens do diagnóstico não mudam.',
        };
      }
    }
    const ids = new Set(entrada.itens.map((i) => i.id));
    // Sem o campo, os orçamentos gravados ficam como estão (só os itens mudam).
    const manterOrcamentos = entrada.orcamentos === undefined;
    const orcamentos = entrada.orcamentos ?? [];
    // Mantidos, os orçamentos gravados não podem ficar citando item que saiu.
    if (
      manterOrcamentos &&
      cot.orcamentos.some((o) => o.precos.some((p) => !ids.has(String(p.itemId))))
    ) {
      return { ok: false, error: MSG_ITEM_CITADO_POR_ORCAMENTO };
    }
    const { raizCnpjContratada } = await lerMaterialConfig();
    for (const o of orcamentos) {
      if (o.precos.some((p) => !ids.has(p.itemId))) {
        return { ok: false, error: 'Um orçamento cita item que não está na cotação.' };
      }
      // O defeito do próprio orçamento é recusado já no salvar (AC-31).
      const defeito = defeitoDoCnpj(o.cnpj, raizCnpjContratada);
      if (defeito) return { ok: false, error: erroCnpjDoOrcamento(o.fornecedor, defeito) };
    }
    const referencias = await referenciasDoSalvar(entrada.itens, atuais, {
      userId: ator.userId,
      agora: new Date(),
    });
    if (!referencias.ok) return referencias;
    const arquivoIds = orcamentos.map((o) => o.arquivoId);
    if (arquivoIds.length > 0) {
      const validos = await ArquivoCotacaoModel.countDocuments({
        _id: { $in: arquivoIds.map((a) => new Types.ObjectId(a)) },
        cotacaoId: cot._id,
        tipo: 'orcamento',
        removidoEm: null,
      });
      if (validos !== new Set(arquivoIds).size) {
        return { ok: false, error: 'Anexe o arquivo de cada orçamento.' };
      }
    }
    const orcamentosDoc = orcamentos.map((o) => orcamentoParaDocumento(o, 'envio'));
    const paraPreco = manterOrcamentos
      ? orcamentosParaPreco(cot)
      : orcamentos.map((o) => ({ cnpj: o.cnpj, precos: o.precos }));
    const itens = entrada.itens.map((i) => {
      const atual = atuais.get(i.id);
      // O salvar reconstrói o item: as referências do fiscal e a conferência,
      // que não vêm da entrada, são carregadas do gravado (regras finas de 20/10).
      const comum = {
        _id: new Types.ObjectId(i.id),
        descricao: i.descricao,
        quantidade: i.quantidade,
        motivo: i.motivo,
        doDiagnostico: atual?.doDiagnostico ?? false,
        referencias: referencias.porItem.get(i.id) ?? [],
        conferencia: atual?.conferencia ?? null,
      };
      if (atual?.origem && atual.origem !== 'orcamento') {
        // Classificado nos caminhos 1 e 2: preço e unidade são da tabela (AC-26), e
        // só a classificação os muda.
        const tabela = Object.fromEntries(
          CAMPOS_DE_TABELA.map((c) => [c, (atual as Record<string, unknown>)[c] ?? null]),
        );
        return { ...comum, unidade: atual.unidade, ...tabela };
      }
      return {
        ...comum,
        unidade: i.unidade,
        origem: 'orcamento',
        baseAplicada: 'orcamento',
        precoAplicadoCentavos: menorPrecoDoItem(i.id, paraPreco),
      };
    });
    set.itens = itens;
    if (!manterOrcamentos) set.orcamentos = orcamentosDoc;
    set.valorTotalCentavos = valorTotalCentavos(itens as ItemParaTotal[]);
    if (!cot.montadoPorUserId) set.montadoPorUserId = new Types.ObjectId(ator.userId);
  } else if (ehTecnico) {
    if (cot.montadoPorUserId || cot.situacao !== 'rascunho') {
      return {
        ok: false,
        error: 'O responsável técnico já assumiu esta cotação; peça a ele a mudança.',
      };
    }
    set.itens = entrada.itens.map((i) => ({
      _id: new Types.ObjectId(i.id),
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: i.quantidade,
      motivo: i.motivo,
      doDiagnostico: true,
    }));
  } else {
    return { ok: false, error: 'Você não pode editar esta cotação.' };
  }

  const atualizado = await CotacaoMaterialModel.findOneAndUpdate(
    { _id: cot._id, situacao: cot.situacao, versao: cot.versao },
    { $set: set, $inc: { versao: 1 } },
    { returnDocument: 'after', projection: { versao: 1 }, runValidators: true },
  ).lean();
  if (!atualizado) return { ok: false, error: MSG_VERSAO_DESATUALIZADA };
  return { ok: true, versao: atualizado.versao };
}

// ---------------------------------------------------------------------------
// transicionar
// ---------------------------------------------------------------------------

export type EntradaTransicao = {
  cotacaoId: string;
  acao: AcaoDeTransicao;
  versao: number;
  ator: Ator;
  motivo?: string;
  empenhoId?: string;
  quantidades?: { itemId: string; quantidadeExecutada: number }[];
  notaFiscal?: { numero: string; data: string; arquivoId: string };
  /** Encaminhar (AC-27): a base de cada item `ambas`, com justificativa. */
  bases?: { itemId: string; base: BaseDeAmbas; justificativa: string }[];
  /** Encaminhar (AC-29): a conferência de cada item da lista obrigatória. */
  conferencias?: { itemId: string; texto: string }[];
  /** Enviar (AC-35): a urgência pedida, com justificativa no primeiro pedido. */
  urgencia?: { justificativa?: string };
  /** Encaminhar (AC-34): os orçamentos vencidos que o fiscal confirmou. */
  confirmacoes?: string[];
  /** Encaminhar (AC-35): o fiscal aceita a urgência pedida. */
  aceitarUrgencia?: boolean;
  /** Referência do fiscal (AC-32): o item e a referência acrescentada ou retirada. */
  itemId?: string;
  referencia?: ReferenciaEntrada;
  referenciaId?: string;
  /** Completar a pesquisa da urgência (AC-35): só orçamentos novos. */
  orcamentosNovos?: OrcamentoRascunhoInput[];
};

export async function transicionar(e: EntradaTransicao): Promise<
  ResultadoMaterial<{
    situacao: SituacaoCotacao;
    versao: number;
    /** Só no `pesquisa_completada`: a pesquisa chegou às 3 empresas por item. */
    pesquisaCompleta?: boolean;
  }>
> {
  const agora = new Date();
  const cot = await lerCotacao(e.cotacaoId);
  if (!cot) return { ok: false, error: 'Cotação não encontrada.' };
  const de = cot.situacao;
  const para = MANTEM_SITUACAO.includes(e.acao) ? de : PARA[e.acao];

  // 1. Situação, versão, papel e impedimentos (só leitura).
  if (!DE[e.acao].includes(de)) {
    return { ok: false, error: 'A cotação não está numa situação que permita esta ação.' };
  }
  if (cot.versao !== e.versao) return { ok: false, error: MSG_VERSAO_DESATUALIZADA };
  if (MOTIVO_OBRIGATORIO.includes(e.acao) && !e.motivo?.trim()) {
    return { ok: false, error: 'Informe o motivo.' };
  }

  const userId = e.ator.userId;
  const papeis = e.ator.tipo === 'usuario' ? await papeisDe(e.ator.userId, e.ator.role) : null;
  const chamado = await ChamadoModel.findById(cot.chamadoId)
    .select('status assignedToUserId ativoId tipoServico')
    .lean();
  if (!chamado) return { ok: false, error: 'Chamado da cotação não encontrado.' };
  const ehTecnicoAtribuido = !!userId && String(chamado.assignedToUserId ?? '') === userId;

  const rascunhoSoDoTecnico = de === 'rascunho' && !cot.montadoPorUserId;
  const papel = papelDoAto(e.acao, de, e.ator, papeis, ehTecnicoAtribuido, rascunhoSoDoTecnico);
  if (!papel) {
    if (e.acao === 'aprovar') {
      return {
        ok: false,
        error: 'Você não tem designação vigente de aprovador.',
        impedimentos: ['designacao_vencida'],
      };
    }
    return { ok: false, error: 'Você não pode fazer esta ação nesta cotação.' };
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  /** A condição do `fornecimentoAte` na gravação (spec 0023, AC-6). */
  const filtroDoPrazo: Record<string, unknown> = {};
  const advertencias: CodigoControle[] = [];
  /** As confirmações do orçamento vencido feitas neste encaminhar (AC-34). */
  const confirmadas: { orcamentoId: string }[] = [];
  /** O que a fatia 4 grava a mais no evento (referência, orçamentos, urgência, confirmações). */
  const noEvento: Record<string, unknown> = {};
  let marcas: ReadonlyMap<string, MarcaAnomalia> = new Map();
  let faixaId: string | null = null;
  let limite: number | null = null;
  let valorEvento: number | null = null;
  let empenhoEvento: string | null = null;
  let completouPesquisa = false;
  let projecao: Projecao | null = null;
  const parametros = await lerMaterialConfig();
  const urgencia = cot.urgencia ?? null;
  const ehOFiscalQueAssumiu = !!userId && String(cot.fiscalUserId ?? '') === userId;

  // A devolução (comum, pela recusa da urgência ou pelo `alterar`) limpa a
  // aceitação da urgência e `pesquisaCompletaEm` e converte o complemento em
  // orçamento do envio, no mesmo update da transição (AC-35).
  if (DEVOLVEM.includes(e.acao)) {
    set.urgencia = urgenciaDevolvida(urgencia);
    set.orcamentos = cot.orcamentos.map((o) => ({ ...o, fase: 'envio' }));
  }

  switch (e.acao) {
    case 'enviar': {
      if (!['em atendimento', 'aguardando_terceiros'].includes(chamado.status)) {
        return {
          ok: false,
          error: 'A cotação só é enviada com o chamado em atendimento ou aguardando terceiros.',
        };
      }
      // A urgência pode ser pedida no envio ou num reenvio, enquanto não for
      // recusada; a pedida nunca sai, e a justificativa gravada vale (AC-35).
      if (e.urgencia && urgencia?.decisao === 'recusada') {
        return { ok: false, error: ERROS_FATIA4.urgencia_recusada_antes };
      }
      let urgenciaDoEnvio: UrgenciaLida | null = urgencia;
      if (!urgencia?.pedida && e.urgencia) {
        const justificativa = e.urgencia.justificativa?.trim();
        if (!justificativa) return { ok: false, error: ERROS_FATIA4.urgencia_justificativa };
        urgenciaDoEnvio = {
          pedida: true,
          justificativa,
          pedidaEm: agora,
          decisao: null,
          decididaPorUserId: null,
          decididaEm: null,
          motivoRecusa: null,
          pesquisaCompletaEm: null,
        };
      }
      const emUrgencia = !!urgenciaDoEnvio?.pedida && urgenciaDoEnvio.decisao !== 'recusada';
      // A origem é derivada de novo com as tabelas de agora, e o preço congela (AC-26).
      const envio = await itensDoEnvio(cot, chamado.tipoServico as string, agora);
      const imp = [
        ...(envio.desatualizado ? (['classificacao_desatualizada'] as CodigoControle[]) : []),
        ...(envio.referenciaDesatualizada
          ? (['referencia_desatualizada'] as CodigoControle[])
          : []),
        ...impedimentosDeEnvio({
          itens: envio.itens,
          orcamentos: cot.orcamentos,
          raizContratada: parametros.raizCnpjContratada,
          urgencia: emUrgencia,
        }),
      ];
      if (imp.length) {
        const recusa = {
          ok: false as const,
          error: envio.desatualizado
            ? 'Um item precisa ser classificado de novo antes do envio.'
            : imp.length === 1
              ? CONTROLES[imp[0]!].texto
              : 'Corrija os pontos listados antes de enviar.',
          impedimentos: imp,
        };
        await registrarTentativa(cot._id, imp, userId, papel, agora);
        return recusa;
      }
      // `pesquisaCompletaEm` só existe com urgência pedida, recalculado do zero a cada envio.
      if (urgenciaDoEnvio?.pedida) {
        const completa = pesquisaCompleta(envio.itens, cot.orcamentos);
        set.urgencia = { ...urgenciaDoEnvio, pesquisaCompletaEm: completa ? agora : null };
        noEvento.urgenciaNoAto = {
          pedida: true,
          justificativa: urgenciaDoEnvio.justificativa,
          decisao: urgenciaDoEnvio.decisao,
          pesquisaCompleta: completa,
        };
      }
      // Cada orçamento com o próprio arquivo, ainda ativo no envio (AC-4).
      const arquivosDosOrcamentos = new Set(cot.orcamentos.map((o) => String(o.arquivoId)));
      const arquivosAtivos = await ArquivoCotacaoModel.countDocuments({
        _id: { $in: [...arquivosDosOrcamentos].map((a) => new Types.ObjectId(a)) },
        cotacaoId: cot._id,
        tipo: 'orcamento',
        removidoEm: null,
      });
      if (
        arquivosDosOrcamentos.size !== cot.orcamentos.length ||
        arquivosAtivos !== arquivosDosOrcamentos.size
      ) {
        return { ok: false, error: 'Cada orçamento precisa do próprio arquivo anexado.' };
      }
      set.itens = envio.itens;
      set.valorTotalCentavos = valorTotalCentavos(envio.itens);
      set.ativoId = chamado.ativoId ?? null;
      set.localizacaoId = await localDoAtivo(chamado.ativoId as Types.ObjectId | null);
      break;
    }
    case 'assumir':
      set.fiscalUserId = new Types.ObjectId(userId!);
      break;
    case 'urgencia_recusada':
    case 'devolver': {
      if (e.acao === 'urgencia_recusada') {
        // Recusar é um ato único do fiscal que assumiu, com motivo, e devolve (AC-35).
        if (!ehOFiscalQueAssumiu) return { ok: false, error: ERROS_FATIA4.so_fiscal_que_assumiu };
        if (!urgencia?.pedida) return { ok: false, error: ERROS_FATIA4.urgencia_nao_pedida };
        if (urgencia.decisao) return { ok: false, error: ERROS_FATIA4.urgencia_ja_decidida };
        set.urgencia = {
          ...urgenciaDevolvida(urgencia),
          decisao: 'recusada',
          decididaPorUserId: new Types.ObjectId(userId!),
          decididaEm: agora,
          motivoRecusa: e.motivo!.trim(),
        };
        noEvento.urgenciaNoAto = { decisao: 'recusada' };
      }
      // A devolução limpa conferências e a base escolhida dos itens `ambas` (AC-27).
      const itens = cot.itens.map((i) => semBaseEscolhida({ ...i, conferencia: null }));
      set.fiscalUserId = null;
      set.itens = itens;
      set.valorTotalCentavos = valorTotalCentavos(itens);
      break;
    }
    case 'referencia_acrescentada':
    case 'referencia_retirada': {
      // Só o fiscal que assumiu, e só em item do caminho 3 (AC-32).
      if (!ehOFiscalQueAssumiu) return { ok: false, error: ERROS_FATIA4.so_fiscal_que_assumiu };
      const item = cot.itens.find((i) => String(i._id) === e.itemId);
      if (!item) return { ok: false, error: 'Item não encontrado na cotação.' };
      if (item.origem !== 'orcamento') {
        return { ok: false, error: ERROS_FATIA4.item_fora_do_caminho_3 };
      }
      const refs = item.referencias ?? [];
      let novas: ReferenciaDoc[];
      if (e.acao === 'referencia_acrescentada') {
        if (!e.referencia) return { ok: false, error: 'Informe a referência.' };
        if (refs.filter((r) => r.papel === 'fiscal').length >= MAX_REFERENCIAS_POR_PAPEL) {
          return { ok: false, error: ERROS_FATIA4.referencias_demais };
        }
        if (refs.some((r) => String(r._id) === e.referencia!.id)) {
          return { ok: false, error: ERROS_FATIA4.referencia_repetida };
        }
        const montada = await montarReferencias([e.referencia], {
          userId: userId!,
          papel: 'fiscal',
          agora,
        });
        if (!montada.ok) return montada;
        const nova = montada.referencias[0]!;
        novas = [...refs, nova];
        noEvento.referenciaNoAto = referenciaNoAto(nova);
      } else {
        const alvo = refs.find((r) => String(r._id) === e.referenciaId);
        if (!alvo) return { ok: false, error: ERROS_FATIA4.referencia_inexistente };
        // Só a do próprio fiscal sai, e só marcada: um valor digitado errado não trava o item.
        if (alvo.papel !== 'fiscal' || String(alvo.incluidaPorUserId ?? '') !== userId) {
          return { ok: false, error: ERROS_FATIA4.referencia_de_outro };
        }
        if (alvo.retiradaEm) return { ok: false, error: ERROS_FATIA4.referencia_ja_retirada };
        novas = refs.map((r) =>
          r === alvo
            ? { ...r, retiradaEm: agora, retiradaPorUserId: new Types.ObjectId(userId!) }
            : r,
        );
        noEvento.referenciaNoAto = referenciaNoAto(alvo);
      }
      set.itens = cot.itens.map((i) => (i === item ? { ...i, referencias: novas } : i));
      break;
    }
    case 'pesquisa_completada': {
      // Depois da autorização, a contratada só acrescenta orçamentos (AC-35).
      if (urgencia?.decisao !== 'aceita') {
        return { ok: false, error: ERROS_FATIA4.sem_urgencia_aceita };
      }
      if (urgencia.pesquisaCompletaEm) {
        return { ok: false, error: ERROS_FATIA4.pesquisa_ja_completa };
      }
      const novos = e.orcamentosNovos ?? [];
      if (novos.length === 0) return { ok: false, error: 'Acrescente ao menos um orçamento.' };
      const existentes = new Set(cot.orcamentos.map((o) => String(o._id)));
      if (novos.some((o) => existentes.has(o.id))) {
        return { ok: false, error: ERROS_FATIA4.orcamento_existente };
      }
      if (cot.orcamentos.length + novos.length > MAX_ORCAMENTOS_COTACAO) {
        return { ok: false, error: ERROS_FATIA4.orcamentos_demais };
      }
      const doCaminho = new Set(cot.itens.filter(doCaminho3).map((i) => String(i._id)));
      for (const o of novos) {
        const defeito = defeitoDoCnpj(o.cnpj, parametros.raizCnpjContratada);
        if (defeito) return { ok: false, error: erroCnpjDoOrcamento(o.fornecedor, defeito) };
        if (!o.validade) {
          return {
            ok: false,
            error: CONTROLES.validade_ausente.texto,
            impedimentos: ['validade_ausente'],
          };
        }
        if (o.precos.length === 0 || o.precos.some((p) => !doCaminho.has(p.itemId))) {
          return { ok: false, error: ERROS_FATIA4.preco_fora_do_caminho_3 };
        }
      }
      // O arquivo de cada orçamento novo: desta cotação, ativo e ainda solto (AC-4).
      const ligados = new Set(cot.orcamentos.map((o) => String(o.arquivoId)));
      const arquivos = novos.map((o) => o.arquivoId);
      const validos = arquivos.some((a) => ligados.has(a))
        ? -1
        : await ArquivoCotacaoModel.countDocuments({
            _id: { $in: arquivos.map((a) => new Types.ObjectId(a)) },
            cotacaoId: cot._id,
            tipo: 'orcamento',
            removidoEm: null,
          });
      if (validos !== new Set(arquivos).size) {
        return { ok: false, error: ERROS_FATIA4.arquivo_do_orcamento };
      }
      const orcamentos = [
        ...cot.orcamentos,
        ...novos.map((o) => orcamentoParaDocumento(o, 'complemento')),
      ];
      completouPesquisa = pesquisaCompleta(cot.itens, orcamentos);
      set.orcamentos = orcamentos;
      if (completouPesquisa) set.urgencia = { ...urgencia, pesquisaCompletaEm: agora };
      noEvento.orcamentosNoAto = novos.map((o) => ({
        id: o.id,
        fornecedor: o.fornecedor,
        cnpj: o.cnpj,
        data: o.data,
        validade: o.validade ?? null,
        precos: o.precos,
      }));
      noEvento.urgenciaNoAto = { pesquisaCompleta: completouPesquisa };
      break;
    }
    case 'encaminhar': {
      marcas = await marcasDeConferencia(cot.itens);
      const bases = new Map((e.bases ?? []).map((b) => [b.itemId, b]));
      const conferencias = new Map((e.conferencias ?? []).map((c) => [c.itemId, c.texto]));
      const naLista = new Set(marcas.keys());
      // A conferência é do fiscal que assumiu, o mesmo que encaminha (AC-29).
      if (naLista.size > 0 && String(cot.fiscalUserId ?? '') !== userId) {
        return {
          ok: false,
          error: 'Só o fiscal que assumiu a análise registra a conferência e encaminha.',
        };
      }
      const impedimentosItens = impedimentosDoEncaminhar(
        cot.itens,
        {
          bases: new Set([...bases.keys()]),
          conferencias: new Set([...conferencias.keys()]),
        },
        naLista,
      );
      // Fatia 4: variação acima da referência barra, também na urgência (AC-33);
      // cada orçamento vencido precisa da marca do fiscal (AC-34).
      if (itensComVariacaoAcima(cot.itens, parametros.percentualSinapi).length) {
        impedimentosItens.push('variacao_acima');
      }
      const marcadas = new Set(e.confirmacoes ?? []);
      const vencidos = orcamentosVencidos(cot.itens, cot.orcamentos, hojeEmBelem(agora));
      if (vencidos.some((id) => !marcadas.has(id))) impedimentosItens.push('orcamento_vencido');
      // A urgência sem as 3 empresas por item só segue com o aceite expresso (AC-35).
      const precisaAceite =
        !!urgencia?.pedida &&
        urgencia.decisao !== 'recusada' &&
        !urgencia.pesquisaCompletaEm &&
        !pesquisaCompleta(cot.itens, cot.orcamentos);
      // Aceitar a urgência e confirmar o vencido são decisões do fiscal que assumiu,
      // como recusar a urgência e mexer nas referências (decisão de 20/10, na revisão).
      if ((precisaAceite || vencidos.length > 0) && !ehOFiscalQueAssumiu) {
        return { ok: false, error: ERROS_FATIA4.so_fiscal_que_assumiu };
      }
      if (precisaAceite && !e.aceitarUrgencia) impedimentosItens.push('urgencia_sem_decisao');
      if (impedimentosItens.length) {
        return {
          ok: false,
          error:
            impedimentosItens.length === 1
              ? CONTROLES[impedimentosItens[0]!].texto
              : 'Há pontos que impedem o encaminhamento.',
          impedimentos: impedimentosItens,
        };
      }
      for (const orcamentoId of vencidos) confirmadas.push({ orcamentoId });
      if (vencidos.length) noEvento.confirmacoesNoAto = vencidos.map((v) => new Types.ObjectId(v));
      if (precisaAceite) {
        set.urgencia = {
          ...urgencia,
          decisao: 'aceita',
          decididaPorUserId: new Types.ObjectId(userId!),
          decididaEm: agora,
        };
        noEvento.urgenciaNoAto = { decisao: 'aceita' };
      }
      const itens = cot.itens.map((i) => {
        const id = String(i._id);
        let item = { ...i };
        const b = bases.get(id);
        if (i.origem === 'ambas' && b) {
          const preco = b.base === 'anexo_v' ? i.anexoVPrecoCentavos : i.sinapiPrecoCentavos;
          item = {
            ...item,
            baseAplicada: b.base,
            justificativaBase: b.justificativa,
            precoAplicadoCentavos: preco ?? null,
          };
        }
        const texto = conferencias.get(id);
        if (naLista.has(id) && texto) {
          item = {
            ...item,
            conferencia: { texto, porUserId: new Types.ObjectId(userId!), em: agora },
          };
        }
        return item;
      });
      const total = valorTotalCentavos(itens);
      // O saldo já usa o total com as bases escolhidas.
      if (!(await haSaldoElegivel(total, agora))) {
        return {
          ok: false,
          error: 'Nenhum empenho elegível tem saldo para o valor desta cotação.',
          impedimentos: ['saldo_insuficiente'],
        };
      }
      set.itens = itens;
      set.valorTotalCentavos = total;
      break;
    }
    case 'aprovar': {
      if (cot.montadoPorUserId && String(cot.montadoPorUserId) === userId) {
        return {
          ok: false,
          error: 'Quem montou a cotação não pode aprová-la.',
          impedimentos: ['autor_nao_aprova'],
        };
      }
      const lim = papeis ? limiteDoAprovador(papeis) : null;
      if (!lim) {
        return {
          ok: false,
          error: 'Sua designação de aprovador não tem faixa ativa.',
          impedimentos: ['designacao_vencida'],
        };
      }
      if (lim.limiteCentavos < cot.valorTotalCentavos) {
        return {
          ok: false,
          error: 'O valor passa do limite da sua faixa de competência.',
          impedimentos: ['competencia_insuficiente'],
        };
      }
      if (!e.empenhoId) return { ok: false, error: 'Escolha o empenho.' };
      // A projeção do empenho escolhido, pelo saldo de antes desta reserva (AC-38).
      projecao = await projecaoNaAprovacao(
        e.empenhoId,
        cot.valorTotalCentavos,
        parametros.parcelaRelevantePercentual,
        agora,
      );
      if (projecao) {
        advertencias.push('projecao_esgotamento');
        noEvento.projecaoNoAto = projecao;
      }
      faixaId = lim.faixaId;
      limite = lim.limiteCentavos;
      set.empenhoId = new Types.ObjectId(e.empenhoId);
      set.valorAutorizadoCentavos = cot.valorTotalCentavos;
      set.autorizadoEm = agora;
      set.autorizadoPorUserId = new Types.ObjectId(userId!);
      // Prazo de fornecimento do IMR do contrato (spec 0023, AC-6): só a primeira
      // autorização grava; um prazo já vencido e mantido pelo `alterar` fica.
      if (!cot.fornecimentoAte) {
        const prazo = await calcularFornecimentoAte(agora, parametros.prazoFornecimentoDiasUteis);
        if (prazo) {
          set.fornecimentoAte = prazo;
          filtroDoPrazo.fornecimentoAte = null;
        }
      }
      valorEvento = cot.valorTotalCentavos;
      empenhoEvento = e.empenhoId;
      break;
    }
    case 'alterar':
      set.empenhoId = null;
      set.valorAutorizadoCentavos = null;
      set.autorizadoEm = null;
      set.autorizadoPorUserId = null;
      set.fiscalUserId = null;
      // O prazo de fornecimento só é limpo antes de vencer, com a condição no
      // filtro da gravação; vencido, nunca é apagado (spec 0023, AC-6).
      if (cot.fornecimentoAte && cot.fornecimentoAte > agora) {
        set.fornecimentoAte = null;
        filtroDoPrazo.fornecimentoAte = { $gt: agora };
      }
      break;
    case 'executar': {
      // Chamado encerrado não recebe material, mesmo com a cotação ainda autorizada (AC-12).
      if (chamado.status === 'cancelado' || chamado.status === 'recusado') {
        return { ok: false, error: 'O chamado foi encerrado; o material não pode ser executado.' };
      }
      if (!cot.autorizadoEm || agora.getTime() <= cot.autorizadoEm.getTime()) {
        return { ok: false, error: 'A execução precisa ser posterior à autorização.' };
      }
      const evidencias = await ArquivoCotacaoModel.countDocuments({
        cotacaoId: cot._id,
        tipo: 'evidencia',
        removidoEm: null,
      });
      if (evidencias === 0) {
        return {
          ok: false,
          error: 'Anexe ao menos uma evidência da aplicação.',
          impedimentos: ['evidencia_ausente'],
        };
      }
      const qtd = new Map((e.quantidades ?? []).map((q) => [q.itemId, q.quantidadeExecutada]));
      let total = 0;
      let divergente = false;
      const itens = [];
      for (const i of cot.itens) {
        const q = qtd.get(String(i._id));
        if (q == null) return { ok: false, error: 'Informe a quantidade aplicada de cada item.' };
        if (q > i.quantidade + 1e-9) {
          return {
            ok: false,
            error: 'A quantidade aplicada passa da autorizada.',
            impedimentos: ['execucao_acima_autorizado'],
          };
        }
        if (q < i.quantidade - 1e-9) divergente = true;
        const valor = valorDaLinhaCentavos(q, i.precoAplicadoCentavos ?? 0);
        total += valor;
        itens.push({ ...i, quantidadeExecutada: q, valorExecutadoCentavos: valor });
      }
      if (divergente) advertencias.push('divergencia_execucao');
      set.itens = itens;
      set.executadoEm = agora;
      set.executadoPorUserId = new Types.ObjectId(userId!);
      set.valorExecutadoCentavos = total;
      break;
    }
    case 'receber_provisorio':
      if (cot.recebimentoProvisorio) {
        return { ok: false, error: 'O recebimento provisório já foi registrado.' };
      }
      set.recebimentoProvisorio = { porUserId: new Types.ObjectId(userId!), em: agora };
      break;
    case 'receber_definitivo':
      if (!cot.recebimentoProvisorio) {
        return { ok: false, error: 'Registre antes o recebimento provisório.' };
      }
      // A urgência só é atestada com a pesquisa completa (AC-35); o provisório não espera.
      if (urgencia?.pedida && !urgencia.pesquisaCompletaEm) {
        return {
          ok: false,
          error: CONTROLES.pesquisa_pendente.texto,
          impedimentos: ['pesquisa_pendente'],
        };
      }
      set.recebimentoDefinitivo = { porUserId: new Types.ObjectId(userId!), em: agora };
      break;
    case 'registrar_nf': {
      if (cot.notaFiscal) return { ok: false, error: ERROS_NOTA_FISCAL.ja_registrada };
      const nf = e.notaFiscal;
      if (!nf) return { ok: false, error: ERROS_NOTA_FISCAL.ausente };
      const recusaDaData = recusaDaDataDaNotaFiscal(nf.data, cot.autorizadoEm ?? null, agora);
      if (recusaDaData) return { ok: false, error: ERROS_NOTA_FISCAL[recusaDaData] };
      const arquivo =
        Types.ObjectId.isValid(nf.arquivoId) &&
        (await ArquivoCotacaoModel.exists({
          _id: new Types.ObjectId(nf.arquivoId),
          cotacaoId: cot._id,
          tipo: 'nota_fiscal',
          removidoEm: null,
        }));
      if (!arquivo) return { ok: false, error: ERROS_NOTA_FISCAL.arquivo_ausente };
      set.notaFiscal = {
        numero: nf.numero.trim(),
        data: new Date(`${nf.data}T12:00:00.000Z`),
        arquivoId: new Types.ObjectId(nf.arquivoId),
        porUserId: new Types.ObjectId(userId!),
        em: agora,
      };
      break;
    }
    case 'cancelar':
    case 'reprovar':
      break;
  }

  // Advertências: as de preço e a da pesquisa posterior são recalculadas a cada
  // transição sobre o estado do ato (AC-28, AC-35); as outras ficam, a
  // divergência da execução é refeita no `executar`, e as confirmações do
  // vencido são refeitas no `encaminhar` e limpas na devolução (AC-34).
  const itensDoAto = (set.itens as NonNullable<CotacaoLida>['itens'] | undefined) ?? cot.itens;
  const orcamentosDoAto =
    (set.orcamentos as NonNullable<CotacaoLida>['orcamentos'] | undefined) ?? cot.orcamentos;
  const refazConfirmacoes = e.acao === 'encaminhar' || DEVOLVEM.includes(e.acao);
  // Fatia 5: fracionamento, reincidência, consumo e item parecido saem e são
  // refeitos no assumir, no encaminhar e no aprovar; a projeção, só no aprovar.
  const refazDoAto = ACOES_COM_ADVERTENCIAS_DO_ATO.includes(e.acao);
  const doAto = refazDoAto
    ? await advertenciasDoAto({
        cotacaoId: cot._id,
        ativoId: cot.ativoId ?? null,
        tipoServico: chamado.tipoServico as string,
        itens: itensDoAto,
        janelaDias: parametros.janelaDias,
        agora,
      })
    : [];
  const mantidas = (cot.advertencias ?? []).filter(
    (a) =>
      !ehAdvertenciaRecalculada(a.codigo) &&
      !(e.acao === 'executar' && a.codigo === 'divergencia_execucao') &&
      !(refazConfirmacoes && a.codigo === 'orcamento_vencido') &&
      !(refazDoAto && CODIGOS_ADVERTENCIA_DO_ATO.includes(a.codigo as CodigoControle)) &&
      !(e.acao === 'aprovar' && a.codigo === 'projecao_esgotamento'),
  );
  const todasAdvertencias = [
    ...mantidas,
    ...advertencias.map((codigo) => ({ codigo, itemId: null, em: agora })),
    ...confirmadas.map((c) => ({
      codigo: 'orcamento_vencido',
      itemId: null,
      orcamentoId: new Types.ObjectId(c.orcamentoId),
      confirmadaPorUserId: new Types.ObjectId(userId!),
      em: agora,
    })),
    ...advertenciasDePreco(itensDoAto, parametros.percentualSinapi).map((a) => ({
      codigo: a.codigo,
      itemId: new Types.ObjectId(a.itemId),
      em: agora,
    })),
    ...itensComPesquisaDivergente(itensDoAto, orcamentosDoAto).map((itemId) => ({
      codigo: 'pesquisa_posterior_divergente',
      itemId: new Types.ObjectId(itemId),
      em: agora,
    })),
    ...doAto.map((a) => ({
      codigo: a.codigo,
      itemId: a.itemId ? new Types.ObjectId(a.itemId) : null,
      em: agora,
    })),
  ];
  set.advertencias = todasAdvertencias;
  const advertenciasNoAto = [...new Set(todasAdvertencias.map((a) => a.codigo))];

  set.situacao = para;
  set.emTramite = estaEmTramite(para);

  // 2. Só no aprovar: a reserva no empenho (passo de restrição).
  if (e.acao === 'aprovar') {
    const tentarReservar = () =>
      reservar({
        empenhoId: e.empenhoId!,
        cotacaoId: String(cot._id),
        valorCentavos: cot.valorTotalCentavos,
        agora,
      });
    let ok = await tentarReservar();
    // Uma aprovação que caiu entre a reserva e a gravação deixa a reserva presa,
    // e a repetição diria "sem saldo" até o cron. A mesma regra da conciliação,
    // só para esta cotação, solta a reserva antiga e tenta de novo.
    if (!ok && (await conciliarReservas(agora, { cotacaoId: String(cot._id) })).liberadas > 0) {
      ok = await tentarReservar();
    }
    if (!ok && (await temReserva(String(cot._id)))) {
      return { ok: false, error: MSG_APROVACAO_EM_ANDAMENTO };
    }
    if (!ok) {
      return {
        ok: false,
        error: 'O empenho escolhido não tem saldo para esta cotação.',
        impedimentos: ['saldo_insuficiente'],
      };
    }
  }

  // 3. Gravação condicional: quem perde a corrida recebe "recarregue".
  const update: Record<string, unknown> = { $set: set, $inc: { versao: 1 } };
  if (Object.keys(unset).length) update.$unset = unset;
  const gravada = await CotacaoMaterialModel.findOneAndUpdate(
    { _id: cot._id, situacao: de, versao: cot.versao, ...filtroDoPrazo },
    update,
    { returnDocument: 'after' },
  ).lean<NonNullable<CotacaoLida>>();
  if (!gravada) {
    if (e.acao === 'aprovar') await liberarOuAvisar(String(cot._id), e.empenhoId!);
    return { ok: false, error: MSG_VERSAO_DESATUALIZADA };
  }

  // 4. O evento; se falhar, desfaz a cotação e a reserva.
  try {
    await CotacaoMaterialEventoModel.create({
      cotacaoId: cot._id,
      de,
      para,
      acao: e.acao,
      autorUserId: userId ? new Types.ObjectId(userId) : null,
      autorNome: await nomeDe(userId),
      papel,
      faixaId: faixaId ? new Types.ObjectId(faixaId) : null,
      limiteCentavosNoAto: limite,
      parametrosNoAto: parametros,
      itensNoAto: itensNoAto(gravada.itens, marcas),
      advertenciasNoAto,
      motivo: e.acao === 'alterar' ? 'alteracao_pos_autorizacao' : (e.motivo?.trim() ?? null),
      empenhoId: empenhoEvento ? new Types.ObjectId(empenhoEvento) : null,
      valorCentavos: valorEvento,
      ...noEvento,
      em: agora,
    });
  } catch (err) {
    const volta: Record<string, unknown> = { situacao: de, emTramite: estaEmTramite(de) };
    for (const k of Object.keys(set)) {
      if (k in volta) continue;
      volta[k] = (cot as Record<string, unknown>)[k] ?? null;
    }
    await CotacaoMaterialModel.updateOne(
      { _id: cot._id, versao: cot.versao + 1 },
      { $set: { ...volta, versao: cot.versao } },
    ).catch(() => {});
    if (e.acao === 'aprovar') await liberarOuAvisar(String(cot._id), e.empenhoId!);
    throw err;
  }

  // 5. Só o vencedor aplica os efeitos no saldo e no chamado.
  await aplicarEfeitos({ e, cot, gravada, de, para, agora, papel });

  // 6. Avisos, fire and forget: quando a situação muda, e a nota fiscal e a pesquisa
  // completa da urgência para os gestores. O provisório não avisa: quem age na
  // etapa seguinte é o próprio gestor. A pesquisa que já chega completa no envio
  // não avisa (regras finas de 20/10).
  if (de !== para) void avisarSituacao(String(cot._id), para, userId);
  else if (e.acao === 'registrar_nf') void avisarNotaFiscal(String(cot._id), userId);
  else if (e.acao === 'pesquisa_completada' && completouPesquisa) {
    void avisarPesquisaCompleta(String(cot._id), userId);
  }
  return {
    ok: true,
    situacao: para,
    versao: gravada.versao,
    ...(e.acao === 'pesquisa_completada' ? { pesquisaCompleta: completouPesquisa } : {}),
  };
}

/**
 * Grava o `enviar` recusado por impedimento (AC-43), para o indicador da
 * primeira tentativa (AC-41). A falha fica no log e nunca muda a resposta.
 */
async function registrarTentativa(
  cotacaoId: Types.ObjectId,
  impedimentos: readonly CodigoControle[],
  userId: string | null,
  papel: PapelEvento,
  agora: Date,
) {
  try {
    await CotacaoMaterialTentativaModel.create({
      cotacaoId,
      acao: 'enviar',
      impedimentos: [...impedimentos],
      autorUserId: userId ? new Types.ObjectId(userId) : null,
      papel,
      em: agora,
    });
  } catch (err) {
    console.error('[material] tentativa de envio não registrada:', err);
  }
}

/**
 * A projeção do empenho escolhido no aprovar (AC-38), só quando a cotação
 * consome a parcela relevante do saldo de antes da reserva; `null` fora disso
 * ou com o empenho sumido (a reserva recusa depois).
 */
async function projecaoNaAprovacao(
  empenhoId: string,
  valorCentavos: number,
  parcelaRelevantePercentual: number,
  agora: Date,
): Promise<Projecao | null> {
  if (!Types.ObjectId.isValid(empenhoId)) return null;
  const emp = await EmpenhoModel.findById(empenhoId)
    .select('valorLiquidoCentavos comprometidoCentavos')
    .lean();
  if (!emp) return null;
  const saldo = emp.valorLiquidoCentavos - emp.comprometidoCentavos;
  if (!consomeParcelaRelevante(valorCentavos, saldo, parcelaRelevantePercentual)) return null;
  return calcularProjecaoDoEmpenho(empenhoId, saldo, agora);
}

/**
 * Libera a reserva que deveria existir; se ela sumiu ou o update desistiu,
 * registra no log para o saldo não ficar errado em silêncio.
 */
async function liberarOuAvisar(cotacaoId: string, empenhoId: string) {
  const liberado = await liberar(cotacaoId, empenhoId);
  if (!liberado) {
    console.error(
      `[material] reserva da cotação ${cotacaoId} não encontrada ou não liberada no empenho ${empenhoId}; a conciliação diária confere.`,
    );
  }
  return liberado;
}

async function eventoDeSaldo(params: {
  cotacaoId: Types.ObjectId;
  situacao: SituacaoCotacao;
  acao: AcaoDeTransicao;
  papel: PapelEvento;
  userId: string | null;
  empenhoId: string;
  valorCentavos: number;
  agora: Date;
}) {
  // Liberação vira evento próprio (valor negativo), para a projeção somar.
  await CotacaoMaterialEventoModel.create({
    cotacaoId: params.cotacaoId,
    de: params.situacao,
    para: params.situacao,
    acao: params.acao,
    autorUserId: params.userId ? new Types.ObjectId(params.userId) : null,
    papel: params.papel,
    empenhoId: new Types.ObjectId(params.empenhoId),
    valorCentavos: params.valorCentavos,
    em: params.agora,
  }).catch((err) => console.error('[material] evento de saldo falhou:', err));
}

async function aplicarEfeitos(p: {
  e: EntradaTransicao;
  cot: NonNullable<CotacaoLida>;
  gravada: NonNullable<CotacaoLida> & { empenhoId?: Types.ObjectId | null };
  de: SituacaoCotacao;
  para: SituacaoCotacao;
  agora: Date;
  papel: PapelEvento;
}) {
  const { e, cot, gravada, para, agora, papel } = p;
  const chamadoId = String(cot.chamadoId);
  const userId = e.ator.userId;

  // Saldo: alterar e cancelar liberam; executar ajusta ao executado.
  if (e.acao === 'alterar' || e.acao === 'cancelar') {
    // Só a reserva do estado autorizado, no empenho gravado na cotação.
    const liberado = cot.empenhoId
      ? await liberarOuAvisar(String(cot._id), String(cot.empenhoId))
      : null;
    if (liberado) {
      await eventoDeSaldo({
        cotacaoId: cot._id,
        situacao: para,
        acao: e.acao,
        papel,
        userId,
        empenhoId: liberado.empenhoId,
        valorCentavos: -liberado.valorCentavos,
        agora,
      });
    }
  }
  if (e.acao === 'executar' && gravada.empenhoId) {
    const diferenca = await ajustar(
      String(cot._id),
      String(gravada.empenhoId),
      gravada.valorExecutadoCentavos ?? 0,
    );
    if (diferenca === null) {
      console.error(
        `[material] reserva da cotação ${String(cot._id)} não ajustada ao executado no empenho ${String(gravada.empenhoId)}; a conciliação não corrige valor, confira o saldo.`,
      );
    }
    if (diferenca && diferenca > 0) {
      await eventoDeSaldo({
        cotacaoId: cot._id,
        situacao: para,
        acao: e.acao,
        papel,
        userId,
        empenhoId: String(gravada.empenhoId),
        valorCentavos: -diferenca,
        agora,
      });
    }
  }

  // Chamado: o envio pausa; autorizada, reprovada e cancelada retomam.
  try {
    if (e.acao === 'enviar') {
      const chamadoAntes = await ChamadoModel.findById(chamadoId).select('status').lean();
      // Reenvio com a pausa da própria cotação ainda aberta: não pausa de novo.
      let pausa: { pauseLogId: string } | null | undefined = null;
      if (!cot.pauseLogId) {
        pausa = await pausarPelaCotacao({
          chamadoId,
          userId: userId!,
          numeroCotacao: cot.numero,
          agora,
        });
      }
      if (pausa) {
        const r = await CotacaoMaterialModel.updateOne(
          // Em trâmite, e não só `enviada`: o fiscal pode ter assumido nesse meio tempo.
          { _id: cot._id, emTramite: true, pauseLogId: null },
          { $set: { pauseLogId: new Types.ObjectId(pausa.pauseLogId) } },
        );
        if (r.modifiedCount === 0) await desfazerPausa(chamadoId, pausa.pauseLogId, agora);
      }
      await registrarNoChamado({
        chamadoId,
        userId,
        action: 'cotacao_material_enviada',
        numeroCotacao: cot.numero,
        statusAnterior: chamadoAntes?.status,
        statusNovo: pausa ? 'aguardando_terceiros' : chamadoAntes?.status,
      });
    }

    // Só quando a situação muda: o complemento da pesquisa mantém a `autorizada`.
    if (p.de !== para && (para === 'autorizada' || para === 'reprovada' || para === 'cancelada')) {
      let retomou = false;
      if (cot.pauseLogId) {
        retomou = await retomarPelaCotacao({
          chamadoId,
          pauseLogId: String(cot.pauseLogId),
          userId,
          agora,
        });
        await CotacaoMaterialModel.updateOne({ _id: cot._id }, { $set: { pauseLogId: null } });
      }
      const action =
        para === 'autorizada'
          ? 'cotacao_material_autorizada'
          : para === 'reprovada'
            ? 'cotacao_material_reprovada'
            : 'cotacao_material_cancelada';
      await registrarNoChamado({
        chamadoId,
        userId,
        action,
        numeroCotacao: cot.numero,
        ...(retomou
          ? { statusAnterior: 'aguardando_terceiros', statusNovo: 'em atendimento' }
          : {}),
      });
    }
  } catch (err) {
    console.error('[material] efeito no chamado falhou:', err);
  }
}
