import 'server-only';

import { Types } from 'mongoose';

import { ehChaveDuplicada, falha, type Resultado } from '@/lib/ativos/erros';
import { CampanhaVistoriaModel } from '@/models/CampanhaVistoria';
import { erroCampanhaJaAberta } from '@/shared/vistoria/vistoria.constants';

/**
 * Campanha de vistoria (spec 0012, AC-1): Admin e Preposto abrem e encerram.
 * Uma aberta por vez, garantido pelo índice único parcial; encerrada não
 * reabre. As funções devolvem `Resultado`, como as de `lib/ativos/`.
 */

export type CampanhaResumo = {
  id: string;
  nome: string;
  status: 'aberta' | 'encerrada';
  abertaEm: Date;
  encerradaEm: Date | null;
};

type CampanhaLean = {
  _id: Types.ObjectId;
  nome: string;
  status: 'aberta' | 'encerrada';
  abertaEm: Date;
  encerradaEm?: Date | null;
};

function resumir(c: CampanhaLean): CampanhaResumo {
  return {
    id: String(c._id),
    nome: c.nome,
    status: c.status,
    abertaEm: c.abertaEm,
    encerradaEm: c.encerradaEm ?? null,
  };
}

export async function campanhaAberta(): Promise<CampanhaResumo | null> {
  const c = await CampanhaVistoriaModel.findOne({ status: 'aberta' }).lean<CampanhaLean>();
  return c ? resumir(c) : null;
}

/** A campanha que a cobertura mostra: a aberta; sem ela, a última encerrada (AC-2). */
export async function campanhaDaCobertura(): Promise<CampanhaResumo | null> {
  const aberta = await campanhaAberta();
  if (aberta) return aberta;
  const ultima = await CampanhaVistoriaModel.findOne({ status: 'encerrada' })
    .sort({ encerradaEm: -1 })
    .lean<CampanhaLean>();
  return ultima ? resumir(ultima) : null;
}

export async function abrirCampanha(
  nome: string,
  autorId: string,
): Promise<Resultado<{ id: string }>> {
  const jaAberta = await campanhaAberta();
  if (jaAberta) return falha(erroCampanhaJaAberta(jaAberta.nome));
  try {
    const doc = await CampanhaVistoriaModel.create({
      nome,
      status: 'aberta',
      abertaPor: new Types.ObjectId(autorId),
      abertaEm: new Date(),
    });
    return { ok: true, id: String(doc._id) };
  } catch (e) {
    if (!ehChaveDuplicada(e)) throw e;
    // Outra pessoa abriu uma no mesmo instante: o índice parcial decidiu.
    const vencedora = await campanhaAberta();
    return falha(erroCampanhaJaAberta(vencedora?.nome ?? nome));
  }
}

export async function encerrarCampanha(id: string, autorId: string): Promise<Resultado> {
  if (!Types.ObjectId.isValid(id)) return falha('Campanha inexistente.');
  const r = await CampanhaVistoriaModel.updateOne(
    { _id: id, status: 'aberta' },
    {
      $set: {
        status: 'encerrada',
        encerradaPor: new Types.ObjectId(autorId),
        encerradaEm: new Date(),
      },
    },
  );
  if (r.modifiedCount === 0) return falha('Esta campanha não está aberta.');
  return { ok: true };
}
