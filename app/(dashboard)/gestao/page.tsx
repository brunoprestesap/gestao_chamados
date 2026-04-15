'use client';

import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Filter,
  type LucideIcon,
  PauseCircle,
  Play,
  Search,
  Ticket,
  UserCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PauseTicketDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/PauseTicketDialog';
import { ResumeFromRequesterDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/ResumeFromRequesterDialog';
import { AtribuirChamadoDialog } from '@/app/(dashboard)/gestao/_components/AtribuirChamadoDialog';
import { ChamadoDetailSheet } from '@/app/(dashboard)/gestao/_components/ChamadoDetailSheet';
import { ClassificarChamadoDialog } from '@/app/(dashboard)/gestao/_components/ClassificarChamadoDialog';
import { EncerrarChamadoDialog } from '@/app/(dashboard)/gestao/_components/EncerrarChamadoDialog';
import { ReatribuirChamadoDialog } from '@/app/(dashboard)/gestao/_components/ReatribuirChamadoDialog';
import { RecusarChamadoDialog } from '@/app/(dashboard)/gestao/_components/RecusarChamadoDialog';
import { type ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import {
  type ChamadoStatus,
  STATUS_ACCENT,
  STATUS_BADGE,
  STATUS_ICONS,
  STATUS_OPTIONS,
} from '@/app/(dashboard)/meus-chamados/_constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const PRIORITY_BADGE: Record<string, string> = {
  BAIXA:
    'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700',
  NORMAL:
    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  ALTA: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
  EMERGENCIAL:
    'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
};

const PRIORITY_LABELS: Record<string, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  EMERGENCIAL: 'Emergencial',
};

// ---------------------------------------------------------------------------
// Action config — data-driven definition for per-status action buttons
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
    key: 'classificar',
    label: 'Classificar',
    icon: ClipboardList,
    iconColor: 'text-teal-600 dark:text-teal-400',
    canShow: (s) => s === 'aberto',
  },
  {
    key: 'recusar',
    label: 'Recusar',
    icon: Ban,
    iconColor: 'text-rose-500 dark:text-rose-400',
    canShow: (s) => s === 'aberto',
  },
  {
    key: 'atribuir',
    label: 'Atribuir',
    icon: UserCheck,
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    canShow: (s) => s === 'validado' || s === 'emvalidacao',
  },
  {
    key: 'reatribuir',
    label: 'Reatribuir',
    icon: UserCheck,
    iconColor: 'text-violet-600 dark:text-violet-400',
    canShow: (s) => s === 'em atendimento',
  },
  {
    key: 'encerrar',
    label: 'Encerrar',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    canShow: (s) => s === 'concluído',
  },
  {
    key: 'pausar',
    label: 'Pausar',
    icon: PauseCircle,
    iconColor: 'text-amber-600 dark:text-amber-400',
    canShow: (s) => s === 'em atendimento',
  },
  {
    key: 'retomar',
    label: 'Retomar',
    icon: Play,
    iconColor: 'text-sky-600 dark:text-sky-400',
    canShow: (s) => s === 'aguardando_solicitante' || s === 'aguardando_terceiros',
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

function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        PRIORITY_BADGE[priority] ?? '',
      )}
    >
      {PRIORITY_LABELS[priority] ?? priority}
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
        {hasFilter ? 'Nenhum resultado encontrado' : 'Nenhum chamado cadastrado'}
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

function StatusFilterSelect({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label="Filtrar por status" className={cn('h-11 rounded-xl', className)}>
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
  );
}

