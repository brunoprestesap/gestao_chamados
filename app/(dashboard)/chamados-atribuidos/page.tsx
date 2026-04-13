'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Columns3,
  Filter,
  Search,
  Ticket,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { RegisterExecutionDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/RegisterExecutionDialog';
import {
  ChamadoCard,
  type ChamadoDTO,
} from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { type ChamadoStatus, STATUS_OPTIONS } from '@/app/(dashboard)/meus-chamados/_constants';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CHAMADO_STATUS_LABELS, CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';

const KANBAN_STATUSES = CHAMADO_STATUSES.filter((s) => s !== 'fechado' && s !== 'emvalidacao');

const DEBOUNCE_MS = 300;

// Visual config per kanban column
const COLUMN_CONFIG: Record<
  string,
  {
    accent: string;
    headerBg: string;
    headerText: string;
    countBg: string;
    countText: string;
    topBorder: string;
    dotColor: string;
    emptyText: string;
  }
> = {
  aberto: {
    accent: 'from-amber-400 to-orange-400',
    headerBg: 'bg-amber-50/80 dark:bg-amber-950/20',
    headerText: 'text-amber-900 dark:text-amber-200',
    countBg: 'bg-amber-100 dark:bg-amber-900/40',
    countText: 'text-amber-700 dark:text-amber-300',
    topBorder: 'border-t-amber-400',
    dotColor: 'bg-amber-400',
    emptyText: 'Sem chamados abertos',
  },
  validado: {
    accent: 'from-teal-400 to-emerald-400',
    headerBg: 'bg-teal-50/80 dark:bg-teal-950/20',
    headerText: 'text-teal-900 dark:text-teal-200',
    countBg: 'bg-teal-100 dark:bg-teal-900/40',
    countText: 'text-teal-700 dark:text-teal-300',
    topBorder: 'border-t-teal-400',
    dotColor: 'bg-teal-400',
    emptyText: 'Sem chamados validados',
  },
  'em atendimento': {
    accent: 'from-violet-400 to-purple-400',
    headerBg: 'bg-violet-50/80 dark:bg-violet-950/20',
    headerText: 'text-violet-900 dark:text-violet-200',
    countBg: 'bg-violet-100 dark:bg-violet-900/40',
    countText: 'text-violet-700 dark:text-violet-300',
    topBorder: 'border-t-violet-400',
    dotColor: 'bg-violet-400',
    emptyText: 'Nenhum em atendimento',
  },
  concluído: {
    accent: 'from-emerald-400 to-green-400',
    headerBg: 'bg-emerald-50/80 dark:bg-emerald-950/20',
    headerText: 'text-emerald-900 dark:text-emerald-200',
    countBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    countText: 'text-emerald-700 dark:text-emerald-300',
    topBorder: 'border-t-emerald-400',
    dotColor: 'bg-emerald-400',
    emptyText: 'Nenhum concluído',
  },
  aguardando_solicitante: {
    accent: 'from-amber-300 to-yellow-400',
    headerBg: 'bg-amber-50/80 dark:bg-amber-950/20',
    headerText: 'text-amber-900 dark:text-amber-200',
    countBg: 'bg-amber-100 dark:bg-amber-900/40',
    countText: 'text-amber-700 dark:text-amber-300',
    topBorder: 'border-t-amber-300',
    dotColor: 'bg-amber-300',
    emptyText: 'Nenhum aguardando',
  },
  aguardando_terceiros: {
    accent: 'from-orange-400 to-amber-400',
    headerBg: 'bg-orange-50/80 dark:bg-orange-950/20',
    headerText: 'text-orange-900 dark:text-orange-200',
    countBg: 'bg-orange-100 dark:bg-orange-900/40',
    countText: 'text-orange-700 dark:text-orange-300',
    topBorder: 'border-t-orange-400',
    dotColor: 'bg-orange-400',
    emptyText: 'Nenhum aguardando terceiros',
  },
  encerrado: {
    accent: 'from-emerald-500 to-teal-500',
    headerBg: 'bg-emerald-50/80 dark:bg-emerald-950/20',
    headerText: 'text-emerald-900 dark:text-emerald-200',
    countBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    countText: 'text-emerald-700 dark:text-emerald-300',
    topBorder: 'border-t-emerald-500',
    dotColor: 'bg-emerald-500',
    emptyText: 'Nenhum encerrado',
  },
  cancelado: {
    accent: 'from-red-400 to-rose-400',
    headerBg: 'bg-red-50/80 dark:bg-red-950/20',
    headerText: 'text-red-900 dark:text-red-200',
    countBg: 'bg-red-100 dark:bg-red-900/40',
    countText: 'text-red-700 dark:text-red-300',
    topBorder: 'border-t-red-400',
    dotColor: 'bg-red-400',
    emptyText: 'Nenhum cancelado',
  },
  recusado: {
    accent: 'from-rose-400 to-pink-400',
    headerBg: 'bg-rose-50/80 dark:bg-rose-950/20',
    headerText: 'text-rose-900 dark:text-rose-200',
    countBg: 'bg-rose-100 dark:bg-rose-900/40',
    countText: 'text-rose-700 dark:text-rose-300',
    topBorder: 'border-t-rose-400',
    dotColor: 'bg-rose-400',
    emptyText: 'Nenhum recusado',
  },
};

const FALLBACK_CONFIG = {
  accent: 'from-indigo-400 to-blue-400',
  headerBg: 'bg-muted/50',
  headerText: 'text-foreground',
  countBg: 'bg-muted',
  countText: 'text-muted-foreground',
  topBorder: 'border-t-indigo-400',
  dotColor: 'bg-indigo-400',
  emptyText: 'Nenhum chamado',
};

function getColumnConfig(statusKey: string) {
  return COLUMN_CONFIG[statusKey] ?? FALLBACK_CONFIG;
}

// Skeleton for a single kanban card
function KanbanCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Skeleton className="h-3.5 w-16 rounded-md" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="mb-1.5 h-3.5 w-full rounded-md" />
      <Skeleton className="h-3.5 w-3/4 rounded-md" />
      <div className="mt-3 flex items-center gap-1.5">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-24 rounded-md" />
      </div>
    </div>
  );
}

