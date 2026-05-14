'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { SlaHealthChart } from './SlaHealthChart';
import { SlaKpiCards } from './SlaKpiCards';
import { SlaPriorityBreakdown } from './SlaPriorityBreakdown';
import { SlaTicketTable } from './SlaTicketTable';

const POLL_INTERVAL_MS = 60_000;

interface SlaDashboardData {
  items: Array<{
    _id: string;
    ticket_number: string;
    titulo: string;
    status: string;
    tipoServico: string;
    finalPriority: string | null;
    assignedToUserId: string | null;
    assignedToUserName: string | null;
    remainingMs: number;
    totalMs: number;
    percentUsed: number;
    slaStatus: 'no_prazo' | 'proximo_vencimento' | 'atrasado';
    responseDueAt: string | null;
    resolutionDueAt: string | null;
    isPaused: boolean;
  }>;
  summary: {
    total: number;
    noPrazo: number;
    proximoVencimento: number;
    atrasado: number;
  };
  byPriority: Array<{
    priority: string;
    total: number;
    noPrazo: number;
    proximoVencimento: number;
    atrasado: number;
  }>;
  byTipoServico: Array<{
    tipoServico: string;
    total: number;
    noPrazo: number;
    proximoVencimento: number;
    atrasado: number;
  }>;
}

function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min`;
}

export function SlaDashboardClient() {
  const [data, setData] = useState<SlaDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<number>(() => Date.now());
  const [elapsed, setElapsed] = useState('0s');
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (isManual = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (isManual) setRefreshing(true);

    try {
      const res = await fetch('/api/sla/dashboard', {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Erro ao buscar dados');
      const json: SlaDashboardData = await res.json();
      setData(json);
      setLastFetchAt(Date.now());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch inicial
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling a cada 60s
  useEffect(() => {
    const id = setInterval(() => fetchData(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Atualiza elapsed timer a cada segundo
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(formatElapsed(Date.now() - lastFetchAt));
    }, 1000);
    return () => clearInterval(id);
  }, [lastFetchAt]);

  // Socket.IO refresh instantâneo
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => fetchData(), 2000);
    };
    window.addEventListener('notification:new', handler);
    return () => {
      window.removeEventListener('notification:new', handler);
      if (timeout) clearTimeout(timeout);
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = data?.summary ?? { total: 0, noPrazo: 0, proximoVencimento: 0, atrasado: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel de Gestão SLA"
        subtitle="Monitoramento em tempo real dos prazos de SLA"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              Atualizado há {elapsed}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        }
      />

      <SlaKpiCards summary={summary} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SlaHealthChart
          noPrazo={summary.noPrazo}
          proximoVencimento={summary.proximoVencimento}
          atrasado={summary.atrasado}
        />
        <SlaPriorityBreakdown data={data?.byPriority ?? []} />
      </div>

      <SlaTicketTable items={data?.items ?? []} />
    </div>
  );
}