// ---------------------------------------------------------------------------
// Action buttons — renders only the actions relevant for the ticket status
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
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
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
                aria-label={`${def.label} chamado`}
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
          <TableCell className="px-4 py-4">
            <Skeleton className="h-4 w-16 rounded-md" />
          </TableCell>
          <TableCell className="px-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48 rounded-md" />
              <Skeleton className="h-3 w-32 rounded-md" />
            </div>
          </TableCell>
          <TableCell className="px-4">
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell className="px-4">
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell className="px-4">
            <Skeleton className="h-4 w-28 rounded-md" />
          </TableCell>
          <TableCell className="px-4">
            <Skeleton className="h-4 w-16 rounded-md" />
          </TableCell>
          <TableCell className="px-4 text-right">
            <div className="flex justify-end gap-1">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
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
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-24 rounded-md" />
              </div>
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GestaoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChamadoDTO[]>([]);

  // Dialog state
  const [classificarDialogOpen, setClassificarDialogOpen] = useState(false);
  const [recusarDialogOpen, setRecusarDialogOpen] = useState(false);
  const [atribuirDialogOpen, setAtribuirDialogOpen] = useState(false);
  const [encerrarChamadoId, setEncerrarChamadoId] = useState<string | null>(null);
  const [reatribuirChamado, setReatribuirChamado] = useState<ChamadoDTO | null>(null);
  const [pausarChamado, setPausarChamado] = useState<ChamadoDTO | null>(null);
  const [retomarChamado, setRetomarChamado] = useState<ChamadoDTO | null>(null);
  const [selected, setSelected] = useState<ChamadoDTO | null>(null);
  const [detailSheetChamado, setDetailSheetChamado] = useState<ChamadoDTO | null>(null);

  // Filters & Pagination
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<'all' | ChamadoStatus>('all');
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
      setPage(1); // reset to page 1 on search change
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 when status filter changes
  const setStatusFilter = useCallback((v: string) => {
    setStatus(v as 'all' | ChamadoStatus);
    setPage(1);
  }, []);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
    if (status !== 'all') p.set('status', status);
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
      const res = await fetch(`/api/gestao/chamados?${queryString}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'manual',
      });
      if (res.type === 'opaqueredirect' || res.status === 302) {
        router.replace('/dashboard');
        return;
      }
      if (res.status === 401) {
        router.replace('/login?callbackUrl=/gestao');
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
  // Dialog open handlers
  // ---------------------------------------------------------------------------

  const handleCardClick = useCallback((chamado: ChamadoDTO) => {
    setDetailSheetChamado(chamado);
  }, []);

  const openDialogFor = useCallback(
    (setter: (v: boolean) => void) => (chamado: ChamadoDTO) => {
      setSelected(chamado);
      setter(true);
    },
    [],
  );

  const handleClassificar = useMemo(
    () => openDialogFor(setClassificarDialogOpen),
    [openDialogFor],
  );
  const handleRecusar = useMemo(() => openDialogFor(setRecusarDialogOpen), [openDialogFor]);
  const handleAtribuir = useMemo(() => openDialogFor(setAtribuirDialogOpen), [openDialogFor]);

  const closeDialogFor = useCallback(
    (setter: (v: boolean) => void) => (open: boolean) => {
      setter(open);
      if (!open) setSelected(null);
    },
    [],
  );

  const handleClassificarDialogClose = useMemo(
    () => closeDialogFor(setClassificarDialogOpen),
    [closeDialogFor],
  );
  const handleRecusarDialogClose = useMemo(
    () => closeDialogFor(setRecusarDialogOpen),
    [closeDialogFor],
  );
  const handleAtribuirDialogClose = useMemo(
    () => closeDialogFor(setAtribuirDialogOpen),
    [closeDialogFor],
  );

  const handleEncerrar = useCallback((chamado: ChamadoDTO) => {
    setEncerrarChamadoId(chamado._id);
  }, []);

  const handleEncerrarSuccess = useCallback(() => {
    setEncerrarChamadoId(null);
    fetchChamados();
  }, [fetchChamados]);

  const handleReatribuir = useCallback((chamado: ChamadoDTO) => {
    setReatribuirChamado(chamado);
  }, []);

  const handleReatribuirSuccess = useCallback(() => {
    setReatribuirChamado(null);
    fetchChamados();
  }, [fetchChamados]);

  const handlePausar = useCallback((chamado: ChamadoDTO) => {
    setPausarChamado(chamado);
  }, []);

  const handlePausarSuccess = useCallback(() => {
    setPausarChamado(null);
    fetchChamados();
  }, [fetchChamados]);

  const handleRetomar = useCallback((chamado: ChamadoDTO) => {
    setRetomarChamado(chamado);
  }, []);

  const handleRetomarSuccess = useCallback(() => {
    setRetomarChamado(null);
    fetchChamados();
  }, [fetchChamados]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const hasActiveFilter = q.trim() !== '' || status !== 'all';
  const activeFilterCount = (q.trim() !== '' ? 1 : 0) + (status !== 'all' ? 1 : 0);

  const emptyMessage = useMemo(() => {
    if (hasActiveFilter) return 'Tente ajustar a busca ou remover os filtros aplicados.';
    return 'Nenhum chamado cadastrado no sistema.';
  }, [hasActiveFilter]);

  const actionHandlers: ActionHandlers = useMemo(
    () => ({
      classificar: handleClassificar,
      recusar: handleRecusar,
      atribuir: handleAtribuir,
      reatribuir: handleReatribuir,
      encerrar: handleEncerrar,
      pausar: handlePausar,
      retomar: handleRetomar,
    }),
    [
      handleClassificar,
      handleRecusar,
      handleAtribuir,
      handleReatribuir,
      handleEncerrar,
      handlePausar,
      handleRetomar,
    ],
  );

  const clearFilters = useCallback(() => {
    setQ('');
    setStatus('all');
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-blue-600 shadow-md shadow-indigo-500/20">
              <ClipboardList className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Gestão de Chamados
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Visualize, classifique e distribua chamados
              </p>
            </div>
          </div>
        </div>
        {!loading && (
          <Badge
            variant="outline"
            className="h-8 shrink-0 rounded-full border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold tabular-nums text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
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
              placeholder="Buscar por número, título, descrição..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-11 rounded-xl pl-9 text-base sm:text-sm"
              aria-label="Buscar chamados"
            />
          </div>

          {/* Desktop: select inline */}
          <div className="hidden shrink-0 sm:block">
            <StatusFilterSelect
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
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-background">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-3xl border-t border-border/50 px-0 pb-8"
            >
              {/* Handle bar */}
              <div className="mb-2 flex justify-center">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
              </div>

              <SheetHeader className="px-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/40">
                    <Filter className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <SheetTitle className="text-lg">Filtros</SheetTitle>
                    <SheetDescription className="text-xs">
                      Refine a listagem de chamados
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 px-6">
                {/* Status filter */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status do chamado
                  </label>
                  <StatusFilterSelect value={status} onValueChange={setStatusFilter} />
                </div>

                {/* Clear filters button */}
                {hasActiveFilter && (
                  <Button
                    variant="ghost"
                    className="h-11 w-full gap-2 rounded-xl text-sm font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
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
        <div className="absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-transparent via-indigo-500/50 to-transparent" />

        <div>
          <Table className="min-w-[920px] table-fixed">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[25%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[9%]" />
              <col className="w-[14%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-auto px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  N&ordm;
                </TableHead>
                <TableHead className="h-auto px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Título
                </TableHead>
                <TableHead className="h-auto px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-auto px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Prioridade
                </TableHead>
                <TableHead className="h-auto px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Serviço
                </TableHead>
                <TableHead className="h-auto px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data
                </TableHead>
                <TableHead className="h-auto px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ações
                </TableHead>
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
                    className="group cursor-pointer border-border/40 transition-colors duration-150 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20"
                    onClick={() => handleCardClick(row)}
                  >
                    <TableCell className="px-4 py-3.5 font-mono text-xs font-medium text-muted-foreground">
                      {row.ticket_number}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <span className="line-clamp-1 font-medium text-foreground transition-colors group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                        {row.titulo}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <PriorityBadge priority={row.finalPriority} />
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <span className="line-clamp-1 text-sm text-muted-foreground">
                        {row.tipoServico || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {formatDateShort(row.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-right">
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
                  {/* Accent stripe top */}
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-2.5">
                        {/* Row 1: ticket number + status */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                            {row.ticket_number}
                          </span>
                          <StatusBadge status={row.status} />
                        </div>

                        {/* Row 2: title */}
                        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                          {row.titulo}
                        </h3>

                        {/* Row 3: metadata */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <PriorityBadge priority={row.finalPriority} />
                          {row.tipoServico && (
                            <span className="truncate text-xs text-muted-foreground">
                              {row.tipoServico}
                            </span>
                          )}
                          <span className="text-xs tabular-nums text-muted-foreground/70">
                            {formatDateShort(row.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
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
      <ChamadoDetailSheet
        chamado={detailSheetChamado}
        open={detailSheetChamado !== null}
        onOpenChange={(open) => {
          if (!open) setDetailSheetChamado(null);
        }}
        onClassificar={handleClassificar}
        onRecusar={handleRecusar}
        onAtribuir={handleAtribuir}
        onEncerrar={handleEncerrar}
        onReatribuir={handleReatribuir}
        onPausar={handlePausar}
        onRetomar={handleRetomar}
      />

      <ClassificarChamadoDialog
        open={classificarDialogOpen}
        onOpenChange={handleClassificarDialogClose}
        chamado={selected}
        onSuccess={fetchChamados}
      />

      <RecusarChamadoDialog
        open={recusarDialogOpen}
        onOpenChange={handleRecusarDialogClose}
        chamado={selected}
        onSuccess={fetchChamados}
      />

      <AtribuirChamadoDialog
        open={atribuirDialogOpen}
        onOpenChange={handleAtribuirDialogClose}
        chamado={selected}
        onSuccess={fetchChamados}
      />

      {encerrarChamadoId && (
        <EncerrarChamadoDialog
          open
          onOpenChange={(open) => {
            if (!open) setEncerrarChamadoId(null);
          }}
          chamadoId={encerrarChamadoId}
          onSuccess={handleEncerrarSuccess}
        />
      )}

      {reatribuirChamado && (
        <ReatribuirChamadoDialog
          open
          onOpenChange={(open) => {
            if (!open) setReatribuirChamado(null);
          }}
          chamado={reatribuirChamado}
          onSuccess={handleReatribuirSuccess}
        />
      )}

      {pausarChamado && (
        <PauseTicketDialog
          open
          onOpenChange={(open) => {
            if (!open) setPausarChamado(null);
          }}
          ticketId={pausarChamado._id}
          onSuccess={handlePausarSuccess}
        />
      )}

      {retomarChamado && (
        <ResumeFromRequesterDialog
          open
          onOpenChange={(open) => {
            if (!open) setRetomarChamado(null);
          }}
          ticketId={retomarChamado._id}
          slaPausedAt={retomarChamado.slaPausedAt ?? null}
          pauseReason={retomarChamado.pauseReason ?? null}
          onSuccess={handleRetomarSuccess}
        />
      )}
    </div>
  );
}
