import 'server-only';

import { Types } from 'mongoose';

import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { TipoDocumentoModel } from '@/models/TipoDocumento';
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
  limiteCorretivos12m?: number;
  limiteReincidencia90d?: number;
  serviceSubTypeId?: string;
};

const ERRO_REPETIDA = 'Já existe uma categoria com essa chave ou esse nome.';

async function subtipoValido(id?: string): Promise<boolean> {
  if (!id) return true;
  if (!Types.ObjectId.isValid(id)) return false;
  return !!(await ServiceSubTypeModel.exists({ _id: id }));
}

/**
 * Ao salvar, `exigeDocumento` guarda só chaves que existem em `TipoDocumento`,
 * ativas ou não (spec 0013, AC-2): um valor antigo "não reconhecido" some aqui.
 */
async function soChavesConhecidas(chaves: string[]): Promise<string[]> {
  if (chaves.length === 0) return [];
  const conhecidas = await TipoDocumentoModel.find({ chave: { $in: chaves } })
    .select('chave')
    .lean<{ chave: string }[]>();
  const existe = new Set(conhecidas.map((t) => t.chave));
  return chaves.filter((c) => existe.has(c));
}

/** Tudo que o Admin pode mudar; a `chave` só entra na criação. */
function camposEditaveis(d: DadosCategoria) {
  return {
    nome: d.nome,
    criticidadePadrao: d.criticidadePadrao,
    periodicidadePreventivaDias: d.periodicidadePreventivaDias ?? null,
    exigeDocumento: d.exigeDocumento,
    vidaUtilAnos: d.vidaUtilAnos ?? null,
    // Vazio grava `null`, inclusive ao limpar: a regra usa o padrão (spec 0015, AC-6).
    limiteCorretivos12m: d.limiteCorretivos12m ?? null,
    limiteReincidencia90d: d.limiteReincidencia90d ?? null,
    serviceSubTypeId: d.serviceSubTypeId ? new Types.ObjectId(d.serviceSubTypeId) : null,
  };
}

export async function criarCategoria(d: DadosCategoria): Promise<Resultado<{ id: string }>> {
  if (!(await subtipoValido(d.serviceSubTypeId))) return falha('Subtipo de serviço inválido.');
  const exigeDocumento = await soChavesConhecidas(d.exigeDocumento);
  try {
    const doc = await CategoriaAtivoModel.create({
      chave: d.chave,
      ...camposEditaveis({ ...d, exigeDocumento }),
    });
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
  const exigeDocumento = await soChavesConhecidas(d.exigeDocumento);
  try {
    const r = await CategoriaAtivoModel.updateOne(
      { _id: id },
      { $set: camposEditaveis({ ...d, exigeDocumento }) },
    );
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
