import 'server-only';

import { Types } from 'mongoose';

import { MATERIAL_CONFIG_CHAVE, MaterialConfigModel } from '@/models/MaterialConfig';
import { UserModel } from '@/models/user.model';
import type { ParametrosInput } from '@/shared/material/cotacao.schemas';
import {
  type CampoParametro,
  CAMPOS_PARAMETROS,
  CHECAGEM_ATIVA_PADRAO,
  MATERIAL_CONFIG_PADRAO,
} from '@/shared/material/material.constants';
import { ERROS_PARAMETROS } from '@/shared/material/mensagens';

import { lerMaterialConfig, type ParametrosMaterial } from './config';
import { recalcularAnomalia } from './importacao/anomalia';

/**
 * Os parâmetros do fluxo de material editados pelo Admin (spec 0019, AC-42).
 * Gravar acrescenta uma linha de histórico por campo que mudou, na mesma
 * escrita, condicional pelos quatro valores lidos: outro Admin que gravou
 * antes faz esta gravação ser recusada.
 */

export type HistoricoParametro = {
  campo: CampoParametro | 'checagemAlmoxarifadoAtiva';
  de: string | number | boolean | null;
  para: string | number | boolean | null;
  porNome: string | null;
  em: string;
};

export type ParametrosComHistorico = ParametrosMaterial & { historico: HistoricoParametro[] };

/** Os parâmetros vigentes e o histórico, do mais recente para o mais antigo. */
export async function lerParametros(): Promise<ParametrosComHistorico> {
  const [vigentes, doc] = await Promise.all([
    lerMaterialConfig(),
    MaterialConfigModel.findOne({ chave: MATERIAL_CONFIG_CHAVE }).select('historico').lean(),
  ]);
  const historico = doc?.historico ?? [];
  const ids = [...new Set(historico.map((h) => String(h.porUserId)))];
  const usuarios = ids.length
    ? await UserModel.find({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) } })
        .select('name')
        .lean()
    : [];
  const nomes = new Map(usuarios.map((u) => [String(u._id), (u.name as string) ?? null]));
  return {
    ...vigentes,
    historico: [...historico].reverse().map((h) => ({
      campo: h.campo as HistoricoParametro['campo'],
      de: (h.de as HistoricoParametro['de']) ?? null,
      para: (h.para as HistoricoParametro['para']) ?? null,
      porNome: nomes.get(String(h.porUserId)) ?? null,
      em: h.em.toISOString(),
    })),
  };
}

/** O filtro de um campo pelo valor lido; o padrão também casa com o campo ausente. */
function condicaoDoCampo(campo: CampoParametro, lido: string | number) {
  if (lido === MATERIAL_CONFIG_PADRAO[campo]) {
    return { $or: [{ [campo]: lido }, { [campo]: { $exists: false } }] };
  }
  return { [campo]: lido };
}

export async function salvarParametros(
  adminId: string,
  entrada: ParametrosInput,
  agora: Date = new Date(),
): Promise<{ ok: true; aviso?: string } | { ok: false; error: string }> {
  const { lidos, novos } = entrada;
  const mudancas = CAMPOS_PARAMETROS.filter((c) => lidos[c] !== novos[c]).map((campo) => ({
    campo,
    de: lidos[campo],
    para: novos[campo],
    porUserId: new Types.ObjectId(adminId),
    em: agora,
  }));
  if (mudancas.length === 0) return { ok: false, error: ERROS_PARAMETROS.nada_mudou };

  try {
    const r = await MaterialConfigModel.updateOne(
      {
        chave: MATERIAL_CONFIG_CHAVE,
        $and: CAMPOS_PARAMETROS.map((c) => condicaoDoCampo(c, lidos[c])),
      },
      { $set: { ...novos }, $push: { historico: { $each: mudancas } } },
      { upsert: true, runValidators: true },
    );
    if (r.matchedCount === 0 && r.upsertedCount === 0) {
      return { ok: false, error: ERROS_PARAMETROS.mudou };
    }
  } catch (e) {
    // Sem documento, dois `upsert` simultâneos: o segundo perde pelo índice único da chave.
    // Com documento, quem leu valores velhos não casa e também cai no índice único.
    if ((e as { code?: number }).code === 11000)
      return { ok: false, error: ERROS_PARAMETROS.mudou };
    throw e;
  }

  // O percentual muda a marca automática de anomalia de todo o Anexo V vigente.
  if (lidos.percentualSinapi !== novos.percentualSinapi) {
    try {
      await recalcularAnomalia({ todos: true });
    } catch (e) {
      console.error('[material] recálculo da anomalia depois dos parâmetros falhou:', e);
      return { ok: true, aviso: ERROS_PARAMETROS.recalculo_falhou };
    }
  }
  return { ok: true };
}

/**
 * Liga ou desliga a checagem do almoxarifado (spec 0024, AC-1). Vale só para as
 * cotações novas: nada aqui mexe nas que já estão em `em_checagem`. A gravação é
 * condicional ao valor lido, e o campo ausente casa com o padrão (desligado).
 */
export async function salvarChecagemAtiva(
  adminId: string,
  entrada: { lido: boolean; novo: boolean },
  agora: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { lido, novo } = entrada;
  if (lido === novo) return { ok: false, error: ERROS_PARAMETROS.nada_mudou };
  const condicao =
    lido === CHECAGEM_ATIVA_PADRAO
      ? {
          $or: [
            { checagemAlmoxarifadoAtiva: lido },
            { checagemAlmoxarifadoAtiva: { $exists: false } },
          ],
        }
      : { checagemAlmoxarifadoAtiva: lido };
  try {
    const r = await MaterialConfigModel.updateOne(
      { chave: MATERIAL_CONFIG_CHAVE, ...condicao },
      {
        $set: { checagemAlmoxarifadoAtiva: novo },
        $push: {
          historico: {
            campo: 'checagemAlmoxarifadoAtiva',
            de: lido,
            para: novo,
            porUserId: new Types.ObjectId(adminId),
            em: agora,
          },
        },
      },
      { upsert: true, runValidators: true },
    );
    if (r.matchedCount === 0 && r.upsertedCount === 0) {
      return { ok: false, error: ERROS_PARAMETROS.mudou };
    }
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      return { ok: false, error: ERROS_PARAMETROS.mudou };
    }
    throw e;
  }
  return { ok: true };
}
