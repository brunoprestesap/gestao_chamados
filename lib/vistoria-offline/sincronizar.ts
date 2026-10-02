import { LIMITE_LOTE_VISTORIA } from '@/shared/vistoria/vistoria.constants';
import type { RespostaSincronizacao } from '@/shared/vistoria/vistoria.schemas';

import { listarPendentes, registrarResultados } from './fila';

/**
 * Sobe a fila da pessoa (spec 0012, AC-6): pendentes em ordem de `criadaEm`,
 * em lotes de até 50. 401 para tudo e deixa pendente ("Entre de novo"); erro
 * de rede ou 5xx também deixa pendente. Não depende de `navigator.onLine`.
 */

export type ResultadoSincronizacao = {
  estado: 'ok' | 'sessao_expirada' | 'sem_conexao' | 'erro_servidor';
  enviadas: number;
};

export async function sincronizarFila(
  userId: string,
  enviar: typeof fetch = (...a) => fetch(...a),
): Promise<ResultadoSincronizacao> {
  const pendentes = await listarPendentes(userId);
  let enviadas = 0;
  for (let i = 0; i < pendentes.length; i += LIMITE_LOTE_VISTORIA) {
    const lote = pendentes.slice(i, i + LIMITE_LOTE_VISTORIA);
    let res: Response;
    try {
      res = await enviar('/api/vistoria/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacoes: lote.map((o) => o.operacao) }),
        cache: 'no-store',
      });
    } catch {
      return { estado: 'sem_conexao', enviadas };
    }
    if (res.status === 401) return { estado: 'sessao_expirada', enviadas };
    if (!res.ok) return { estado: 'erro_servidor', enviadas };

    let corpo: RespostaSincronizacao;
    try {
      corpo = (await res.json()) as RespostaSincronizacao;
    } catch {
      return { estado: 'erro_servidor', enviadas };
    }
    await registrarResultados(userId, corpo.resultados ?? []);
    enviadas += lote.length;
  }
  return { estado: 'ok', enviadas };
}
