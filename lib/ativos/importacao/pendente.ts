import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { ImportacaoPatrimonialModel } from '@/models/ImportacaoPatrimonial';
import { UserModel } from '@/models/user.model';
import {
  ERRO_IMPORTACAO_FECHADA,
  type ImportacaoStatus,
  IMPORTACOES_POR_PAGINA,
  LIMITE_SUMIDOS,
} from '@/shared/ativos/importacao.constants';

import { ehChaveDuplicada, falha, type Resultado } from '../erros';
import { calcularDiferenca } from './diferenca';
import { contarResultado, unsetEnxugamento } from './enxugar';
import type { ContagensParse, LinhaSicam } from './parse';

/**
 * Ciclo de vida da importação (spec 0012, AC-21 e AC-25): grava a pendente,
 * troca a pendente anterior sem nunca deixar duas, descarta e lista.
 */

export type PendenteExistente = { id: string; criadaEm: string; autorNome: string };

export type ResultadoRegistro =
  | { ok: true; id: string }
  | { ok: false; conflito: PendenteExistente };

async function nomeDe(userId: unknown): Promise<string> {
  if (!userId) return 'Usuário removido';
  const u = await UserModel.findById(userId).select('name').lean<{ name?: string }>();
  return u?.name || 'Usuário removido';
}

/** A pendente atual, com quem a enviou (para o aviso do upload). */
export async function buscarPendente(): Promise<PendenteExistente | null> {
  const p = await ImportacaoPatrimonialModel.findOne({ emAberto: true })
    .select('createdAt autorId')
    .lean<{ _id: Types.ObjectId; createdAt: Date; autorId: Types.ObjectId }>();
  if (!p) return null;
  return {
    id: String(p._id),
    criadaEm: p.createdAt.toISOString(),
    autorNome: await nomeDe(p.autorId),
  };
}

/**
 * Fecha a pendente como `descartada` e enxuga, na mesma escrita, só se ela
 * ainda estiver pendente. Devolve se fechou.
 */
async function fecharComoDescartada(
  id: Types.ObjectId | string,
  autorId: string,
): Promise<boolean> {
  const atual = await ImportacaoPatrimonialModel.findOne({ _id: id, status: 'pendente' })
    .select('itens.grupo itens.aplicado itens.motivoPulo')
    .lean<{ itens: Parameters<typeof contarResultado>[0] }>();
  if (!atual) return false;
  const { aplicados, pulados } = contarResultado(atual.itens);
  const r = await ImportacaoPatrimonialModel.updateOne(
    { _id: id, status: 'pendente' },
    {
      $set: {
        status: 'descartada',
        descartadaPor: new Types.ObjectId(autorId),
        descartadaEm: new Date(),
        'contagens.aplicados': aplicados,
        'contagens.pulados': pulados,
      },
      $unset: unsetEnxugamento(),
    },
  );
  return r.modifiedCount === 1;
}

/**
 * Grava a nova importação `pendente`. Com outra pendente e sem
 * `substituirPendente`, devolve o conflito. Na troca, a nova é gravada antes
 * (sem `emAberto`), a anterior é descartada e só então a nova ganha
 * `emAberto`: se a gravação da nova falhar, a anterior fica intacta, e o
 * índice único parcial impede duas pendentes mesmo com dois uploads juntos.
 */
