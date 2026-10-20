import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem, somarDias } from '@/lib/ativos/documentos/situacao';
import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { FaixaCompetenciaModel } from '@/models/FaixaCompetencia';
import { SinapiInsumoModel } from '@/models/SinapiInsumo';
import {
  ITEM_PARECIDO_MAX_SINAPI,
  SITUACOES_JA_AUTORIZADAS,
} from '@/shared/material/material.constants';
import type { CodigoControle } from '@/shared/material/mensagens';
import {
  chaveDoMesmoItem,
  emMilesimos,
  precoParaValor,
  valorDaLinhaCentavos,
} from '@/shared/material/valores';

import {
  haReincidencia,
  itensComConsumoAcima,
  itensComFracionamento,
  pareceComAlguma,
} from './controles';
import { contratoDoTipoServico, itensVigentesDoContrato, mesSinapiMaisRecente } from './precos';

/**
 * As advertências da fatia 5 (spec 0019, AC-36, AC-37, AC-39, AC-40),
 * calculadas pelo `transicionar` no `assumir`, no `encaminhar` e no
 * `aprovar`, sobre o estado do ato. Nenhuma trava: só avisam o lado TRF1.
 * A cotação atual nunca entra nas próprias somas como "outra cotação".
 */

export type ItemDoAto = {
  _id: Types.ObjectId;
  descricao: string;
  quantidade: number;
  origem: string | null;
  precoAplicadoCentavos: number | null;
  anexoVItemId?: Types.ObjectId | null;
  anexoVPrecoCentavos?: number | null;
  sinapiCodigo?: string | null;
  sinapiPrecoCentavos?: number | null;
};

type ItemDeOutra = {
  descricao: string;
  quantidade: number;
  precoAplicadoCentavos: number | null;
  quantidadeExecutada: number | null;
  anexoVItemId?: Types.ObjectId | null;
  sinapiCodigo?: string | null;
};

type OutraCotacao = {
  _id: Types.ObjectId;
  situacao: string;
  itens: ItemDeOutra[];
};

export type AdvertenciaDoAto = { codigo: CodigoControle; itemId: string | null };

/** O início da janela: o dia de hoje em Belém menos `janelaDias`, à meia noite de Belém. */
export function inicioDaJanela(agora: Date, janelaDias: number): Date {
  return new Date(`${somarDias(hojeEmBelem(agora), -janelaDias)}T00:00:00.000-03:00`);
}

/** Contrato e número de cada item do Anexo V apontado, por id (qualquer versão). */
async function numerosDoAnexoV(ids: readonly unknown[]) {
  const unicos = [...new Set(ids.filter(Boolean).map(String))];
  if (unicos.length === 0) return new Map<string, { contratoId: string; numero: number }>();
  const docs = await AnexoVItemModel.find({
    _id: { $in: unicos.map((i) => new Types.ObjectId(i)) },
  })
    .select('contratoId numero')
    .lean();
  return new Map(
    docs.map((d) => [String(d._id), { contratoId: String(d.contratoId), numero: d.numero }]),
  );
}

/** Fracionamento e reincidência: só com ativo, contra as outras cotações do ativo na janela. */
async function doAtivo(p: {
  cotacaoId: Types.ObjectId;
  ativoId: Types.ObjectId;
  itens: readonly ItemDoAto[];
  janelaDias: number;
  agora: Date;
}): Promise<AdvertenciaDoAto[]> {
  const outras = await CotacaoMaterialModel.find({
    _id: { $ne: p.cotacaoId },
    ativoId: p.ativoId,
    situacao: { $in: SITUACOES_JA_AUTORIZADAS },
    autorizadoEm: { $gte: inicioDaJanela(p.agora, p.janelaDias) },
  })
    .select(
      'situacao itens.descricao itens.quantidade itens.precoAplicadoCentavos itens.quantidadeExecutada itens.anexoVItemId itens.sinapiCodigo',
    )
    .lean<OutraCotacao[]>();

  const out: AdvertenciaDoAto[] = [];
  if (haReincidencia(outras.length)) out.push({ codigo: 'reincidencia', itemId: null });
  if (outras.length === 0) return out;

  const anexoV = await numerosDoAnexoV([
    ...p.itens.map((i) => i.anexoVItemId),
    ...outras.flatMap((o) => o.itens.map((i) => i.anexoVItemId)),
  ]);
  const faixas = await FaixaCompetenciaModel.find({ ativa: true }).select('limiteCentavos').lean();
  const atuais = p.itens.map((i) => ({
    itemId: String(i._id),
    chave: chaveDoMesmoItem(i, anexoV),
    valorCentavos: valorDaLinhaCentavos(i.quantidade, precoParaValor(i) ?? 0),
  }));
  // A parcela de outra cotação é o valor autorizado do item, mesmo depois da execução.
  const parcelasDasOutras = outras.map((o) =>
    o.itens.map((i) => ({
      chave: chaveDoMesmoItem(i, anexoV),
      valorCentavos: valorDaLinhaCentavos(i.quantidade, i.precoAplicadoCentavos ?? 0),
    })),
  );
  for (const itemId of itensComFracionamento(
    atuais,
    parcelasDasOutras,
    faixas.map((f) => f.limiteCentavos),
  )) {
    out.push({ codigo: 'fracionamento', itemId });
  }
  return out;
}

