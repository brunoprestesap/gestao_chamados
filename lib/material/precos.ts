import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { ChamadoModel } from '@/models/Chamado';
import { ContratoModel } from '@/models/Contrato';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { SinapiInsumoModel } from '@/models/SinapiInsumo';
import { SinapiReferenciaModel } from '@/models/SinapiReferencia';
import type { ClassificarItemInput } from '@/shared/material/cotacao.schemas';
import {
  BUSCA_PRECO_MAX_RESULTADOS,
  type SituacaoCotacao,
  SITUACOES_EDITAVEIS,
} from '@/shared/material/material.constants';
import {
  erroInsumoEquivaleAVarios,
  ERROS_CLASSIFICACAO,
  MSG_VERSAO_DESATUALIZADA,
} from '@/shared/material/mensagens';
import {
  menorPrecoDoItem,
  normalizarTextoBusca,
  valorTotalCentavos,
} from '@/shared/material/valores';

import { papeisDe } from './papeis';

/**
 * Os caminhos 1 e 2 da cotação (spec 0019, fatia 3, _Importação e
 * classificação_): de onde sai o Anexo V da cotação, o mês SINAPI mais
 * recente, a derivação da origem (nunca lida da entrada), a busca e a
 * classificação de um item.
 */

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

export type ItemAnexoVTabela = {
  id: string;
  contratoId: string;
  numero: number;
  versao: number;
  descricao: string;
  unidade: string;
  precoCentavos: number;
  sinapiCodigo: string | null;
};

export type InsumoTabela = {
  codigo: string;
  descricao: string;
  unidade: string;
  precoCentavos: number;
};

export type TabelasDaCotacao = {
  /** Os itens vigentes do Anexo V do contrato da cotação; `null` sem contrato ou sem Anexo V. */
  anexoV: ItemAnexoVTabela[] | null;
  contrato: { id: string; numero: string } | null;
  /** O mês SINAPI mais recente; `null` sem SINAPI importado. */
  mes: string | null;
  /** Os insumos do mês mais recente que a derivação pode precisar, por código. */
  sinapi: ReadonlyMap<string, InsumoTabela>;
};

/**
 * O contrato da cotação: ativo, vigente hoje (Belém) e que cobre o tipo de
 * serviço do chamado. O cadastro de contratos recusa sobreposição (spec
 * 0016), então sai no máximo um.
 */
export async function contratoDoTipoServico(
  tipoServico: string,
  agora: Date = new Date(),
): Promise<{ id: string; numero: string } | null> {
  const hoje = hojeEmBelem(agora);
  const c = await ContratoModel.findOne({
    isActive: true,
    tiposServico: tipoServico,
    vigenciaInicio: { $lte: hoje },
    vigenciaFim: { $gte: hoje },
  })
    .select('numero')
    .lean();
  return c ? { id: String(c._id), numero: c.numero } : null;
}

/** O mês SINAPI mais recente: o maior `referencia` com o mês completo. */
export async function mesSinapiMaisRecente(): Promise<string | null> {
  const r = await SinapiReferenciaModel.findOne()
    .sort({ referencia: -1 })
    .select('referencia')
    .lean();
  return r?.referencia ?? null;
}

type AnexoVLean = {
  _id: Types.ObjectId;
  contratoId: Types.ObjectId;
  numero: number;
  versao: number;
  descricao: string;
  unidade: string;
  precoPactuadoCentavos: number;
  sinapiCodigo: string | null;
};

function itemDaTabela(a: AnexoVLean): ItemAnexoVTabela {
  return {
    id: String(a._id),
    contratoId: String(a.contratoId),
    numero: a.numero,
    versao: a.versao,
    descricao: a.descricao,
    unidade: a.unidade,
    precoCentavos: a.precoPactuadoCentavos,
    sinapiCodigo: a.sinapiCodigo ?? null,
  };
}

/** Os itens vigentes do Anexo V de um contrato (os da versão do ponteiro). */
export async function itensVigentesDoContrato(contratoId: string): Promise<ItemAnexoVTabela[]> {
  const ponteiro = await AnexoVVigenciaModel.findOne({
    contratoId: new Types.ObjectId(contratoId),
  }).lean();
  if (!ponteiro) return [];
  const itens = await AnexoVItemModel.find({
    contratoId: ponteiro.contratoId,
    versao: ponteiro.versao,
  })
    .select('contratoId numero versao descricao unidade precoPactuadoCentavos sinapiCodigo')
    .sort({ numero: 1 })
    .lean<AnexoVLean[]>();
  return itens.map(itemDaTabela);
}

