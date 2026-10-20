import 'server-only';

import { Types } from 'mongoose';

import { ehChaveDuplicada } from '@/lib/ativos/erros';
import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { ImportacaoMaterialModel } from '@/models/ImportacaoMaterial';
import { SinapiInsumoModel } from '@/models/SinapiInsumo';
import { SinapiReferenciaModel } from '@/models/SinapiReferencia';
import {
  MOTIVO_CODIGO_PELA_IMPORTACAO,
  RETOMADA_APLICACAO_MS,
  SINAPI_REGIME,
  SINAPI_UF,
} from '@/shared/material/material.constants';
import { ERROS_IMPORTACAO_MATERIAL } from '@/shared/material/mensagens';
import { normalizarTextoBusca } from '@/shared/material/valores';

import { mesSinapiMaisRecente } from '../precos';
import { recalcularAnomaliaSemFalhar } from './anomalia';
import type { LinhaAnexoV, LinhaSinapi } from './csv';
import { UNSET_ENXUGAMENTO } from './pendente';
import { codigoDaVersaoNova } from './revisao';

/**
 * A aplicação da importação sem transação (spec 0019, _Aplicação sem
 * transação_), em cinco passos que podem ser repetidos sem estrago:
 * 1. `pendente` vira `aplicando` (ou uma parada há mais de 5 minutos é retomada);
 * 2. grava as linhas da versão nova (Anexo V) ou do mês (SINAPI) por upsert;
 * 3. vira a chave numa única escrita: o ponteiro do contrato ou o `SinapiReferencia`;
 * 4. recalcula a anomalia (a falha só vai para o log);
 * 5. `aplicando` vira `aplicada`, apagando as linhas.
 * Linhas gravadas sem a chave virada ficam invisíveis, e a nova tentativa as
 * regrava pelos mesmos upserts.
 */

type Resultado = { ok: true } | { ok: false; error: string };

type ImportacaoLean = {
  _id: Types.ObjectId;
  tipo: 'anexo_v' | 'sinapi';
  contratoId: Types.ObjectId | null;
  versaoBase: number | null;
  referencia: string | null;
  linhas: unknown[] | null;
};

const LOTE_GRAVACAO = 1000;

async function descartarPorMudanca(id: Types.ObjectId, error: string): Promise<Resultado> {
  await ImportacaoMaterialModel.updateOne(
    { _id: id, estado: 'aplicando' },
    {
      $set: { estado: 'descartada', emAberto: false, motivoDescarte: error, aplicandoDesde: null },
      $unset: UNSET_ENXUGAMENTO,
    },
  );
  return { ok: false, error };
}

/** Passo 1: quem perde a corrida recebe "já está sendo aplicada". */
async function tomarAplicacao(id: Types.ObjectId, agora: Date) {
  const campos = 'tipo contratoId versaoBase referencia linhas';
  const nova = await ImportacaoMaterialModel.findOneAndUpdate(
    { _id: id, estado: 'pendente' },
    { $set: { estado: 'aplicando', aplicandoDesde: agora } },
    { returnDocument: 'after', projection: campos },
  ).lean<ImportacaoLean>();
  if (nova) return nova;
  // Uma aplicação que caiu no meio fica `aplicando`; parada há mais de 5 minutos, é retomada.
  return ImportacaoMaterialModel.findOneAndUpdate(
    {
      _id: id,
      estado: 'aplicando',
      aplicandoDesde: { $lt: new Date(agora.getTime() - RETOMADA_APLICACAO_MS) },
    },
    { $set: { aplicandoDesde: agora } },
    { returnDocument: 'after', projection: campos },
  ).lean<ImportacaoLean>();
}

type AnteriorLean = {
  numero: number;
  sinapiCodigo: string | null;
  sinapiCodigoHistorico: unknown[];
  anomalia?: {
    manual?: boolean;
    motivo?: string | null;
    porUserId?: Types.ObjectId | null;
    em?: Date | null;
  } | null;
  anomaliaHistorico: unknown[];
};

