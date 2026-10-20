import 'server-only';

import { Types } from 'mongoose';

import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { ContratoModel } from '@/models/Contrato';
import { ImportacaoMaterialModel } from '@/models/ImportacaoMaterial';
import { SinapiInsumoModel } from '@/models/SinapiInsumo';
import { SinapiReferenciaModel } from '@/models/SinapiReferencia';
import { UserModel } from '@/models/user.model';
import type {
  CorrigirCodigoSinapiInput,
  MarcarAnomaliaInput,
} from '@/shared/material/cotacao.schemas';
import type {
  EstadoImportacaoMaterial,
  TipoImportacaoMaterial,
} from '@/shared/material/material.constants';

import { lerMaterialConfig } from './config';
import { recalcularAnomalia } from './importacao/anomalia';
import type { ResumoRevisao, Revisao } from './importacao/revisao';
import { mesSinapiMaisRecente } from './precos';

/**
 * O Anexo V e o SINAPI na tela do Admin (spec 0019, fatia 3): as ações sobre
 * um item vigente do Anexo V (marca manual de anomalia e correção do código
 * SINAPI, sempre com motivo e histórico) e as leituras das abas.
 */

type Resultado = { ok: true } | { ok: false; error: string };

const MSG_ITEM_NAO_VIGENTE =
  'Este item não está mais na versão vigente do Anexo V. Recarregue a página.';

/** O item, só se ele é da versão vigente do contrato. */
async function itemVigente(anexoVItemId: string) {
  const item = await AnexoVItemModel.findById(anexoVItemId)
    .select('contratoId versao sinapiCodigo anomalia')
    .lean();
  if (!item) return null;
  const ponteiro = await AnexoVVigenciaModel.findOne({ contratoId: item.contratoId }).lean();
  return ponteiro?.versao === item.versao ? item : null;
}

/** Marca ou desmarca a conferência obrigatória à mão (AC-29). O recálculo nunca toca nela. */
export async function marcarAnomalia(adminId: string, e: MarcarAnomaliaInput): Promise<Resultado> {
  const item = await itemVigente(e.anexoVItemId);
  if (!item) return { ok: false, error: MSG_ITEM_NAO_VIGENTE };
  if (!!item.anomalia?.manual === e.marcada) {
    return {
      ok: false,
      error: e.marcada ? 'O item já está marcado.' : 'O item não está marcado à mão.',
    };
  }
  const agora = new Date();
  const porUserId = new Types.ObjectId(adminId);
  await AnexoVItemModel.updateOne(
    { _id: item._id },
    {
      // Por caminho de campo: o recálculo grava `anomalia.automatica` ao mesmo tempo.
      $set: {
        'anomalia.manual': e.marcada,
        'anomalia.motivo': e.motivo,
        'anomalia.porUserId': porUserId,
        'anomalia.em': agora,
      },
      $push: { anomaliaHistorico: { manual: e.marcada, motivo: e.motivo, porUserId, em: agora } },
    },
  );
  return { ok: true };
}