export async function insumosDoMes(
  mes: string | null,
  codigos: Iterable<string>,
): Promise<Map<string, InsumoTabela>> {
  const lista = [...new Set(codigos)].filter(Boolean);
  if (!mes || lista.length === 0) return new Map();
  const docs = await SinapiInsumoModel.find({ referencia: mes, codigo: { $in: lista } })
    .select('codigo descricao unidade precoCentavos')
    .lean();
  return new Map(
    docs.map((d) => [
      d.codigo,
      {
        codigo: d.codigo,
        descricao: d.descricao,
        unidade: d.unidade,
        precoCentavos: d.precoCentavos,
      },
    ]),
  );
}

/**
 * As tabelas de uma cotação, lidas a cada busca, classificação e envio: o
 * Anexo V vigente do contrato do tipo de serviço e o SINAPI do mês mais
 * recente, só nos códigos que a derivação pode usar.
 */
export async function carregarTabelas(
  tipoServico: string,
  codigosExtras: readonly string[] = [],
  agora: Date = new Date(),
): Promise<TabelasDaCotacao> {
  const [contrato, mes] = await Promise.all([
    contratoDoTipoServico(tipoServico, agora),
    mesSinapiMaisRecente(),
  ]);
  const vigentes = contrato ? await itensVigentesDoContrato(contrato.id) : [];
  const anexoV = vigentes.length ? vigentes : null;
  const codigos = [
    ...(anexoV ?? []).map((a) => a.sinapiCodigo).filter((c): c is string => !!c),
    ...codigosExtras,
  ];
  return { anexoV, contrato, mes, sinapi: await insumosDoMes(mes, codigos) };
}

// ---------------------------------------------------------------------------
// Derivação da origem (pura)
// ---------------------------------------------------------------------------

export type EscolhaDerivacao = { anexoVNumero: number } | { sinapiCodigo: string };

/** O que a tabela grava no item: a origem, as cópias e, fora de `ambas`, a base e o preço. */
export type CopiaDaTabela = {
  origem: 'anexo_v' | 'sinapi' | 'ambas';
  unidade: string;
  anexoVItemId: string | null;
  anexoVNumero: number | null;
  anexoVVersao: number | null;
  anexoVPrecoCentavos: number | null;
  sinapiCodigo: string | null;
  sinapiReferencia: string | null;
  sinapiPrecoCentavos: number | null;
  baseAplicada: 'anexo_v' | 'sinapi' | null;
  precoAplicadoCentavos: number | null;
};

export type RecusaDerivacao =
  | {
      ok: false;
      motivo: 'sem_contrato' | 'item_fora_da_versao' | 'sem_sinapi' | 'insumo_fora_do_mes';
    }
  | { ok: false; motivo: 'equivale_a_varios'; numeros: number[] };

export type ResultadoDerivacao = { ok: true; copia: CopiaDaTabela } | RecusaDerivacao;

function copiaAnexoV(a: ItemAnexoVTabela, insumo: InsumoTabela | undefined, mes: string | null) {
  const ambas = !!insumo;
  return {
    origem: ambas ? ('ambas' as const) : ('anexo_v' as const),
    unidade: a.unidade,
    anexoVItemId: a.id,
    anexoVNumero: a.numero,
    anexoVVersao: a.versao,
    anexoVPrecoCentavos: a.precoCentavos,
    sinapiCodigo: insumo ? insumo.codigo : null,
    sinapiReferencia: insumo ? mes : null,
    sinapiPrecoCentavos: insumo ? insumo.precoCentavos : null,
    // Em `ambas`, base e preço ficam nulos até o fiscal escolher (AC-27).
    baseAplicada: ambas ? null : ('anexo_v' as const),
    precoAplicadoCentavos: ambas ? null : a.precoCentavos,
  };
}

/**
 * A origem de um item, derivada pelo servidor (AC-26, RN-51): escolheu um
 * item do Anexo V, é `ambas` quando o código dele tem preço no mês mais
 * recente; escolheu um insumo do SINAPI, é `ambas` quando ele equivale a
 * exatamente um item vigente do Anexo V. Usada pela classificação e de novo
 * pelo envio, com as tabelas daquele momento.
 */