export async function registrarImportacao(params: {
  arquivoNome: string;
  autorId: string;
  linhas: LinhaSicam[];
  codigosAceitos: Set<string>;
  contagensParse: ContagensParse;
  substituirPendente: boolean;
}): Promise<ResultadoRegistro> {
  const existente = await buscarPendente();
  if (existente && !params.substituirPendente) return { ok: false, conflito: existente };

  const diferenca = await calcularDiferenca(params.linhas, params.codigosAceitos);
  const nova = await ImportacaoPatrimonialModel.create({
    arquivoNome: params.arquivoNome,
    autorId: new Types.ObjectId(params.autorId),
    status: 'pendente',
    ...params.contagensParse,
    continuamAusentes: diferenca.continuamAusentes,
    contagens: diferenca.contagens,
    itens: diferenca.itens,
  });

  if (existente) await fecharComoDescartada(existente.id, params.autorId);

  try {
    await ImportacaoPatrimonialModel.updateOne(
      { _id: nova._id, status: 'pendente' },
      { $set: { emAberto: true } },
    );
  } catch (e) {
    if (!ehChaveDuplicada(e)) throw e;
    // Outro upload ficou com a vaga entre a leitura e aqui: esta não vale.
    await fecharComoDescartada(nova._id, params.autorId);
    const outra = await buscarPendente();
    if (outra) return { ok: false, conflito: outra };
    throw e;
  }
  return { ok: true, id: String(nova._id) };
}

export async function descartarImportacao(id: string, autorId: string): Promise<Resultado> {
  if (!Types.ObjectId.isValid(id)) return falha(ERRO_IMPORTACAO_FECHADA);
  const fechou = await fecharComoDescartada(id, autorId);
  return fechou ? { ok: true } : falha(ERRO_IMPORTACAO_FECHADA);
}

/** Patrimoniados que o SICAM já trouxe alguma vez: a base do aviso de muitos sumidos. */
export async function contarVistosPeloSicam(): Promise<number> {
  return AtivoModel.countDocuments({
    origemCodigo: 'patrimonio',
    'camposPatrimoniais.importadoEm': { $exists: true },
  });
}

export function ehMuitosSumidos(sumidos: number, vistos: number): boolean {
  return vistos > 0 && sumidos / vistos > LIMITE_SUMIDOS;
}

export type ImportacaoResumo = {
  id: string;
  arquivoNome: string;
  status: ImportacaoStatus;
  autorNome: string;
  criadaEm: string;
  fechadaEm: string | null;
  novos: number;
  alterados: number;
  sumidos: number;
};

type ImportacaoListaLean = {
  _id: Types.ObjectId;
  arquivoNome: string;
  status: ImportacaoStatus;
  autorId: Types.ObjectId;
  createdAt: Date;
  aplicadaEm?: Date | null;
  descartadaEm?: Date | null;
  contagens: { novos: number; alterados: number; sumidos: number };
};

/** As importações da mais recente para a mais antiga, 20 por página (AC-25). */
export async function listarImportacoes(pagina: number): Promise<{
  itens: ImportacaoResumo[];
  total: number;
  paginas: number;
}> {
  const [docs, total] = await Promise.all([
    ImportacaoPatrimonialModel.find({})
      .sort({ createdAt: -1, _id: -1 })
      .skip((pagina - 1) * IMPORTACOES_POR_PAGINA)
      .limit(IMPORTACOES_POR_PAGINA)
      .select('arquivoNome status autorId createdAt aplicadaEm descartadaEm contagens')
      .lean<ImportacaoListaLean[]>(),
    ImportacaoPatrimonialModel.countDocuments({}),
  ]);
  const ids = [...new Set(docs.map((d) => String(d.autorId)))];
  const usuarios = ids.length
    ? await UserModel.find({ _id: { $in: ids } })
        .select('name')
        .lean<{ _id: Types.ObjectId; name?: string }[]>()
    : [];
  const nome = new Map(usuarios.map((u) => [String(u._id), u.name ?? '']));
  return {
    itens: docs.map((d) => ({
      id: String(d._id),
      arquivoNome: d.arquivoNome,
      status: d.status,
      autorNome: nome.get(String(d.autorId)) || 'Usuário removido',
      criadaEm: d.createdAt.toISOString(),
      fechadaEm: (d.aplicadaEm ?? d.descartadaEm)?.toISOString() ?? null,
      novos: d.contagens?.novos ?? 0,
      alterados: d.contagens?.alterados ?? 0,
      sumidos: d.contagens?.sumidos ?? 0,
    })),
    total,
    paginas: Math.max(1, Math.ceil(total / IMPORTACOES_POR_PAGINA)),
  };
}
