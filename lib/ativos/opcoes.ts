import 'server-only';

import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import type { Criticidade } from '@/shared/ativos/ativo.constants';

export type OpcaoCategoriaAtivo = { id: string; nome: string; criticidadePadrao: Criticidade };

/** Categorias ativas, por nome, para os formulários e o filtro da lista. */
export async function listarCategoriasAtivas(): Promise<OpcaoCategoriaAtivo[]> {
  const docs = await CategoriaAtivoModel.find({ isActive: true })
    .sort({ nome: 1 })
    .select('nome criticidadePadrao')
    .lean();
  return docs.map((c) => ({
    id: String(c._id),
    nome: c.nome,
    criticidadePadrao: c.criticidadePadrao as Criticidade,
  }));
}