export function derivarOrigem(
  escolha: EscolhaDerivacao,
  tabelas: TabelasDaCotacao,
): ResultadoDerivacao {
  if ('anexoVNumero' in escolha) {
    if (!tabelas.anexoV) return { ok: false, motivo: 'sem_contrato' };
    const a = tabelas.anexoV.find((x) => x.numero === escolha.anexoVNumero);
    if (!a) return { ok: false, motivo: 'item_fora_da_versao' };
    const insumo = a.sinapiCodigo && tabelas.mes ? tabelas.sinapi.get(a.sinapiCodigo) : undefined;
    return { ok: true, copia: copiaAnexoV(a, insumo, tabelas.mes) };
  }
  if (!tabelas.mes) return { ok: false, motivo: 'sem_sinapi' };
  const insumo = tabelas.sinapi.get(escolha.sinapiCodigo);
  if (!insumo) return { ok: false, motivo: 'insumo_fora_do_mes' };
  const equivalentes = (tabelas.anexoV ?? []).filter((a) => a.sinapiCodigo === insumo.codigo);
  if (equivalentes.length > 1) {
    return { ok: false, motivo: 'equivale_a_varios', numeros: equivalentes.map((a) => a.numero) };
  }
  if (equivalentes.length === 1) {
    return { ok: true, copia: copiaAnexoV(equivalentes[0]!, insumo, tabelas.mes) };
  }
  return {
    ok: true,
    copia: {
      origem: 'sinapi',
      unidade: insumo.unidade,
      anexoVItemId: null,
      anexoVNumero: null,
      anexoVVersao: null,
      anexoVPrecoCentavos: null,
      sinapiCodigo: insumo.codigo,
      sinapiReferencia: tabelas.mes,
      sinapiPrecoCentavos: insumo.precoCentavos,
      baseAplicada: 'sinapi',
      precoAplicadoCentavos: insumo.precoCentavos,
    },
  };
}

/** O texto da recusa da classificação, para quem classificou. */
export function textoDaRecusa(r: RecusaDerivacao): string {
  if (r.motivo === 'equivale_a_varios') return erroInsumoEquivaleAVarios(r.numeros);
  return ERROS_CLASSIFICACAO[r.motivo];
}

/** Os campos de tabela de um item do caminho 3: tudo nulo. */
export const SEM_TABELA = {
  anexoVItemId: null,
  anexoVNumero: null,
  anexoVVersao: null,
  anexoVPrecoCentavos: null,
  sinapiCodigo: null,
  sinapiReferencia: null,
  sinapiPrecoCentavos: null,
  justificativaBase: null,
} as const;

/** A escolha que o item guardou, para o envio derivar de novo; `null` no caminho 3. */
export function escolhaGravada(item: {
  origem: string | null;
  anexoVNumero?: number | null;
  sinapiCodigo?: string | null;
}): EscolhaDerivacao | null {
  if (item.anexoVNumero != null) return { anexoVNumero: item.anexoVNumero };
  if (item.origem === 'sinapi' && item.sinapiCodigo) return { sinapiCodigo: item.sinapiCodigo };
  return null;
}

/** Os códigos SINAPI que a derivação de um conjunto de itens pode precisar. */
export function codigosDosItens(itens: readonly { sinapiCodigo?: string | null }[]): string[] {
  return itens.map((i) => i.sinapiCodigo).filter((c): c is string => !!c);
}

/** A cópia da tabela em forma de documento (ids viram `ObjectId`). */
export function copiaParaDocumento(c: CopiaDaTabela) {
  return {
    ...c,
    anexoVItemId: c.anexoVItemId ? new Types.ObjectId(c.anexoVItemId) : null,
    justificativaBase: null,
  };
}

// ---------------------------------------------------------------------------
// Classificação (responsável técnico)
// ---------------------------------------------------------------------------

type ItemLean = {
  _id: Types.ObjectId;
  quantidade: number;
  origem: string | null;
  [k: string]: unknown;
};

/**
 * Classifica um item (AC-26): a entrada é a escolha, e o servidor deriva a
 * origem e copia preço e unidade da tabela. `{ orcamento: true }` volta o
 * item para o caminho 3. Grava como o rascunho grava: condicional por
 * `versao` e só em `rascunho` ou `devolvida`.
 */