async function aplicarAnexoV(
  imp: ImportacaoLean,
  adminId: string,
  agora: Date,
): Promise<Resultado> {
  const contratoId = imp.contratoId!;
  const base = imp.versaoBase ?? null;
  const nova = (base ?? 0) + 1;
  const ponteiro = await AnexoVVigenciaModel.findOne({ contratoId }).lean();
  const jaVirou = !!ponteiro && String(ponteiro.importacaoId) === String(imp._id);

  if (!jaVirou) {
    if ((ponteiro?.versao ?? null) !== base) {
      return descartarPorMudanca(imp._id, ERROS_IMPORTACAO_MATERIAL.anexo_v_mudou);
    }
    // 2. A versão nova inteira, com a herança do mesmo número da versão anterior.
    const linhas = (imp.linhas ?? []) as LinhaAnexoV[];
    const anteriores = base
      ? await AnexoVItemModel.find({ contratoId, versao: base })
          .select('numero sinapiCodigo sinapiCodigoHistorico anomalia anomaliaHistorico')
          .lean<AnteriorLean[]>()
      : [];
    const porNumero = new Map(anteriores.map((a) => [a.numero, a]));
    const ops = linhas.map((l) => {
      const ant = porNumero.get(l.numero);
      const codigo = codigoDaVersaoNova(l.sinapiCodigo, ant?.sinapiCodigo);
      const historico = [...(ant?.sinapiCodigoHistorico ?? [])];
      if (ant && (ant.sinapiCodigo ?? null) !== codigo) {
        historico.push({
          de: ant.sinapiCodigo ?? null,
          para: codigo,
          motivo: MOTIVO_CODIGO_PELA_IMPORTACAO,
          porUserId: new Types.ObjectId(adminId),
          em: agora,
        });
      }
      return {
        updateOne: {
          filter: { contratoId, numero: l.numero, versao: nova },
          update: {
            $set: {
              descricao: l.descricao,
              descricaoBusca: normalizarTextoBusca(l.descricao),
              unidade: l.unidade,
              quantidadeEstimada: l.quantidadeEstimada,
              precoPactuadoCentavos: l.precoPactuadoCentavos,
              sinapiCodigo: codigo,
              sinapiCodigoHistorico: historico,
              // A versão ainda é invisível: o objeto inteiro é seguro aqui. A marca
              // automática nasce falsa e o passo 4 a calcula.
              anomalia: {
                automatica: false,
                referenciaSinapi: null,
                manual: !!ant?.anomalia?.manual,
                motivo: ant?.anomalia?.motivo ?? null,
                porUserId: ant?.anomalia?.porUserId ?? null,
                em: ant?.anomalia?.em ?? null,
              },
              anomaliaHistorico: ant?.anomaliaHistorico ?? [],
            },
          },
          upsert: true,
        },
      };
    });
    for (let i = 0; i < ops.length; i += LOTE_GRAVACAO) {
      await AnexoVItemModel.bulkWrite(
        ops.slice(i, i + LOTE_GRAVACAO) as unknown as Parameters<
          typeof AnexoVItemModel.bulkWrite
        >[0],
        { ordered: false },
      );
    }
    // Sobras de uma tentativa anterior com outro arquivo não entram na versão.
    await AnexoVItemModel.deleteMany({
      contratoId,
      versao: nova,
      numero: { $nin: linhas.map((l) => l.numero) },
    });

    // 3. Vira a chave numa única escrita.
    let virou = false;
    if (base == null) {
      try {
        await AnexoVVigenciaModel.create({
          contratoId,
          versao: nova,
          importacaoId: imp._id,
          em: agora,
        });
        virou = true;
      } catch (e) {
        if (!ehChaveDuplicada(e)) throw e;
      }
    } else {
      const r = await AnexoVVigenciaModel.updateOne(
        { contratoId, versao: base },
        { $set: { versao: nova, importacaoId: imp._id, em: agora } },
      );
      virou = r.modifiedCount === 1;
    }
    if (!virou) {
      const agoraPonteiro = await AnexoVVigenciaModel.findOne({ contratoId }).lean();
      if (String(agoraPonteiro?.importacaoId ?? '') !== String(imp._id)) {
        return descartarPorMudanca(imp._id, ERROS_IMPORTACAO_MATERIAL.anexo_v_mudou);
      }
    }
  }

  // 4. Só aquele contrato.
  await recalcularAnomaliaSemFalhar({ contratoId: String(contratoId) });
  return { ok: true };
}

