import 'server-only';

import { DecisaoIaModel } from '@/models/DecisaoIa';

/**
 * Ids de chamado dos dois recortes "Revisão da IA" que dependem da
 * `DecisaoIa` (spec 0009, AC-1/AC-2). Os outros dois recortes (`triagem` e
 * `sem_tecnico`) são campos do próprio `Chamado`; quem monta o filtro deles
 * é a rota, sem passar por aqui.
 *
 * A decisão `ativo` é da regra do cartão, não da IA, e nunca põe um chamado
 * nestes recortes (spec 0014, AC-11).
 */
export async function idsDoRecorte(recorte: 'sem_revisao' | 'corrigidos'): Promise<string[]> {
  if (recorte === 'sem_revisao') {
    const ids = await DecisaoIaModel.distinct('chamadoId', {
      campo: { $ne: 'ativo' },
      efeito: 'aplicado',
      situacao: 'sem_revisao',
    });
    return ids.map(String);
  }

  const ids = await DecisaoIaModel.distinct('chamadoId', {
    campo: { $ne: 'ativo' },
    situacao: 'corrigida',
    'correcoes.origem': 'gestao',
  });
  return ids.map(String);
}