export async function classificarItem(
  ator: { userId: string; role: string },
  entrada: ClassificarItemInput,
): Promise<{ ok: true; versao: number } | { ok: false; error: string }> {
  const papeis = await papeisDe(ator.userId, ator.role);
  if (!papeis.tem('responsavel_tecnico')) {
    return { ok: false, error: 'Só o responsável técnico classifica os itens.' };
  }
  const cot = await CotacaoMaterialModel.findById(entrada.id)
    .select('chamadoId situacao versao itens orcamentos montadoPorUserId')
    .lean<{
      _id: Types.ObjectId;
      chamadoId: Types.ObjectId;
      situacao: SituacaoCotacao;
      versao: number;
      itens: ItemLean[];
      orcamentos: {
        cnpj: string;
        precos: { itemId: Types.ObjectId; valorUnitarioCentavos: number }[];
      }[];
      montadoPorUserId: Types.ObjectId | null;
    }>();
  if (!cot) return { ok: false, error: 'Cotação não encontrada.' };
  if (!SITUACOES_EDITAVEIS.includes(cot.situacao)) {
    return { ok: false, error: 'Esta cotação não está mais em edição.' };
  }
  if (cot.versao !== entrada.versao) return { ok: false, error: MSG_VERSAO_DESATUALIZADA };
  const alvo = cot.itens.find((i) => String(i._id) === entrada.itemId);
  if (!alvo) return { ok: false, error: ERROS_CLASSIFICACAO.item_inexistente };

  let novoItem: Record<string, unknown>;
  const escolha = entrada.escolha;
  if ('orcamento' in escolha) {
    const paraPreco = cot.orcamentos.map((o) => ({
      cnpj: o.cnpj,
      precos: o.precos.map((p) => ({
        itemId: String(p.itemId),
        valorUnitarioCentavos: p.valorUnitarioCentavos,
      })),
    }));
    novoItem = {
      ...alvo,
      ...SEM_TABELA,
      origem: 'orcamento',
      baseAplicada: 'orcamento',
      precoAplicadoCentavos: menorPrecoDoItem(entrada.itemId, paraPreco),
    };
  } else {
    const chamado = await ChamadoModel.findById(cot.chamadoId).select('tipoServico').lean();
    if (!chamado) return { ok: false, error: 'Chamado da cotação não encontrado.' };
    const codigoPedido = 'sinapiCodigo' in escolha ? [escolha.sinapiCodigo] : [];
    const tabelas = await carregarTabelas(chamado.tipoServico as string, codigoPedido);
    let derivacao: ResultadoDerivacao;
    if ('anexoVItemId' in escolha) {
      // O item precisa ser da versão vigente do contrato da cotação.
      const daTabela = tabelas.anexoV?.find((a) => a.id === escolha.anexoVItemId);
      derivacao = !tabelas.anexoV
        ? { ok: false, motivo: 'sem_contrato' }
        : !daTabela
          ? { ok: false, motivo: 'item_fora_da_versao' }
          : derivarOrigem({ anexoVNumero: daTabela.numero }, tabelas);
    } else {
      derivacao = derivarOrigem({ sinapiCodigo: escolha.sinapiCodigo }, tabelas);
    }
    if (!derivacao.ok) return { ok: false, error: textoDaRecusa(derivacao) };
    // Nos caminhos 1 e 2, as referências da contratada saem; as do fiscal ficam
    // gravadas e só voltam a contar se o item voltar ao caminho 3 (fatia 4).
    const referencias = ((alvo.referencias as { papel?: string }[] | undefined) ?? []).filter(
      (r) => r.papel === 'fiscal',
    );
    novoItem = { ...alvo, ...copiaParaDocumento(derivacao.copia), referencias };
  }

  const itens = cot.itens.map((i) => (String(i._id) === entrada.itemId ? novoItem : i));
  const set: Record<string, unknown> = {
    itens,
    valorTotalCentavos: valorTotalCentavos(
      itens as unknown as Parameters<typeof valorTotalCentavos>[0],
    ),
  };
  if (!cot.montadoPorUserId) set.montadoPorUserId = new Types.ObjectId(ator.userId);
  const atualizado = await CotacaoMaterialModel.findOneAndUpdate(
    { _id: cot._id, situacao: cot.situacao, versao: cot.versao },
    { $set: set, $inc: { versao: 1 } },
    { returnDocument: 'after', projection: { versao: 1 }, runValidators: true },
  ).lean();
  if (!atualizado) return { ok: false, error: MSG_VERSAO_DESATUALIZADA };
  return { ok: true, versao: atualizado.versao };
}

