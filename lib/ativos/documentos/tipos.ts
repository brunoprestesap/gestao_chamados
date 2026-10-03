import 'server-only';

import { Types } from 'mongoose';

import { TipoDocumentoModel } from '@/models/TipoDocumento';

import { ehChaveDuplicada, falha, type Resultado } from '../erros';

/** Tipos de documento (spec 0013, AC-1). Só o Admin chega aqui. A chave nunca muda. */

export type TipoDocumentoLinha = {
  id: string;
  chave: string;
  nome: string;
  isActive: boolean;
  totalVigentes: number;
};

const ERRO_REPETIDO = 'Já existe um tipo com essa chave ou esse nome.';

export async function criarTipoDocumento(d: {
  chave: string;
  nome: string;
}): Promise<Resultado<{ id: string }>> {
  try {
    const doc = await TipoDocumentoModel.create({ chave: d.chave, nome: d.nome, isActive: true });
    return { ok: true, id: String(doc._id) };
  } catch (e) {
    if (ehChaveDuplicada(e)) return falha(ERRO_REPETIDO);
    throw e;
  }
}

export async function renomearTipoDocumento(id: string, nome: string): Promise<Resultado> {
  if (!Types.ObjectId.isValid(id)) return falha('Tipo inexistente.');
  try {
    const r = await TipoDocumentoModel.updateOne({ _id: id }, { $set: { nome } });
    if (r.matchedCount === 0) return falha('Tipo inexistente.');
    return { ok: true };
  } catch (e) {
    if (ehChaveDuplicada(e)) return falha(ERRO_REPETIDO);
    throw e;
  }
}

/**
 * Ativa ou desativa. Desativado some das escolhas de cadastro e de exigência,
 * mas os documentos já cadastrados continuam visíveis e alertando.
 */
export async function alternarTipoDocumento(id: string): Promise<Resultado<{ isActive: boolean }>> {
  if (!Types.ObjectId.isValid(id)) return falha('Tipo inexistente.');
  const atual = await TipoDocumentoModel.findById(id)
    .select('isActive')
    .lean<{ isActive: boolean }>();
  if (!atual) return falha('Tipo inexistente.');
  const isActive = atual.isActive === false;
  await TipoDocumentoModel.updateOne({ _id: id }, { $set: { isActive } });
  return { ok: true, isActive };
}
