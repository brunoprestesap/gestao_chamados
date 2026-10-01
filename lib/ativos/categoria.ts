import 'server-only';

import { Types } from 'mongoose';

import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import type { Criticidade } from '@/shared/ativos/ativo.constants';

import { ehChaveDuplicada, falha, type Resultado } from './erros';

/** Categorias de ativo (spec 0011, AC-3). Só o Admin chega aqui. */

export type DadosCategoria = {
  chave: string;
  nome: string;
  criticidadePadrao: Criticidade;
  periodicidadePreventivaDias?: number;
  exigeDocumento: string[];
  vidaUtilAnos?: number;
  serviceSubTypeId?: string;
};

const ERRO_REPETIDA = 'Já existe uma categoria com essa chave ou esse nome.';

async function subtipoValido(id?: string): Promise<boolean> {
  if (!id) return true;
  if (!Types.ObjectId.isValid(id)) return false;
  return !!(await ServiceSubTypeModel.exists({ _id: id }));
}

/** Tudo que o Admin pode mudar; a `chave` só entra na criação. */
function camposEditaveis(d: DadosCategoria) {
  return {
    nome: d.nome,
    criticidadePadrao: d.criticidadePadrao,
    periodicidadePreventivaDias: d.periodicidadePreventivaDias ?? null,
    exigeDocumento: d.exigeDocumento,
    vidaUtilAnos: d.vidaUtilAnos ?? null,
    serviceSubTypeId: d.serviceSubTypeId ? new Types.ObjectId(d.serviceSubTypeId) : null,
  };
}

export async function criarCategoria(d: DadosCategoria): Promise<Resultado<{ id: string }>> {
  if (!(await subtipoValido(d.serviceSubTypeId))) return falha('Subtipo de serviço inválido.');
  try {
    const doc = await CategoriaAtivoModel.create({ chave: d.chave, ...camposEditaveis(d) });
    return { ok: true, id: String(doc._id) };
  } catch (e) {
    if (ehChaveDuplicada(e)) return falha(ERRO_REPETIDA);
    throw e;
  }
}

export async function editarCategoria(id: string, d: DadosCategoria): Promise<Resultado> {
  if (!Types.ObjectId.isValid(id)) return falha('Categoria inexistente.');
  if (!(await subtipoValido(d.serviceSubTypeId))) return falha('Subtipo de serviço inválido.');
  // A `chave` não muda depois de criada: a carga do Tier A acha as categorias
  // por ela, e trocar a chave faria uma nova carga tentar duplicar o nome.
  try {
    const r = await CategoriaAtivoModel.updateOne({ _id: id }, { $set: camposEditaveis(d) });
    if (r.matchedCount === 0) return falha('Categoria inexistente.');
    return { ok: true };
  } catch (e) {
    if (ehChaveDuplicada(e)) return falha(ERRO_REPETIDA);
    throw e;
  }
}

/** Desativar só tira a categoria dos formulários; os ativos dela continuam. */
export async function desativarCategoria(id: string): Promise<Resultado> {
  if (!Types.ObjectId.isValid(id)) return falha('Categoria inexistente.');
  const r = await CategoriaAtivoModel.updateOne({ _id: id }, { $set: { isActive: false } });
  if (r.matchedCount === 0) return falha('Categoria inexistente.');
  return { ok: true };
}