// ---------------------------------------------------------------------------
// Busca (responsável técnico e fiscal)
// ---------------------------------------------------------------------------

export type ResultadoAnexoV = {
  anexoVItemId: string;
  numero: number;
  descricao: string;
  unidade: string;
  precoCentavos: number;
  /** O item tem código com preço no mês mais recente: entra como `ambas`. */
  equivalenteSinapi: string | null;
};

export type ResultadoSinapi = {
  codigo: string;
  descricao: string;
  unidade: string;
  precoCentavos: number;
  /** Números dos itens vigentes do Anexo V com este código. */
  equivaleAoAnexoV: number[];
};

export type ResultadoBusca = {
  contrato: string | null;
  mes: string | null;
  anexoV: ResultadoAnexoV[];
  sinapi: ResultadoSinapi[];
};

/**
 * A busca dos caminhos 1 e 2 (_Busca_): o Anexo V vigente do contrato da
 * cotação, por palavras na descrição ou pelo número, e o SINAPI do mês mais
 * recente pelo índice de texto. Até 20 resultados no total; preço e unidade
 * só para leitura.
 */
export async function buscarItensPreco(
  ator: { userId: string; role: string },
  entrada: { cotacaoId: string; texto: string },
): Promise<({ ok: true } & ResultadoBusca) | { ok: false; error: string }> {
  const papeis = await papeisDe(ator.userId, ator.role);
  if (!papeis.tem('responsavel_tecnico') && !papeis.tem('fiscal')) {
    return { ok: false, error: 'Só o responsável técnico e o fiscal buscam nas tabelas.' };
  }
  const cot = await CotacaoMaterialModel.findById(entrada.cotacaoId).select('chamadoId').lean();
  if (!cot) return { ok: false, error: 'Cotação não encontrada.' };
  const chamado = await ChamadoModel.findById(cot.chamadoId).select('tipoServico').lean();
  if (!chamado) return { ok: false, error: 'Chamado da cotação não encontrado.' };

  const [contrato, mes] = await Promise.all([
    contratoDoTipoServico(chamado.tipoServico as string),
    mesSinapiMaisRecente(),
  ]);
  const vigentes = contrato ? await itensVigentesDoContrato(contrato.id) : [];
  const texto = normalizarTextoBusca(entrada.texto);
  const palavras = texto.split(' ').filter(Boolean);
  const achadosAnexo = vigentes.filter((a) => {
    if (/^\d+$/.test(texto) && a.numero === Number(texto)) return true;
    const d = normalizarTextoBusca(a.descricao);
    return palavras.every((p) => d.includes(p));
  });

  let achadosSinapi: InsumoTabela[] = [];
  if (mes) {
    const porCodigo = /^\d+$/.test(texto)
      ? await SinapiInsumoModel.find({ referencia: mes, codigo: texto.replace(/^0+/, '') })
          .select('codigo descricao unidade precoCentavos')
          .lean()
      : [];
    const porTexto = await SinapiInsumoModel.find({
      referencia: mes,
      $text: { $search: entrada.texto },
    })
      .select('codigo descricao unidade precoCentavos')
      .sort({ score: { $meta: 'textScore' } })
      .limit(BUSCA_PRECO_MAX_RESULTADOS)
      .lean();
    achadosSinapi = [...porCodigo, ...porTexto].map((d) => ({
      codigo: d.codigo,
      descricao: d.descricao,
      unidade: d.unidade,
      precoCentavos: d.precoCentavos,
    }));
  }

  // O insumo equivalente de um item achado do Anexo V também aparece na lista do SINAPI.
  const codigosEquivalentes = achadosAnexo
    .map((a) => a.sinapiCodigo)
    .filter((c): c is string => !!c);
  const insumosEquivalentes = await insumosDoMes(mes, codigosEquivalentes);

  const anexoV: ResultadoAnexoV[] = achadosAnexo.map((a) => ({
    anexoVItemId: a.id,
    numero: a.numero,
    descricao: a.descricao,
    unidade: a.unidade,
    precoCentavos: a.precoCentavos,
    equivalenteSinapi:
      a.sinapiCodigo && insumosEquivalentes.has(a.sinapiCodigo) ? a.sinapiCodigo : null,
  }));

  const vistos = new Set<string>();
  const sinapi: ResultadoSinapi[] = [];
  for (const s of [...insumosEquivalentes.values(), ...achadosSinapi]) {
    if (vistos.has(s.codigo)) continue;
    vistos.add(s.codigo);
    sinapi.push({
      ...s,
      equivaleAoAnexoV: vigentes.filter((a) => a.sinapiCodigo === s.codigo).map((a) => a.numero),
    });
  }

  // Até 20 no total: metade para cada tabela, e a sobra de uma vai para a outra.
  const metade = BUSCA_PRECO_MAX_RESULTADOS / 2;
  const nAnexo = Math.min(
    anexoV.length,
    Math.max(metade, BUSCA_PRECO_MAX_RESULTADOS - sinapi.length),
  );
  const nSinapi = Math.min(sinapi.length, BUSCA_PRECO_MAX_RESULTADOS - nAnexo);
  return {
    ok: true,
    contrato: contrato?.numero ?? null,
    mes,
    anexoV: anexoV.slice(0, nAnexo),
    sinapi: sinapi.slice(0, nSinapi),
  };
}

