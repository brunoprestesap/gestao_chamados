'use client';

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Filter,
  type LucideIcon,
  Search,
  Ticket,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { RegisterExecutionDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/RegisterExecutionDialog';
import { type ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import {
  type ChamadoStatus,
  STATUS_ACCENT,
  STATUS_BADGE,
  STATUS_ICONS,
} from '@/app/(dashboard)/meus-chamados/_constants';
import { StatusMultiSelect } from '@/components/StatusMultiSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatDateShort } from '@/lib/utils';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 10;

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Action config — only "Registrar Execução" for the technician view
// ---------------------------------------------------------------------------

interface ActionDef {
  key: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  canShow: (status: string) => boolean;
}

const ACTION_DEFS: ActionDef[] = [
  {
    key: 'registrarExecucao',
    label: 'Registrar Execução',
    icon: ClipboardCheck,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    canShow: (s) => s === 'em atendimento',
  },
];

type ActionHandlers = Record<string, (c: ChamadoDTO) => void>;

function getVisibleActions(status: string) {
  return ACTION_DEFS.filter((a) => a.canShow(status));
}

// ---------------------------------------------------------------------------
// Small presentational components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status as ChamadoStatus];
  const label = CHAMADO_STATUS_LABELS[status as ChamadoStatus] ?? status;
  const badgeClass = STATUS_BADGE[status as ChamadoStatus] ?? '';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        badgeClass,
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      {label}
    </span>
  );
}