/** Corrige o código SINAPI de um item vigente, com motivo, e recalcula a marca dele (AC-24). */
export async function corrigirCodigoSinapi(
  adminId: string,
  e: CorrigirCodigoSinapiInput,
): Promise<Resultado> {
  const item = await itemVigente(e.anexoVItemId);
  if (!item) return { ok: false, error: MSG_ITEM_NAO_VIGENTE };
  const de = item.sinapiCodigo ?? null;
  if (de === e.codigo) return { ok: false, error: 'O código já é este.' };
  const r = await AnexoVItemModel.updateOne(
    { _id: item._id, sinapiCodigo: de },
    {
      $set: { sinapiCodigo: e.codigo },
      $push: {
        sinapiCodigoHistorico: {
          de,
          para: e.codigo,
          motivo: e.motivo,
          porUserId: new Types.ObjectId(adminId),
          em: new Date(),
        },
      },
    },
  );
  if (r.modifiedCount !== 1) {
    return { ok: false, error: 'O código mudou enquanto você editava. Recarregue a página.' };
  }
  try {
    await recalcularAnomalia({ anexoVItemId: e.anexoVItemId });
  } catch (err) {
    console.error('[material] recálculo depois da correção do código falhou:', err);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Leitura das abas
// ---------------------------------------------------------------------------

export type ItemAnexoVLinha = {
  id: string;
  numero: number;
  descricao: string;
  unidade: string;
  quantidadeEstimada: number;
  precoCentavos: number;
  sinapiCodigo: string | null;
  /** O preço do código no mês SINAPI mais recente, quando há. */
  sinapiPrecoCentavos: number | null;
  automatica: boolean;
  manual: boolean;
  motivoManual: string | null;
};

export type ContratoAnexoV = {
  id: string;
  numero: string;
  empresa: string;
  tiposServico: string[];
  vigenciaInicio: string;
  vigenciaFim: string;
  isActive: boolean;
  versao: number | null;
  atualizadoEm: string | null;
  itens: ItemAnexoVLinha[];
};

export type ImportacaoAberta = {
  id: string;
  tipo: TipoImportacaoMaterial;
  estado: EstadoImportacaoMaterial;
  arquivoNome: string;
  contratoNumero: string | null;
  referencia: string | null;
  versaoBase: number | null;
  comparadoCom: string | null;
  resumo: ResumoRevisao;
  revisao: Revisao | null;
  enviadaPor: string;
  criadaEm: string;
  expiraEm: string;
};

export type TabelasPreco = {
  contratos: ContratoAnexoV[];
  meses: { referencia: string; quantidade: number; em: string }[];
  mesMaisRecente: string | null;
  percentualSinapi: number;
  abertas: ImportacaoAberta[];
};

type AnexoVLinhaLean = {
  _id: Types.ObjectId;
  contratoId: Types.ObjectId;
  numero: number;
  descricao: string;
  unidade: string;
  quantidadeEstimada: number;
  precoPactuadoCentavos: number;
  sinapiCodigo: string | null;
  anomalia?: { automatica?: boolean; manual?: boolean; motivo?: string | null } | null;
};

export async function lerTabelasPreco(): Promise<TabelasPreco> {
  const [contratos, ponteiros, meses, mes, config, abertas] = await Promise.all([
    ContratoModel.find()
      .select('numero empresa tiposServico vigenciaInicio vigenciaFim isActive')
      .sort({ vigenciaInicio: -1 })
      .lean(),
    AnexoVVigenciaModel.find().lean(),
    SinapiReferenciaModel.find().sort({ referencia: -1 }).lean(),
    mesSinapiMaisRecente(),
    lerMaterialConfig(),
    ImportacaoMaterialModel.find({ emAberto: true }).lean(),
  ]);
  const ponteiroDe = new Map(ponteiros.map((p) => [String(p.contratoId), p]));
  const itens = ponteiros.length
    ? await AnexoVItemModel.find({
        $or: ponteiros.map((p) => ({ contratoId: p.contratoId, versao: p.versao })),
      })
        .select(
          'contratoId numero descricao unidade quantidadeEstimada precoPactuadoCentavos sinapiCodigo anomalia',
        )
        .sort({ numero: 1 })
        .lean<AnexoVLinhaLean[]>()
    : [];
  const codigos = [...new Set(itens.map((i) => i.sinapiCodigo).filter((c): c is string => !!c))];
  const precos = new Map<string, number>();
  if (mes && codigos.length) {
    const insumos = await SinapiInsumoModel.find({ referencia: mes, codigo: { $in: codigos } })
      .select('codigo precoCentavos')
      .lean();
    for (const s of insumos) precos.set(s.codigo, s.precoCentavos);
  }
  const itensDe = new Map<string, ItemAnexoVLinha[]>();
  for (const i of itens) {
    const lista = itensDe.get(String(i.contratoId)) ?? [];
    lista.push({
      id: String(i._id),
      numero: i.numero,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidadeEstimada: i.quantidadeEstimada,
      precoCentavos: i.precoPactuadoCentavos,
      sinapiCodigo: i.sinapiCodigo ?? null,
      sinapiPrecoCentavos: i.sinapiCodigo ? (precos.get(i.sinapiCodigo) ?? null) : null,
      automatica: !!i.anomalia?.automatica,
      manual: !!i.anomalia?.manual,
      motivoManual: i.anomalia?.manual ? (i.anomalia?.motivo ?? null) : null,
    });
    itensDe.set(String(i.contratoId), lista);
  }

  const autores = abertas.length
    ? await UserModel.find({ _id: { $in: abertas.map((a) => a.enviadaPorUserId) } })
        .select('name')
        .lean()
    : [];
  const nome = new Map(autores.map((u) => [String(u._id), u.name as string]));
  const numeroContrato = new Map(contratos.map((c) => [String(c._id), c.numero]));

  return {
    contratos: contratos.map((c) => {
      const p = ponteiroDe.get(String(c._id));
      return {
        id: String(c._id),
        numero: c.numero,
        empresa: c.empresa,
        tiposServico: c.tiposServico as string[],
        vigenciaInicio: c.vigenciaInicio,
        vigenciaFim: c.vigenciaFim,
        isActive: c.isActive,
        versao: p?.versao ?? null,
        atualizadoEm: p?.em ? p.em.toISOString() : null,
        itens: itensDe.get(String(c._id)) ?? [],
      };
    }),
    meses: meses.map((m) => ({
      referencia: m.referencia,
      quantidade: m.quantidade,
      em: m.em.toISOString(),
    })),
    mesMaisRecente: mes,
    percentualSinapi: config.percentualSinapi,
    abertas: abertas.map((a) => {
      const revisao = (a.revisao ?? null) as (Revisao & { comparadoCom?: string | null }) | null;
      return {
        id: String(a._id),
        tipo: a.tipo as TipoImportacaoMaterial,
        estado: a.estado as EstadoImportacaoMaterial,
        arquivoNome: a.arquivoNome,
        contratoNumero: a.contratoId ? (numeroContrato.get(String(a.contratoId)) ?? null) : null,
        referencia: a.referencia ?? null,
        versaoBase: a.versaoBase ?? null,
        comparadoCom: revisao?.comparadoCom ?? null,
        resumo: {
          total: a.resumo?.total ?? 0,
          novos: a.resumo?.novos ?? 0,
          alterados: a.resumo?.alterados ?? 0,
          removidos: a.resumo?.removidos ?? 0,
        },
        revisao: revisao
          ? { novos: revisao.novos, alterados: revisao.alterados, removidos: revisao.removidos }
          : null,
        enviadaPor: nome.get(String(a.enviadaPorUserId)) ?? 'Usuário removido',
        criadaEm: a.createdAt.toISOString(),
        expiraEm: a.expiraEm.toISOString(),
      };
    }),
  };
}
