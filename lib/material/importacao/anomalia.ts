import 'server-only';

import { Types } from 'mongoose';

import { AnexoVItemModel } from '@/models/AnexoVItem';
import { AnexoVVigenciaModel } from '@/models/AnexoVVigencia';
import { SinapiInsumoModel } from '@/models/SinapiInsumo';
import { acimaDoPercentual } from '@/shared/material/valores';

import { lerMaterialConfig } from '../config';
import { mesSinapiMaisRecente } from '../precos';

/**
 * A marca automática da lista de conferência obrigatória (spec 0019, AC-29,
 * _Anomalia automática_): o item vigente do Anexo V cujo preço pactuado passa
 * do SINAPI do mês mais recente além do percentual. Sem código, ou com código
 * fora do mês, a marca é falsa. Nunca mexe em `anomalia.manual`: só grava
 * `anomalia.automatica` e `anomalia.referenciaSinapi`, por caminho de campo.
 */

export type AlvoRecalculo = { contratoId: string } | { anexoVItemId: string } | { todos: true };

type ItemParaRecalculo = {
  _id: Types.ObjectId;
  precoPactuadoCentavos: number;
  sinapiCodigo: string | null;
  anomalia?: { automatica?: boolean; referenciaSinapi?: string | null } | null;
};

/** A marca automática de um item, em inteiros. Pura. */
export function marcaAutomatica(
  precoPactuadoCentavos: number,
  precoSinapiCentavos: number | null | undefined,
  percentual: number,
): boolean {
  if (precoSinapiCentavos == null) return false;
  return acimaDoPercentual(precoPactuadoCentavos, precoSinapiCentavos, percentual);
}

async function itensDoAlvo(alvo: AlvoRecalculo): Promise<ItemParaRecalculo[]> {
  const campos = 'precoPactuadoCentavos sinapiCodigo anomalia';
  if ('anexoVItemId' in alvo) {
    return AnexoVItemModel.find({ _id: new Types.ObjectId(alvo.anexoVItemId) })
      .select(campos)
      .lean<ItemParaRecalculo[]>();
  }
  const ponteiros =
    'contratoId' in alvo
      ? await AnexoVVigenciaModel.find({ contratoId: new Types.ObjectId(alvo.contratoId) }).lean()
      : await AnexoVVigenciaModel.find().lean();
  if (ponteiros.length === 0) return [];
  return AnexoVItemModel.find({
    $or: ponteiros.map((p) => ({ contratoId: p.contratoId, versao: p.versao })),
  })
    .select(campos)
    .lean<ItemParaRecalculo[]>();
}

/**
 * Recalcula a marca automática do alvo. Roda ao aplicar um Anexo V (aquele
 * contrato), ao aplicar um mês SINAPI que vira o mais recente (todos) e ao
 * corrigir o código de um item (aquele item).
 */
export async function recalcularAnomalia(alvo: AlvoRecalculo): Promise<{ atualizados: number }> {
  const [itens, mes, config] = await Promise.all([
    itensDoAlvo(alvo),
    mesSinapiMaisRecente(),
    lerMaterialConfig(),
  ]);
  if (itens.length === 0) return { atualizados: 0 };
  const codigos = [...new Set(itens.map((i) => i.sinapiCodigo).filter((c): c is string => !!c))];
  const precos = new Map<string, number>();
  if (mes && codigos.length) {
    const insumos = await SinapiInsumoModel.find({ referencia: mes, codigo: { $in: codigos } })
      .select('codigo precoCentavos')
      .lean();
    for (const s of insumos) precos.set(s.codigo, s.precoCentavos);
  }

  const ops = [];
  for (const i of itens) {
    const precoSinapi = i.sinapiCodigo ? precos.get(i.sinapiCodigo) : undefined;
    const automatica = marcaAutomatica(
      i.precoPactuadoCentavos,
      precoSinapi,
      config.percentualSinapi,
    );
    const referenciaSinapi = precoSinapi != null ? mes : null;
    if (
      !!i.anomalia?.automatica === automatica &&
      (i.anomalia?.referenciaSinapi ?? null) === referenciaSinapi
    ) {
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: i._id },
        update: {
          $set: {
            'anomalia.automatica': automatica,
            'anomalia.referenciaSinapi': referenciaSinapi,
          },
        },
      },
    });
  }
  if (ops.length) await AnexoVItemModel.bulkWrite(ops, { ordered: false });
  return { atualizados: ops.length };
}

/** O recálculo como passo que não desfaz nada: a falha fica no log e o próximo corrige. */
export async function recalcularAnomaliaSemFalhar(alvo: AlvoRecalculo): Promise<void> {
  try {
    await recalcularAnomalia(alvo);
  } catch (e) {
    console.error('[material] recálculo da anomalia falhou; o próximo recálculo corrige:', e);
  }
}
