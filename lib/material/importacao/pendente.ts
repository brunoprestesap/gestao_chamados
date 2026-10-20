import 'server-only';

import { Types } from 'mongoose';

import { ehChaveDuplicada } from '@/lib/ativos/erros';
import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { ContratoModel } from '@/models/Contrato';
import { ImportacaoMaterialModel } from '@/models/ImportacaoMaterial';
import { SinapiInsumoModel } from '@/models/SinapiInsumo';
import { SinapiReferenciaModel } from '@/models/SinapiReferencia';
import {
  DIAS_IMPORTACAO_PENDENTE,
  type TipoImportacaoMaterial,
} from '@/shared/material/material.constants';
import { ERROS_IMPORTACAO_MATERIAL } from '@/shared/material/mensagens';

import { mesSinapiMaisRecente } from '../precos';
import { type ErroLinha, lerCsvAnexoV, lerCsvSinapi, type LinhaSinapi } from './csv';
import { type ItemVigenteParaRevisao, revisarAnexoV, revisarSinapi } from './revisao';

/**
 * O envio do CSV do Anexo V e do SINAPI (spec 0019, AC-24, AC-25): lê o
 * arquivo, monta a revisão contra o que vale hoje e grava a importação
 * `pendente`. Uma aberta por tipo (índice único parcial); a segunda recebe
 * 409. Nada da tabela muda até o Admin aplicar.
 */

export type ResultadoEnvioImportacao =
  | { ok: true; id: string }
  | {
      ok: false;
      status: 404 | 409 | 422;
      error: string;
      colunasFaltando?: string[];
      linhas?: ErroLinha[];
    };

/** O enxugamento ao fechar: `linhas` e a revisão saem na mesma escrita. */
export const UNSET_ENXUGAMENTO = { linhas: 1, revisao: 1 } as const;

function expiraEm(agora: Date): Date {
  return new Date(agora.getTime() + DIAS_IMPORTACAO_PENDENTE * 24 * 60 * 60 * 1000);
}

async function haAberta(tipo: TipoImportacaoMaterial): Promise<boolean> {
  return !!(await ImportacaoMaterialModel.exists({ tipo, emAberto: true }));
}

async function gravarPendente(doc: Record<string, unknown>): Promise<ResultadoEnvioImportacao> {
  try {
    const criada = await ImportacaoMaterialModel.create(doc);
    return { ok: true, id: String(criada._id) };
  } catch (e) {
    if (ehChaveDuplicada(e)) {
      return { ok: false, status: 409, error: ERROS_IMPORTACAO_MATERIAL.ja_pendente };
    }
    throw e;
  }
}

export async function enviarImportacaoAnexoV(p: {
  contratoId: string;
  arquivoNome: string;
  bytes: ArrayBuffer | Uint8Array;
  autorId: string;
}): Promise<ResultadoEnvioImportacao> {
  if (!Types.ObjectId.isValid(p.contratoId)) {
    return { ok: false, status: 422, error: ERROS_IMPORTACAO_MATERIAL.contrato_ausente };
  }
  const contratoId = new Types.ObjectId(p.contratoId);
  if (!(await ContratoModel.exists({ _id: contratoId }))) {
    return { ok: false, status: 404, error: ERROS_IMPORTACAO_MATERIAL.contrato_inexistente };
  }
  if (await haAberta('anexo_v')) {
    return { ok: false, status: 409, error: ERROS_IMPORTACAO_MATERIAL.ja_pendente };
  }
  const leitura = lerCsvAnexoV(p.bytes);
  if (!leitura.ok) return { ...leitura, status: 422 };

  const ponteiro = await AnexoVVigenciaModel.findOne({ contratoId }).lean();
  const vigentes = ponteiro
    ? await AnexoVItemModel.find({ contratoId, versao: ponteiro.versao })
        .select('numero descricao unidade quantidadeEstimada precoPactuadoCentavos sinapiCodigo')
        .lean<ItemVigenteParaRevisao[]>()
    : [];
  const { revisao, resumo } = revisarAnexoV(leitura.linhas, vigentes);
  const agora = new Date();
  return gravarPendente({
    tipo: 'anexo_v',
    contratoId,
    versaoBase: ponteiro?.versao ?? null,
    arquivoNome: p.arquivoNome,
    linhas: leitura.linhas,
    revisao,
    resumo,
    estado: 'pendente',
    emAberto: true,
    enviadaPorUserId: new Types.ObjectId(p.autorId),
    expiraEm: expiraEm(agora),
  });
}

export async function enviarImportacaoSinapi(p: {
  referencia: string;
  arquivoNome: string;
  bytes: ArrayBuffer | Uint8Array;
  autorId: string;
}): Promise<ResultadoEnvioImportacao> {
  // Os meses são imutáveis: mês já guardado nunca é importado de novo (AC-25).
  if (await SinapiReferenciaModel.exists({ referencia: p.referencia })) {
    return { ok: false, status: 409, error: ERROS_IMPORTACAO_MATERIAL.mes_ja_importado };
  }
  if (await haAberta('sinapi')) {
    return { ok: false, status: 409, error: ERROS_IMPORTACAO_MATERIAL.ja_pendente };
  }
  const leitura = lerCsvSinapi(p.bytes);
  if (!leitura.ok) return { ...leitura, status: 422 };

  const mesAnterior = await mesSinapiMaisRecente();
  const anteriores = mesAnterior
    ? await SinapiInsumoModel.find({ referencia: mesAnterior })
        .select('codigo descricao unidade precoCentavos')
        .lean<LinhaSinapi[]>()
    : [];
  const { revisao, resumo } = revisarSinapi(leitura.linhas, anteriores);
  const agora = new Date();
  return gravarPendente({
    tipo: 'sinapi',
    referencia: p.referencia,
    arquivoNome: p.arquivoNome,
    linhas: leitura.linhas,
    revisao: { ...revisao, comparadoCom: mesAnterior },
    resumo,
    estado: 'pendente',
    emAberto: true,
    enviadaPorUserId: new Types.ObjectId(p.autorId),
    expiraEm: expiraEm(agora),
  });
}

/** Descarta a pendente, enxugando na mesma escrita. Só a pendente se descarta. */
export async function descartarImportacao(
  importacaoId: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await ImportacaoMaterialModel.updateOne(
    { _id: new Types.ObjectId(importacaoId), estado: 'pendente' },
    {
      $set: {
        estado: 'descartada',
        emAberto: false,
        descartadaPorUserId: new Types.ObjectId(adminId),
        descartadaEm: new Date(),
      },
      $unset: UNSET_ENXUGAMENTO,
    },
  );
  return r.modifiedCount === 1
    ? { ok: true }
    : { ok: false, error: ERROS_IMPORTACAO_MATERIAL.fechada };
}