async function aplicarSinapi(imp: ImportacaoLean, agora: Date): Promise<Resultado> {
  const referencia = imp.referencia!;
  const existente = await SinapiReferenciaModel.findOne({ referencia }).lean();
  const jaVirou = !!existente && String(existente.importacaoId) === String(imp._id);
  if (existente && !jaVirou) {
    return descartarPorMudanca(imp._id, ERROS_IMPORTACAO_MATERIAL.mes_ja_importado);
  }

  if (!jaVirou) {
    // 2. As linhas do mês, ainda invisíveis.
    const linhas = (imp.linhas ?? []) as LinhaSinapi[];
    for (let i = 0; i < linhas.length; i += LOTE_GRAVACAO) {
      await SinapiInsumoModel.bulkWrite(
        linhas.slice(i, i + LOTE_GRAVACAO).map((l) => ({
          updateOne: {
            filter: { referencia, codigo: l.codigo },
            update: {
              $set: {
                descricao: l.descricao,
                unidade: l.unidade,
                precoCentavos: l.precoCentavos,
                uf: SINAPI_UF,
                regime: SINAPI_REGIME,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    await SinapiInsumoModel.deleteMany({
      referencia,
      codigo: { $nin: linhas.map((l) => l.codigo) },
    });

    // 3. O mês passa a existir.
    try {
      await SinapiReferenciaModel.create({
        referencia,
        quantidade: linhas.length,
        importacaoId: imp._id,
        em: agora,
      });
    } catch (e) {
      if (!ehChaveDuplicada(e)) throw e;
      const outro = await SinapiReferenciaModel.findOne({ referencia }).lean();
      if (String(outro?.importacaoId ?? '') !== String(imp._id)) {
        return descartarPorMudanca(imp._id, ERROS_IMPORTACAO_MATERIAL.mes_ja_importado);
      }
    }
  }

  // 4. Só quando este mês virou o mais recente: aí todos os contratos mudam de referência.
  if ((await mesSinapiMaisRecente()) === referencia) {
    await recalcularAnomaliaSemFalhar({ todos: true });
  }
  return { ok: true };
}

export async function aplicarImportacao(importacaoId: string, adminId: string): Promise<Resultado> {
  const id = new Types.ObjectId(importacaoId);
  const agora = new Date();
  const imp = await tomarAplicacao(id, agora);
  if (!imp) {
    const atual = await ImportacaoMaterialModel.findById(id).select('estado').lean();
    return {
      ok: false,
      error:
        atual?.estado === 'aplicando'
          ? ERROS_IMPORTACAO_MATERIAL.em_aplicacao
          : ERROS_IMPORTACAO_MATERIAL.fechada,
    };
  }

  try {
    const r =
      imp.tipo === 'anexo_v'
        ? await aplicarAnexoV(imp, adminId, agora)
        : await aplicarSinapi(imp, agora);
    if (!r.ok) return r;
  } catch (e) {
    // Fica `aplicando`, liberada para o Admin tentar de novo na hora.
    await ImportacaoMaterialModel.updateOne(
      { _id: id, estado: 'aplicando', aplicandoDesde: agora },
      { $set: { aplicandoDesde: new Date(0) } },
    ).catch(() => {});
    throw e;
  }

  // 5. Fecha e enxuga na mesma escrita.
  await ImportacaoMaterialModel.updateOne(
    { _id: id, estado: 'aplicando' },
    {
      $set: {
        estado: 'aplicada',
        emAberto: false,
        aplicandoDesde: null,
        aplicadaPorUserId: new Types.ObjectId(adminId),
        aplicadaEm: agora,
      },
      $unset: UNSET_ENXUGAMENTO,
    },
  );
  return { ok: true };
}
