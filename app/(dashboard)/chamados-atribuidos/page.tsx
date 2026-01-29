'use client';

import { Building2, Calendar, Loader2, MapPin, Search, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { RegisterExecutionDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/RegisterExecutionDialog';
import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_OPTIONS,
  STATUS_ICONS,
  STATUS_BADGE,
} from '@/app/(dashboard)/meus-chamados/_constants';
import { CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';

const KANBAN_STATUSES = CHAMADO_STATUSES.filter((s) => s !== 'fechado' && s !== 'emvalidacao');

export type ChamadoAtribuidoDTO = {
  _id: string;
  ticket_number: string;
  titulo: string;
  descricao: string;
  status: ChamadoStatus;
  unitId: string | null;
  unitName: string | null;
  localExato: string;
  tipoServico: string;
  naturezaAtendimento: string;
  grauUrgencia: string;
  assignedToUserId: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_EM_ATENDIMENTO = 'em atendimento' as const;

export default function ChamadosAtribuidosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | ChamadoStatus>('all');
  const [items, setItems] = useState<ChamadoAtribuidoDTO[]>([]);
  const [chamadoParaExecucao, setChamadoParaExecucao] = useState<ChamadoAtribuidoDTO | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status !== 'all') p.set('status', status);
    return p.toString();
  }, [q, status]);

  async function fetchChamados() {
    setLoading(true);
    const url = queryString
      ? `/api/chamados-atribuidos?${queryString}`
      : '/api/chamados-atribuidos';
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (res.status === 401) {
      router.replace('/login?callbackUrl=/chamados-atribuidos');
      setLoading(false);
      return;
    }
    if (res.status === 403) {
      router.replace('/dashboard');
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setItems(Array.isArray(data.items) ? data.items : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchChamados();
  }, [queryString]);

  const emptyMessage =
    q.trim() || status !== 'all'
      ? 'Tente ajustar os filtros de busca ou status.'
      : 'Nenhum chamado atribuído a você no momento.';

  const itemsByStatus = useMemo(() => {
    const map: Record<string, ChamadoAtribuidoDTO[]> = {};
    KANBAN_STATUSES.forEach((s) => {
      map[s] = items.filter((c) => c.status === s);
    });
    return map;
  }, [items]);

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chamados Atribuídos"
        subtitle="Chamados atribuídos a você. Clique em um card para ver detalhes e registrar execução."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou descrição..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando chamados...</p>
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Wrench className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">Nenhum chamado encontrado</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-muted/30 pb-2">
          <div className="flex min-w-max gap-4 p-4">
            {KANBAN_STATUSES.map((statusKey) => {
              const columnItems = itemsByStatus[statusKey] ?? [];
              const label = CHAMADO_STATUS_LABELS[statusKey];
              return (
                <div
                  key={statusKey}
                  className="flex w-[300px] shrink-0 flex-col rounded-lg border bg-card shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <span className="font-semibold text-foreground">{label}</span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground">
                      {columnItems.length}
                    </span>
                  </div>
                  <ScrollArea className="h-[calc(100vh-16rem)] min-h-[280px]">
                    <div className="flex flex-col gap-3 p-3">
                      {columnItems.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          Nenhum chamado neste status
                        </p>
                      ) : (
                        columnItems.map((c) => {
                          const StatusIcon = STATUS_ICONS[c.status];
                          return (
                            <Card
                              key={c._id}
                              className="cursor-pointer border transition-all hover:border-primary/30 hover:shadow-md"
                              onClick={() => router.push(`/chamados-atribuidos/${c._id}`)}
                            >
                              <CardContent className="p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-sm font-bold tabular-nums text-foreground">
                                    #{c.ticket_number || c._id.slice(-6)}
                                  </h3>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[c.status]}`}
                                  >
                                    <StatusIcon className="h-3 w-3 shrink-0" />
                                    {CHAMADO_STATUS_LABELS[c.status]}
                                  </span>
                                </div>
                                <p
                                  className="mt-1.5 line-clamp-1 text-sm font-medium text-foreground"
                                  title={c.titulo || 'Sem título'}
                                >
                                  {c.titulo || 'Sem título'}
                                </p>
                                {c.unitName && (
                                  <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
                                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span
                                      className="truncate text-xs font-medium text-foreground"
                                      title={c.unitName}
                                    >
                                      {c.unitName}
                                    </span>
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  {c.localExato && (
                                    <span className="flex items-center gap-1" title={c.localExato}>
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span className="truncate max-w-[140px]">{c.localExato}</span>
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3 shrink-0" />
                                    {formatDate(c.createdAt)}
                                  </span>
                                </div>
                                <p
                                  className="mt-1.5 line-clamp-1 text-xs leading-relaxed text-muted-foreground"
                                  title={c.descricao || 'Sem descrição'}
                                >
                                  {c.descricao || 'Sem descrição'}
                                </p>
                                {c.status === STATUS_EM_ATENDIMENTO && c.assignedToUserId && (
                                  <div className="mt-3 flex justify-end border-t pt-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-7 gap-1.5 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setChamadoParaExecucao(c);
                                      }}
                                    >
                                      <Wrench className="h-3 w-3" />
                                      Registrar Execução
                                    </Button>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <RegisterExecutionDialog
        open={!!chamadoParaExecucao}
        onOpenChange={(open) => !open && setChamadoParaExecucao(null)}
        chamado={
          chamadoParaExecucao
            ? { _id: chamadoParaExecucao._id, createdAt: chamadoParaExecucao.createdAt }
            : null
        }
        onSuccess={() => {
          setChamadoParaExecucao(null);
          fetchChamados();
        }}
      />
    </div>
  );
}