/**
 * Consumo acima do estimado (AC-39): só itens com `anexoVItemId`. O consumo
 * soma o executado das `executada`/`atestada`, a quantidade das `autorizada`
 * e a desta cotação, pelo número do Anexo V no contrato, em qualquer versão.
 */
async function doConsumo(
  cotacaoId: Types.ObjectId,
  itens: readonly ItemDoAto[],
): Promise<AdvertenciaDoAto[]> {
  const comAnexo = itens.filter((i) => i.anexoVItemId);
  if (comAnexo.length === 0) return [];
  const apontados = await numerosDoAnexoV(comAnexo.map((i) => i.anexoVItemId));
  const numeros = [
    ...new Map([...apontados.values()].map((a) => [`${a.contratoId}:${a.numero}`, a])).values(),
  ];
  if (numeros.length === 0) return [];

  // Todas as versões desses números, para achar as cotações que os usaram e o item vigente.
  const versoes = await AnexoVItemModel.find({
    $or: numeros.map((n) => ({ contratoId: new Types.ObjectId(n.contratoId), numero: n.numero })),
  })
    .select('contratoId numero versao quantidadeEstimada')
    .lean();
  const porId = new Map(
    versoes.map((v) => [String(v._id), { contratoId: String(v.contratoId), numero: v.numero }]),
  );
  const ponteiros = await AnexoVVigenciaModel.find({
    contratoId: {
      $in: [...new Set(numeros.map((n) => n.contratoId))].map((c) => new Types.ObjectId(c)),
    },
  }).lean();
  const vigente = new Map(ponteiros.map((p) => [String(p.contratoId), p.versao]));
  const estimada = new Map<string, number>();
  for (const v of versoes) {
    if (vigente.get(String(v.contratoId)) === v.versao) {
      estimada.set(`anexoV:${String(v.contratoId)}:${v.numero}`, emMilesimos(v.quantidadeEstimada));
    }
  }

  const outras = await CotacaoMaterialModel.find({
    _id: { $ne: cotacaoId },
    situacao: { $in: SITUACOES_JA_AUTORIZADAS },
    'itens.anexoVItemId': { $in: versoes.map((v) => v._id) },
  })
    .select(
      'situacao itens.descricao itens.quantidade itens.quantidadeExecutada itens.anexoVItemId itens.sinapiCodigo itens.precoAplicadoCentavos',
    )
    .lean<OutraCotacao[]>();
  const consumo = new Map<string, number>();
  for (const o of outras) {
    for (const i of o.itens) {
      if (!i.anexoVItemId || !porId.has(String(i.anexoVItemId))) continue;
      const chave = chaveDoMesmoItem(i, porId);
      const q = o.situacao === 'autorizada' ? i.quantidade : (i.quantidadeExecutada ?? 0);
      consumo.set(chave, (consumo.get(chave) ?? 0) + emMilesimos(q));
    }
  }
  const atuais = comAnexo.map((i) => ({
    itemId: String(i._id),
    chave: chaveDoMesmoItem(i, apontados),
    milesimos: emMilesimos(i.quantidade),
  }));
  return itensComConsumoAcima(atuais, consumo, estimada).map((itemId) => ({
    codigo: 'consumo_acima_estimado' as const,
    itemId,
  }));
}

/**
 * Item parecido (AC-40): só item do caminho 3, contra o Anexo V vigente do
 * contrato da cotação e os 20 primeiros insumos do mês SINAPI mais recente
 * pelo índice de texto, e só depois o corte de Jaccard.
 */
async function doItemParecido(
  itens: readonly ItemDoAto[],
  tipoServico: string,
  agora: Date,
): Promise<AdvertenciaDoAto[]> {
  const doCaminho3 = itens.filter((i) => i.origem === 'orcamento');
  if (doCaminho3.length === 0) return [];
  const [contrato, mes] = await Promise.all([
    contratoDoTipoServico(tipoServico, agora),
    mesSinapiMaisRecente(),
  ]);
  const anexoV = contrato
    ? (await itensVigentesDoContrato(contrato.id)).map((a) => a.descricao)
    : [];
  const out: AdvertenciaDoAto[] = [];
  for (const i of doCaminho3) {
    let parecido = pareceComAlguma(i.descricao, anexoV);
    if (!parecido && mes) {
      const insumos = await SinapiInsumoModel.find({
        referencia: mes,
        $text: { $search: i.descricao },
      })
        .select('descricao')
        .sort({ score: { $meta: 'textScore' } })
        .limit(ITEM_PARECIDO_MAX_SINAPI)
        .lean();
      parecido = pareceComAlguma(
        i.descricao,
        insumos.map((s) => s.descricao),
      );
    }
    if (parecido) out.push({ codigo: 'item_parecido', itemId: String(i._id) });
  }
  return out;
}

/** As quatro advertências do ato, sobre os itens já com o estado do ato. */
export async function advertenciasDoAto(p: {
  cotacaoId: Types.ObjectId;
  ativoId: Types.ObjectId | null;
  tipoServico: string;
  itens: readonly ItemDoAto[];
  janelaDias: number;
  agora: Date;
}): Promise<AdvertenciaDoAto[]> {
  const [ativo, consumo, parecido] = await Promise.all([
    p.ativoId ? doAtivo({ ...p, ativoId: p.ativoId }) : Promise.resolve([] as AdvertenciaDoAto[]),
    doConsumo(p.cotacaoId, p.itens),
    doItemParecido(p.itens, p.tipoServico, p.agora),
  ]);
  return [...ativo, ...consumo, ...parecido];
}