// Skeleton for a kanban column
function KanbanColumnSkeleton({ statusKey }: { statusKey: string }) {
  const cfg = getColumnConfig(statusKey);
  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-[280px] shrink-0 flex-col rounded-2xl border-2 border-t-4 bg-card shadow-sm xl:min-w-[240px] xl:max-w-[320px] xl:flex-1',
        cfg.topBorder,
      )}
    >
      <div className={cn('flex shrink-0 items-center justify-between gap-2 rounded-t-2xl border-b px-3 py-3', cfg.headerBg)}>
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-5 w-8 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 p-3">
        <KanbanCardSkeleton />
        <KanbanCardSkeleton />
        <KanbanCardSkeleton />
      </div>
    </div>
  );
}

// Mobile accordion item for a single status group
function MobileStatusGroup({
  statusKey,
  items,
  onCardClick,
  onRegistrarExecucao,
}: {
  statusKey: string;
  items: ChamadoDTO[];
  onCardClick: (c: ChamadoDTO) => void;
  onRegistrarExecucao: (c: ChamadoDTO) => void;
}) {
  const [expanded, setExpanded] = useState(items.length > 0);
  const cfg = getColumnConfig(statusKey);
  const label = CHAMADO_STATUS_LABELS[statusKey as ChamadoStatus] ?? statusKey;

  return (
    <div className={cn('overflow-hidden rounded-2xl border-2 border-t-4 bg-card shadow-sm', cfg.topBorder)}>
      {/* Accordion header */}
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors',
          cfg.headerBg,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
        )}
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', cfg.dotColor)} aria-hidden="true" />
          <span className={cn('truncate text-sm font-semibold', cfg.headerText)}>{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              cfg.countBg,
              cfg.countText,
            )}
          >
            {items.length}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2.5 p-3 pt-2.5">
              {items.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted-foreground">{cfg.emptyText}</p>
              ) : (
                items.map((c) => (
                  <ChamadoCard
                    key={c._id}
                    compact
                    hideDetailLink
                    chamado={c}
                    onCardClick={onCardClick}
                    onRegistrarExecucao={onRegistrarExecucao}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ChamadosAtribuidosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChamadoDTO[]>([]);
  const [chamadoParaExecucao, setChamadoParaExecucao] = useState<ChamadoDTO | null>(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<'all' | ChamadoStatus>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
    if (status !== 'all') p.set('status', status);
    return p.toString();
  }, [debouncedQ, status]);

  const fetchChamados = useCallback(async () => {
    setLoading(true);
    try {
      const url = queryString ? `/api/chamados-atribuidos?${queryString}` : '/api/chamados-atribuidos';
      const res = await fetch(url, {
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
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [router, queryString]);

  useEffect(() => {
    fetchChamados();
  }, [fetchChamados]);

  const handleCardClick = useCallback((chamado: ChamadoDTO) => {
    router.push(`/chamados-atribuidos/${chamado._id}`);
  }, [router]);

  const handleRegistrarExecucao = useCallback((chamado: ChamadoDTO) => {
    setChamadoParaExecucao(chamado);
  }, []);

  const emptyMessage = useMemo(() => {
    if (q.trim() || status !== 'all') {
      return 'Tente ajustar a busca ou remover os filtros aplicados.';
    }
    return 'Nenhum chamado atribuído a você no momento.';
  }, [q, status]);

  const itemsByStatus = useMemo(() => {
    const map: Record<string, ChamadoDTO[]> = {};
    KANBAN_STATUSES.forEach((s) => {
      map[s] = items.filter((c) => c.status === s);
    });
    return map;
  }, [items]);

  // Summary counts for the status pills bar
  const summaryCounts = useMemo(
    () => KANBAN_STATUSES.map((s) => ({ key: s, count: itemsByStatus[s]?.length ?? 0 })),
    [itemsByStatus],
  );

  const hasActiveFilter = q.trim() !== '' || status !== 'all';

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-1 flex-col px-4 py-4 sm:px-6 md:py-6 lg:px-8">
      <div className="flex min-h-0 flex-1 flex-col gap-4 sm:gap-5 overflow-hidden">
        <PageHeader
          title="Chamados Atribuídos"
          subtitle="Visualize seus chamados atribuídos e registre a execução."
        />

        {/* Filter bar — glass card */}
        <div className="shrink-0 rounded-2xl border border-border/50 bg-card/80 px-4 py-3.5 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            {/* Search */}
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder="Buscar por número, título..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-w-0 rounded-xl pl-9 text-base sm:text-sm h-11 sm:h-10"
                aria-label="Buscar chamados"
              />
            </div>

            {/* Status filter */}
            <div className="flex shrink-0 items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-[170px] flex-1 sm:flex-none">
                <Select value={status} onValueChange={(v) => setStatus(v as 'all' | ChamadoStatus)}>
                  <SelectTrigger
                    aria-label="Filtrar por status"
                    className="w-full rounded-xl sm:w-[180px] h-11 sm:h-10 text-base sm:text-sm"
                  >
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
          </div>

          {/* Summary pills — only when data loaded and not in filtered mode */}
          {!loading && items.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Totais:</span>
              {summaryCounts
                .filter((s) => s.count > 0)
                .map(({ key, count }) => {
                  const cfg = getColumnConfig(key);
                  const label = CHAMADO_STATUS_LABELS[key as ChamadoStatus] ?? key;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/60 px-2.5 py-1"
                    >
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', cfg.dotColor)}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-foreground">{label}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                          cfg.countBg,
                          cfg.countText,
                        )}
                      >
                        {count}
                      </span>
                    </div>
                  );
                })}
              <Badge
                variant="outline"
                className="ml-auto rounded-full border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
              >
                {items.length} total
              </Badge>
            </div>
          )}
        </div>

        {/* Content area */}
        {loading ? (
          <>
            {/* Mobile skeleton */}
            <div className="flex flex-col gap-3 xl:hidden">
              {KANBAN_STATUSES.slice(0, 3).map((s) => (
                <div
                  key={s}
                  className={cn(
                    'overflow-hidden rounded-2xl border-2 border-t-4 bg-card shadow-sm',
                    getColumnConfig(s).topBorder,
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-between gap-3 px-4 py-3.5',
                      getColumnConfig(s).headerBg,
                    )}
                  >
                    <Skeleton className="h-4 w-28 rounded-md" />
                    <Skeleton className="h-5 w-8 rounded-full" />
                  </div>
                  <div className="flex flex-col gap-2.5 p-3 pt-2.5">
                    <KanbanCardSkeleton />
                    <KanbanCardSkeleton />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop skeleton */}
            <div className="relative hidden min-h-0 flex-1 overflow-hidden xl:block">
              <div className="h-full overflow-x-auto rounded-2xl scroll-smooth [-webkit-overflow-scrolling:touch]">
                <div className="inline-flex h-full min-h-[400px] gap-3 p-1 pb-2">
                  {KANBAN_STATUSES.map((s) => (
                    <KanbanColumnSkeleton key={s} statusKey={s} />
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-16 text-center">
            <div className="relative mb-5 flex items-center justify-center">
              {/* Decorative ring */}
              <div className="absolute h-20 w-20 rounded-full bg-indigo-100/60 dark:bg-indigo-950/30" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-100 to-blue-100 shadow-sm ring-1 ring-indigo-200/60 dark:from-indigo-900/30 dark:to-blue-900/30 dark:ring-indigo-800/40">
                {hasActiveFilter ? (
                  <Filter className="h-6 w-6 text-indigo-500 dark:text-indigo-400" aria-hidden />
                ) : (
                  <Ticket className="h-6 w-6 text-indigo-500 dark:text-indigo-400" aria-hidden />
                )}
              </div>
            </div>
            <p className="text-base font-semibold text-foreground">
              {hasActiveFilter ? 'Nenhum resultado encontrado' : 'Nenhum chamado atribuído'}
            </p>
            <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{emptyMessage}</p>
            {hasActiveFilter && (
              <button
                type="button"
                className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                onClick={() => {
                  setQ('');
                  setStatus('all');
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: stacked accordion by status */}
            <div className="flex flex-col gap-3 xl:hidden">
              {KANBAN_STATUSES.map((statusKey) => (
                <MobileStatusGroup
                  key={statusKey}
                  statusKey={statusKey}
                  items={itemsByStatus[statusKey] ?? []}
                  onCardClick={handleCardClick}
                  onRegistrarExecucao={handleRegistrarExecucao}
                />
              ))}
            </div>

            {/* Desktop: kanban board */}
            <div className="relative hidden min-h-0 flex-1 overflow-hidden xl:flex xl:flex-col">
              <div className="min-h-0 flex-1 overflow-x-auto rounded-2xl scroll-smooth pb-2 [-webkit-overflow-scrolling:touch]">
                <div className="inline-flex h-full min-h-[400px] items-start gap-4 p-1">
                  {KANBAN_STATUSES.map((statusKey) => {
                    const columnItems = itemsByStatus[statusKey] ?? [];
                    const label =
                      CHAMADO_STATUS_LABELS[statusKey as ChamadoStatus] ?? statusKey;
                    const cfg = getColumnConfig(statusKey);

                    return (
                      <motion.div
                        key={statusKey}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className={cn(
                          'flex h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border border-t-4 bg-card shadow-sm xl:min-w-[240px] xl:max-w-[320px] xl:flex-1',
                          cfg.topBorder,
                        )}
                      >
                        {/* Column header */}
                        <div
                          className={cn(
                            'flex shrink-0 items-center gap-2 rounded-t-2xl border-b border-border/50 px-3 py-3',
                            cfg.headerBg,
                          )}
                        >
                          <span
                            className={cn('h-2.5 w-2.5 shrink-0 rounded-full', cfg.dotColor)}
                            aria-hidden="true"
                          />
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-sm font-semibold',
                              cfg.headerText,
                            )}
                            title={label}
                          >
                            {label}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                              cfg.countBg,
                              cfg.countText,
                            )}
                          >
                            {columnItems.length}
                          </span>
                        </div>

                        {/* Column body */}
                        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                          <div className="flex min-w-0 flex-col gap-2 p-2.5 sm:p-3">
                            {columnItems.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Columns3
                                  className="mb-2 h-5 w-5 text-muted-foreground/40"
                                  aria-hidden
                                />
                                <p className="text-xs text-muted-foreground/60">{cfg.emptyText}</p>
                              </div>
                            ) : (
                              <AnimatePresence mode="popLayout">
                                {columnItems.map((c) => (
                                  <motion.div
                                    key={c._id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    transition={{ duration: 0.18, ease: 'easeOut' }}
                                    className="min-w-0 overflow-hidden"
                                  >
                                    <ChamadoCard
                                      compact
                                      hideDetailLink
                                      chamado={c}
                                      onCardClick={handleCardClick}
                                      onRegistrarExecucao={handleRegistrarExecucao}
                                    />
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            )}
                          </div>
                        </div>

                        {/* Column footer accent line */}
                        <div
                          className={cn(
                            'h-0.5 w-full shrink-0 rounded-b-2xl bg-linear-to-r opacity-30',
                            cfg.accent,
                          )}
                          aria-hidden="true"
                        />
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

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