function EmptyState({
  hasFilter,
  message,
  onClear,
}: {
  hasFilter: boolean;
  message: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="relative mb-5 flex items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-indigo-100/60 dark:bg-indigo-950/30" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-100 to-blue-100 shadow-sm ring-1 ring-indigo-200/60 dark:from-indigo-900/30 dark:to-blue-900/30 dark:ring-indigo-800/40">
          {hasFilter ? (
            <Filter className="h-6 w-6 text-indigo-500 dark:text-indigo-400" aria-hidden />
          ) : (
            <Ticket className="h-6 w-6 text-indigo-500 dark:text-indigo-400" aria-hidden />
          )}
        </div>
      </div>
      <p className="text-base font-semibold text-foreground">
        {hasFilter ? 'Nenhum resultado encontrado' : 'Nenhum chamado atribuído'}
      </p>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{message}</p>
      {hasFilter && (
        <button
          type="button"
          className="mt-4 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
          onClick={onClear}
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action buttons
// ---------------------------------------------------------------------------

function ActionButtons({
  chamado,
  handlers,
  size = 'sm',
}: {
  chamado: ChamadoDTO;
  handlers: ActionHandlers;
  size?: 'sm' | 'md';
}) {
  const visible = getVisibleActions(chamado.status);
  if (visible.length === 0) return null;

  const btnClass = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {visible.map((def) => {
        const Icon = def.icon;
        return (
          <Tooltip key={def.key}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  btnClass,
                  'touch-manipulation rounded-lg transition-all duration-200 hover:scale-110',
                )}
                onClick={() => handlers[def.key]?.(chamado)}
                aria-label={`${def.label}`}
              >
                <Icon className={cn(iconClass, def.iconColor)} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{def.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i} className="animate-pulse">
          <TableCell className="py-4">
            <Skeleton className="h-4 w-16 rounded-md" />
          </TableCell>
          <TableCell>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48 rounded-md" />
              <Skeleton className="h-3 w-32 rounded-md" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28 rounded-md" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20 rounded-md" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 rounded-md" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function MobileCardsSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-border/50 bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ChamadosAtribuidosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChamadoDTO[]>([]);
  const [chamadoParaExecucao, setChamadoParaExecucao] = useState<ChamadoDTO | null>(null);

  // Filters & Pagination
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<ChamadoStatus[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const setStatusFilter = useCallback((v: ChamadoStatus[]) => {
    setStatus(v);
    setPage(1);
  }, []);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
    if (status.length > 0) p.set('status', status.join(','));
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE));
    return p.toString();
  }, [debouncedQ, status, page]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchChamados = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chamados-atribuidos?${queryString}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'manual',
      });
      if (res.type === 'opaqueredirect' || res.status === 302) {
        router.replace('/dashboard');
        return;
      }
      if (res.status === 401) {
        router.replace('/login?callbackUrl=/chamados-atribuidos');
        return;
      }
      if (res.status === 403) {
        router.replace('/dashboard');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.pagination) setPagination(data.pagination);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [router, queryString]);

  useEffect(() => {
    fetchChamados();
  }, [fetchChamados]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCardClick = useCallback(
    (chamado: ChamadoDTO) => {
      router.push(`/chamados-atribuidos/${chamado._id}`);
    },
    [router],
  );

  const handleRegistrarExecucao = useCallback((chamado: ChamadoDTO) => {
    setChamadoParaExecucao(chamado);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const hasActiveFilter = q.trim() !== '' || status.length > 0;
  const activeFilterCount = (q.trim() !== '' ? 1 : 0) + (status.length > 0 ? 1 : 0);

  const emptyMessage = useMemo(() => {
    if (hasActiveFilter) return 'Tente ajustar a busca ou remover os filtros aplicados.';
    return 'Nenhum chamado atribuído a você no momento.';
  }, [hasActiveFilter]);

  const actionHandlers: ActionHandlers = useMemo(
    () => ({ registrarExecucao: handleRegistrarExecucao }),
    [handleRegistrarExecucao],
  );

  const clearFilters = useCallback(() => {
    setQ('');
    setStatus([]);
    setPage(1);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 sm:space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ----------------------------------------------------------------- */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 gap-y-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20">
              <ClipboardCheck className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Chamados Atribuídos
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Seus chamados em andamento e pendentes de execução
              </p>
            </div>
          </div>
        </div>
        {!loading && (
          <Badge
            variant="outline"
            className="h-8 shrink-0 rounded-full border-violet-200 bg-violet-50 px-3 text-sm font-semibold tabular-nums text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
          >
            {pagination.total} {pagination.total === 1 ? 'chamado' : 'chamados'}
          </Badge>
        )}
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Filter bar — glass card                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-border/50 bg-card/80 px-4 py-3.5 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          {/* Search */}
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Buscar por número, título, local..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-11 rounded-xl pl-9 text-base sm:text-sm"
              aria-label="Buscar chamados"
            />
          </div>

          {/* Desktop: select inline */}
          <div className="hidden shrink-0 sm:block">
            <StatusMultiSelect
              value={status}
              onValueChange={setStatusFilter}
              className="w-[200px]"
            />
          </div>

          {/* Mobile: botao Filtros abre Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="relative h-11 w-full gap-2 rounded-xl border-border/60 sm:hidden"
                aria-label="Abrir filtros"
              >
                <Filter className="h-4 w-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-3xl border-t border-border/50 px-0 pb-8"
            >
              <div className="mb-2 flex justify-center">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
              </div>
              <SheetHeader className="px-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/40">
                    <Filter className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <SheetTitle className="text-lg">Filtros</SheetTitle>
                    <SheetDescription className="text-xs">
                      Refine seus chamados atribuídos
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="space-y-5 px-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status do chamado
                  </label>
                  <StatusMultiSelect value={status} onValueChange={setStatusFilter} />
                </div>
                {hasActiveFilter && (
                  <Button
                    variant="ghost"
                    className="h-11 w-full gap-2 rounded-xl text-sm font-medium text-violet-600 hover:bg-violet-50 hover:text-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30"
                    onClick={clearFilters}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Desktop Table                                                     */}
      {/* ----------------------------------------------------------------- */}
      <div className="relative hidden overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm md:block">
        {/* Accent stripe */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-transparent via-violet-500/50 to-transparent" />

        <div className="overflow-x-auto">
          <div className="min-w-[860px] border-b border-border/50 bg-muted/40 px-5 py-3">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-1">N&ordm;</div>
              <div className="col-span-3">Título</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Serviço</div>
              <div className="col-span-2">Local</div>
              <div className="col-span-1">Data</div>
              <div className="col-span-1 text-right">Ação</div>
            </div>
          </div>

          <Table className="min-w-[860px]">
            <TableHeader className="sr-only">
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableSkeleton />
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      hasFilter={hasActiveFilter}
                      message={emptyMessage}
                      onClear={clearFilters}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow
                    key={row._id}
                    className="group cursor-pointer border-border/40 transition-colors duration-150 hover:bg-violet-50/40 dark:hover:bg-violet-950/20"
                    onClick={() => handleCardClick(row)}
                  >
                    <TableCell className="py-3.5 font-mono text-xs font-medium text-muted-foreground">
                      {row.ticket_number}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="line-clamp-1 font-medium text-foreground transition-colors group-hover:text-violet-700 dark:group-hover:text-violet-300">
                        {row.titulo}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="line-clamp-1 text-sm text-muted-foreground">
                        {row.tipoServico || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="line-clamp-1 text-sm text-muted-foreground">
                        {row.localExato || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {formatDateShort(row.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 text-right">
                      <ActionButtons chamado={row} handlers={actionHandlers} size="sm" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Mobile Cards                                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="md:hidden">
        {loading ? (
          <MobileCardsSkeleton />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20">
            <EmptyState
              hasFilter={hasActiveFilter}
              message={emptyMessage}
              onClear={clearFilters}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => {
              const accentClass = STATUS_ACCENT[row.status as ChamadoStatus] ?? '';
              return (
                <div
                  key={row._id}
                  className={cn(
                    'group relative cursor-pointer overflow-hidden rounded-2xl border border-border/50 border-l-4 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4 active:scale-[0.99]',
                    accentClass,
                  )}
                  onClick={() => handleCardClick(row)}
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                            {row.ticket_number}
                          </span>
                          <StatusBadge status={row.status} />
                        </div>
                        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                          {row.titulo}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {row.tipoServico && (
                            <span className="truncate text-xs text-muted-foreground">
                              {row.tipoServico}
                            </span>
                          )}
                          {row.localExato && (
                            <span className="truncate text-xs text-muted-foreground/70">
                              {row.localExato}
                            </span>
                          )}
                          <span className="text-xs tabular-nums text-muted-foreground/70">
                            {formatDateShort(row.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 pt-1">
                        <ActionButtons chamado={row} handlers={actionHandlers} size="md" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Pagination                                                        */}
      {/* ----------------------------------------------------------------- */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm tabular-nums text-muted-foreground">
            Mostrando{' '}
            <span className="font-medium text-foreground">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>
            {' '}&ndash;{' '}
            <span className="font-medium text-foreground">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>
            {' '}de{' '}
            <span className="font-medium text-foreground">{pagination.total}</span>
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg"
              disabled={page === 1}
              onClick={() => setPage(1)}
              aria-label="Primeira página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="flex h-9 min-w-16 items-center justify-center rounded-lg border border-border/50 bg-card px-3 text-sm font-medium tabular-nums">
              {page} / {pagination.totalPages}
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg"
              disabled={page === pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg"
              disabled={page === pagination.totalPages}
              onClick={() => setPage(pagination.totalPages)}
              aria-label="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Dialogs                                                           */}
      {/* ----------------------------------------------------------------- */}
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
