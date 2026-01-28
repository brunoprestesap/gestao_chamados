'use client';

import { Clock, Loader2, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { CHAMADO_HISTORY_ACTION_LABELS } from '@/shared/chamados/history.constants';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';

type HistoryItemDTO = {
  _id: string;
  chamadoId: string;
  userId: string;
  action: string;
  statusAnterior: string | null;
  statusNovo: string | null;
  observacoes: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  chamadoId: string;
  refreshTrigger?: number;
};

export function HistoryTimeline({ chamadoId, refreshTrigger }: Props) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryItemDTO[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamadoId, refreshTrigger]);

  async function fetchHistory() {
    setLoading(true);
    try {
      const res = await fetch(`/api/chamados/${chamadoId}/history`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        console.error('Erro ao buscar histórico');
        return;
      }
      const data = await res.json().catch(() => ({}));
      const items = (data.items ?? []) as HistoryItemDTO[];
      setHistory(items);

      // Busca nomes dos usuários (em paralelo)
      const userIds = [...new Set(items.map((h) => h.userId))];
      const usersMap: Record<string, string> = {};

      // Busca todos os usuários de uma vez se possível, ou em paralelo
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userRes = await fetch(`/api/users/${userId}`, { cache: 'no-store' });
            if (userRes.ok) {
              const userData = await userRes.json().catch(() => ({}));
              usersMap[userId] = userData.item?.name || 'Usuário desconhecido';
            } else {
              usersMap[userId] = 'Usuário desconhecido';
            }
          } catch {
            usersMap[userId] = 'Usuário desconhecido';
          }
        }),
      );
      setUsers(usersMap);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Nenhum registro de histórico encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history.map((item, index) => {
        const isLast = index === history.length - 1;
        const userName = users[item.userId] || 'Carregando...';

        return (
          <div key={item._id} className="relative flex gap-4">
            {/* Linha vertical */}
            {!isLast && <div className="absolute left-[11px] top-6 h-full w-0.5 bg-border" />}

            {/* Ícone */}
            <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Clock className="h-3 w-3 text-primary" />
            </div>

            {/* Conteúdo */}
            <div className="flex-1 space-y-1 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {CHAMADO_HISTORY_ACTION_LABELS[
                      item.action as keyof typeof CHAMADO_HISTORY_ACTION_LABELS
                    ] || item.action}
                  </p>
                  {item.statusAnterior && item.statusNovo && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Status alterado de{' '}
                      <span className="font-medium">
                        {CHAMADO_STATUS_LABELS[
                          item.statusAnterior as keyof typeof CHAMADO_STATUS_LABELS
                        ] || item.statusAnterior}
                      </span>{' '}
                      para{' '}
                      <span className="font-medium">
                        {CHAMADO_STATUS_LABELS[
                          item.statusNovo as keyof typeof CHAMADO_STATUS_LABELS
                        ] || item.statusNovo}
                      </span>
                    </p>
                  )}
                  {item.observacoes && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.observacoes}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{userName}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDate(item.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
