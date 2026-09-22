import 'server-only';

import { dbConnect } from '@/lib/db';
import { UnitModel } from '@/models/unit';

import type { UnidadeNaTela } from '../_types';

/**
 * As unidades ativas, em ordem de nome, para a troca de unidade no cartão
 * resumo (spec 0004, AC-6). Carregadas uma vez no `layout.tsx`, então o cartão
 * abre sem esperar rede. Falha na leitura devolve lista vazia: o cartão ainda
 * mostra a unidade do perfil, só não deixa trocar.
 */
export async function lerUnidadesAtivas(): Promise<UnidadeNaTela[]> {
  try {
    await dbConnect();
    const docs = await UnitModel.find({ isActive: true })
      .select('name floor')
      .sort({ name: 1 })
      .lean();
    return docs.map((doc) => ({
      id: String(doc._id),
      nome: String(doc.name ?? '').trim() || 'Unidade sem nome',
      andar: String(doc.floor ?? '').trim(),
    }));
  } catch (err) {
    console.error('[conversas] unidades indisponiveis:', err instanceof Error ? err.name : 'erro');
    return [];
  }
}