// ---------------------------------------------------------------------------
// Lista de conferência obrigatória (AC-29)
// ---------------------------------------------------------------------------

export type MarcaAnomalia = { automatica: boolean; manual: boolean };

/**
 * A marca de conferência obrigatória dos itens do Anexo V de uma cotação,
 * lida no ato: vale o item vigente de mesmo número no contrato do item
 * apontado (assim a marca manual herdada vale); se o número saiu da versão
 * vigente, vale o item apontado. Só os itens na lista entram no mapa; item só
 * do caminho 2 nunca entra.
 */
export async function marcasDeConferencia(
  itens: readonly { _id: unknown; anexoVItemId?: unknown }[],
): Promise<Map<string, MarcaAnomalia>> {
  const comAnexo = itens.filter((i) => i.anexoVItemId);
  if (comAnexo.length === 0) return new Map();
  type Apontado = {
    _id: Types.ObjectId;
    contratoId: Types.ObjectId;
    numero: number;
    anomalia?: { automatica?: boolean; manual?: boolean } | null;
  };
  const apontados = await AnexoVItemModel.find({
    _id: { $in: comAnexo.map((i) => i.anexoVItemId as Types.ObjectId) },
  })
    .select('contratoId numero anomalia')
    .lean<Apontado[]>();
  const porId = new Map(apontados.map((a) => [String(a._id), a]));
  const contratos = [...new Set(apontados.map((a) => String(a.contratoId)))];
  const ponteiros = await AnexoVVigenciaModel.find({
    contratoId: { $in: contratos.map((c) => new Types.ObjectId(c)) },
  }).lean();
  const versaoVigente = new Map(ponteiros.map((p) => [String(p.contratoId), p.versao]));
  const chaves = apontados
    .filter((a) => versaoVigente.has(String(a.contratoId)))
    .map((a) => ({
      contratoId: a.contratoId,
      numero: a.numero,
      versao: versaoVigente.get(String(a.contratoId))!,
    }));
  const vigentes = chaves.length
    ? await AnexoVItemModel.find({ $or: chaves })
        .select('contratoId numero anomalia')
        .lean<Apontado[]>()
    : [];
  const vigentePorNumero = new Map(vigentes.map((v) => [`${String(v.contratoId)}:${v.numero}`, v]));

  const out = new Map<string, MarcaAnomalia>();
  for (const i of comAnexo) {
    const apontado = porId.get(String(i.anexoVItemId));
    if (!apontado) continue;
    const valendo =
      vigentePorNumero.get(`${String(apontado.contratoId)}:${apontado.numero}`) ?? apontado;
    const marca = {
      automatica: !!valendo.anomalia?.automatica,
      manual: !!valendo.anomalia?.manual,
    };
    if (marca.automatica || marca.manual) out.set(String(i._id), marca);
  }
  return out;
}
