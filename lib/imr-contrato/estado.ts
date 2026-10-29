import 'server-only';

import { Types } from 'mongoose';

import { ImrFechamentoModel } from '@/models/ImrFechamento';
import { ImrFechamentoPdfEmissaoModel } from '@/models/ImrFechamentoPdfEmissao';
import { ImrReaberturaModel } from '@/models/ImrReabertura';
import { UserModel } from '@/models/user.model';
import type {
  IndicadorImr,
  PapelEmissaoImr,
  PapelImr,
} from '@/shared/imr-contrato/imr-contrato.constants';
import type {
  EmissaoPdfImr,
  EstadoDoMes,
  FechamentoLido,
  ReaberturaLida,
  VersaoResumo,
} from '@/shared/imr-contrato/imr-contrato.types';

import { estadoDoMes } from './fechamento.regras';

/**
 * Leitura do estado, das versões e das fotos do IMR do contrato (spec 0023,
 * AC-9 a AC-12). Quem chama já fez `dbConnect`.
 */

const filtro = (contratoId: string, competencia: string) => ({
  contratoId: new Types.ObjectId(contratoId),
  competencia,
});

type DocReabertura = {
  versaoReaberta: number;
  motivo: string;
  porUserId: Types.ObjectId;
  papel: PapelImr;
  em: Date;
};

/** Aberto ou fechado, a maior versão e os intervalos fechados do mês. */
export async function lerEstadoDoMes(
  contratoId: string,
  competencia: string,
): Promise<EstadoDoMes> {
  const [fechamentos, reaberturas] = await Promise.all([
    ImrFechamentoModel.find(filtro(contratoId, competencia))
      .select('versao fechadoEm')
      .lean<{ versao: number; fechadoEm: Date }[]>(),
    ImrReaberturaModel.find(filtro(contratoId, competencia))
      .select('versaoReaberta em')
      .lean<{ versaoReaberta: number; em: Date }[]>(),
  ]);
  return estadoDoMes(fechamentos, reaberturas);
}

export type HistoricoDoMes = {
  estado: EstadoDoMes;
  versoes: VersaoResumo[];
  reaberturas: ReaberturaLida[];
};

/** Todas as versões e reaberturas do mês, da mais antiga à mais nova (AC-11). */
export async function lerHistoricoDoMes(
  contratoId: string,
  competencia: string,
): Promise<HistoricoDoMes> {
  const [fechamentos, reaberturas] = await Promise.all([
    ImrFechamentoModel.find(filtro(contratoId, competencia))
      .select('versao total fechadoPorNome papel fechadoEm')
      .sort({ versao: 1 })
      .lean<VersaoResumo[]>(),
    ImrReaberturaModel.find(filtro(contratoId, competencia))
      .select('versaoReaberta motivo porUserId papel em')
      .sort({ versaoReaberta: 1 })
      .lean<DocReabertura[]>(),
  ]);
  const autores = reaberturas.length
    ? await UserModel.find({
        _id: { $in: [...new Set(reaberturas.map((r) => String(r.porUserId)))] },
      })
        .select('name')
        .lean<{ _id: Types.ObjectId; name: string }[]>()
    : [];
  const nomes = new Map(autores.map((u) => [String(u._id), u.name]));
  return {
    estado: estadoDoMes(fechamentos, reaberturas),
    versoes: fechamentos.map((f) => ({
      versao: f.versao,
      total: f.total,
      fechadoPorNome: f.fechadoPorNome,
      papel: f.papel,
      fechadoEm: f.fechadoEm,
    })),
    reaberturas: reaberturas.map((r) => ({
      versaoReaberta: r.versaoReaberta,
      motivo: r.motivo,
      porNome: nomes.get(String(r.porUserId)) ?? 'Usuário removido',
      papel: r.papel,
      em: r.em,
    })),
  };
}

/** Uma versão gravada, como a tela e o PDF leem (sem recalcular). */
export async function lerFechamento(
  contratoId: string,
  competencia: string,
  versao: number,
): Promise<FechamentoLido | null> {
  const doc = await ImrFechamentoModel.findOne({ ...filtro(contratoId, competencia), versao })
    .select('-__v -fechadoPorUserId')
    .lean<
      Omit<FechamentoLido, 'id' | 'contratoId'> & {
        _id: Types.ObjectId;
        contratoId: Types.ObjectId;
      }
    >();
  if (!doc) return null;
  const { _id, contratoId: cId, ...resto } = doc;
  return {
    ...resto,
    id: String(_id),
    contratoId: String(cId),
    i1: { pontos: resto.i1.pontos, observacao: resto.i1.observacao ?? null },
    i2: { pontos: resto.i2.pontos, observacao: resto.i2.observacao ?? null },
    reincidenciaZero: resto.reincidenciaZero as IndicadorImr[],
  };
}

/**
 * Os pontos do fechamento vigente do mês (maior versão sem reabertura), para
 * a reincidência do mês seguinte (AC-12). null quando o mês não está fechado.
 */
export async function lerPontosVigentes(
  contratoId: string,
  competencia: string,
): Promise<{ i1: number; i2: number; i3: number; i4: number } | null> {
  const estado = await lerEstadoDoMes(contratoId, competencia);
  if (!estado.fechado) return null;
  const doc = await ImrFechamentoModel.findOne({
    ...filtro(contratoId, competencia),
    versao: estado.maiorVersao,
  })
    .select('i1.pontos i2.pontos i3.pontos i4.pontos')
    .lean<{
      i1: { pontos: number };
      i2: { pontos: number };
      i3: { pontos: number };
      i4: { pontos: number };
    }>();
  if (!doc) return null;
  return { i1: doc.i1.pontos, i2: doc.i2.pontos, i3: doc.i3.pontos, i4: doc.i4.pontos };
}

/** As emissões do PDF de todas as versões do mês, da mais nova à mais antiga (AC-13). */
export async function lerEmissoesDoMes(
  contratoId: string,
  competencia: string,
): Promise<EmissaoPdfImr[]> {
  const versoes = await ImrFechamentoModel.find(filtro(contratoId, competencia))
    .select('versao')
    .lean<{ _id: Types.ObjectId; versao: number }[]>();
  if (versoes.length === 0) return [];
  const versaoDe = new Map(versoes.map((v) => [String(v._id), v.versao]));
  const emissoes = await ImrFechamentoPdfEmissaoModel.find({
    fechamentoId: { $in: versoes.map((v) => v._id) },
  })
    .sort({ em: -1 })
    .limit(50)
    .lean<
      {
        _id: Types.ObjectId;
        fechamentoId: Types.ObjectId;
        sha256: string;
        porUserId: Types.ObjectId;
        papel: PapelEmissaoImr;
        em: Date;
      }[]
    >();
  const autores = emissoes.length
    ? await UserModel.find({
        _id: { $in: [...new Set(emissoes.map((e) => String(e.porUserId)))] },
      })
        .select('name')
        .lean<{ _id: Types.ObjectId; name: string }[]>()
    : [];
  const nomes = new Map(autores.map((u) => [String(u._id), u.name]));
  return emissoes.map((e) => ({
    id: String(e._id),
    versao: versaoDe.get(String(e.fechamentoId)) ?? 0,
    sha256: e.sha256,
    porNome: nomes.get(String(e.porUserId)) ?? 'Usuário removido',
    papel: e.papel,
    em: e.em,
  }));
}
