'use client';

import {
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  MapPin,
  Phone,
  User,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDateTime } from '@/lib/utils';

import type { ChamadoDTO } from '../../meus-chamados/_components/ChamadoCard';
import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_BADGE,
  STATUS_ICONS,
} from '../../meus-chamados/_constants';

// ---------- API helpers (same pattern as ChamadoCard) ----------

async function fetchUser(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/users/${userId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.item?.name || null;
  } catch {
    return null;
  }
}

async function fetchUnit(unitId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/units', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const unit = (data.items || []).find(
      (u: { _id?: string; id?: string }) => String(u._id || u.id) === unitId,
    );
    return unit?.name || null;
  } catch {
    return null;
  }
}

async function fetchSubtype(subtypeId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/catalog/subtypes/${subtypeId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.item?.name || null;
  } catch {
    return null;
  }
}

// ---------- Constants ----------

const GRAU_URGENCIA_LABELS: Record<string, string> = {
  Baixo: 'Baixa',
  Normal: 'Normal',
  Alto: 'Alta',
  Crítico: 'Emergencial',
};

const GRAU_URGENCIA_COLORS: Record<string, string> = {
  Baixo: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300',
  Normal: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300',
  Alto: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900 dark:text-orange-300',
  Crítico: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300',
};

// Accent gradient per status — mirrors kanban column color semantics
const STATUS_ACCENT_GRADIENT: Record<string, string> = {
  aberto: 'from-amber-400 to-orange-500',
  emvalidacao: 'from-sky-400 to-blue-500',
  validado: 'from-teal-400 to-emerald-500',
  'em atendimento': 'from-violet-400 to-purple-500',
  aguardando_solicitante: 'from-amber-400 to-orange-500',
  concluído: 'from-emerald-400 to-teal-500',
  encerrado: 'from-emerald-500 to-teal-600',
  cancelado: 'from-red-400 to-rose-500',
  recusado: 'from-rose-400 to-red-500',
  fechado: 'from-slate-400 to-gray-500',
};

// ---------- Props ----------

interface Props {
  chamado: ChamadoDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClassificar: (chamado: ChamadoDTO) => void;
  onRecusar: (chamado: ChamadoDTO) => void;
  onAtribuir: (chamado: ChamadoDTO) => void;
  onEncerrar: (chamado: ChamadoDTO) => void;
  onReatribuir: (chamado: ChamadoDTO) => void;
}

// ---------- Component ----------

export function ChamadoDetailSheet({
  chamado,
  open,
  onOpenChange,
  onClassificar,
  onRecusar,
  onAtribuir,
  onEncerrar,
  onReatribuir,
}: Props) {
  const timezone = useInstitutionalTimezone();
  const tzOpt = useMemo(() => ({ timeZone: timezone }), [timezone]);

  const [userName, setUserName] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [subtypeName, setSubtypeName] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !chamado) {
      setUserName(null);
      setUnitName(null);
      setSubtypeName(null);
      return;
    }

    let mounted = true;

    const promises: Promise<void>[] = [];

    if (chamado.solicitanteId) {
      promises.push(
        fetchUser(chamado.solicitanteId).then((name) => {
          if (mounted) setUserName(name);
        }),
      );
    }
    if (chamado.unitId) {
      promises.push(
        fetchUnit(chamado.unitId).then((name) => {
          if (mounted) setUnitName(name);
        }),
      );
    }
    if (chamado.subtypeId) {
      promises.push(
        fetchSubtype(chamado.subtypeId).then((name) => {
          if (mounted) setSubtypeName(name);
        }),
      );
    }

    Promise.all(promises);

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chamado?._id]);

  const formattedDate = useMemo(
    () => (chamado ? formatDateTime(chamado.createdAt, tzOpt) : ''),
    [chamado, tzOpt],
  );

  const categoriaText = useMemo(() => {
    if (!chamado) return '';
    const parts = [chamado.tipoServico];
    if (subtypeName) parts.push(subtypeName);
    return parts.filter(Boolean).join(' › ');
  }, [chamado, subtypeName]);

  const handleAction = useCallback(
    (action: (c: ChamadoDTO) => void) => {
      if (!chamado) return;
      onOpenChange(false);
      // Small delay to let sheet close before dialog opens (avoids focus-trap conflict)
      setTimeout(() => action(chamado), 150);
    },
    [chamado, onOpenChange],
  );

  if (!chamado) return null;

  const StatusIcon = STATUS_ICONS[chamado.status];
  const status = chamado.status as ChamadoStatus;
  const accentGradient =
    STATUS_ACCENT_GRADIENT[chamado.status] ?? 'from-indigo-400 to-blue-500';

  const showClassificar = status === 'aberto';
  const showRecusar = status === 'aberto';
  const showAtribuir = status === 'validado' || status === 'emvalidacao';
  const showReatribuir = status === 'em atendimento';
  const showEncerrar = status === 'concluído';
  const hasActions =
    showClassificar || showRecusar || showAtribuir || showReatribuir || showEncerrar;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-lg"
      >
        {/* Accent stripe */}
        <div
          className={`h-1 w-full shrink-0 bg-linear-to-r ${accentGradient}`}
          aria-hidden="true"
        />

        {/* Header */}
        <SheetHeader className="shrink-0 px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            {/* Icon container */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-amber-50 to-orange-100 shadow-sm ring-1 ring-orange-200/60 dark:from-amber-900/30 dark:to-orange-900/30 dark:ring-orange-800/40">
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base font-bold leading-tight">
                  #{chamado.ticket_number}
                </SheetTitle>
                <Badge
                  variant="outline"
                  className={`shrink-0 border text-xs font-semibold ${STATUS_BADGE[chamado.status]}`}
                >
                  <StatusIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                  {CHAMADO_STATUS_LABELS[chamado.status]}
                </Badge>
              </div>

              {/* Ticket title as visible subtitle */}
              <p className="mt-1 text-sm font-medium leading-snug text-foreground line-clamp-2">
                {chamado.titulo || 'Sem título'}
              </p>
            </div>
          </div>

          <SheetDescription className="sr-only">
            Detalhes do chamado #{chamado.ticket_number}: {chamado.titulo}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        {/* Scrollable body */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-5 py-5">

            {/* Description — primary focus area */}
            <section aria-labelledby="desc-heading">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
                  <FileText className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                </div>
                <h2
                  id="desc-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  Descrição
                </h2>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap dark:bg-muted/20">
                {chamado.descricao || (
                  <span className="italic text-muted-foreground">Sem descrição informada.</span>
                )}
              </div>
            </section>

            {/* Urgency & Nature badges */}
            <section aria-label="Classificação de urgência">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`border text-xs font-medium ${GRAU_URGENCIA_COLORS[chamado.grauUrgencia] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {GRAU_URGENCIA_LABELS[chamado.grauUrgencia] ?? chamado.grauUrgencia}
                </Badge>
                {chamado.naturezaAtendimento && (
                  <Badge variant="outline" className="text-xs">
                    {chamado.naturezaAtendimento === 'Urgente'
                      ? 'Solicitado: Urgente'
                      : 'Solicitado: Padrão'}
                  </Badge>
                )}
              </div>
            </section>

            <Separator className="opacity-60" />

            {/* Metadata grid */}
            <section aria-labelledby="meta-heading">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-950/40">
                  <ClipboardList className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                </div>
                <h2
                  id="meta-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  Informações do chamado
                </h2>
              </div>
              <div className="space-y-0 divide-y divide-border/40 rounded-xl border border-border/50 bg-card">
                {unitName && (
                  <MetadataRow icon={Building2} label="Unidade" value={unitName} />
                )}
                {chamado.localExato && (
                  <MetadataRow icon={MapPin} label="Local" value={chamado.localExato} />
                )}
                {userName && (
                  <MetadataRow icon={User} label="Solicitante" value={userName} />
                )}
                {chamado.telefoneContato && (
                  <MetadataRow icon={Phone} label="Telefone" value={chamado.telefoneContato} />
                )}
                <MetadataRow icon={Clock} label="Aberto em" value={formattedDate} />
                {categoriaText && (
                  <MetadataRow icon={Wrench} label="Serviço" value={categoriaText} />
                )}
              </div>
            </section>

          </div>
        </ScrollArea>

        {/* Sticky footer with action buttons */}
        {hasActions && (
          <div className="shrink-0 border-t border-border/60 bg-background/80 px-5 py-4 backdrop-blur-sm">
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              {showRecusar && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-rose-200 text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  onClick={() => handleAction(onRecusar)}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Recusar
                </Button>
              )}
              {showClassificar && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 transition-opacity hover:opacity-90"
                  onClick={() => handleAction(onClassificar)}
                >
                  <ClipboardList className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Classificar
                </Button>
              )}
              {showAtribuir && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 transition-opacity hover:opacity-90"
                  onClick={() => handleAction(onAtribuir)}
                >
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Atribuir
                </Button>
              )}
              {showReatribuir && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="transition-colors"
                  onClick={() => handleAction(onReatribuir)}
                >
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Reatribuir
                </Button>
              )}
              {showEncerrar && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                  onClick={() => handleAction(onEncerrar)}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Encerrar Chamado
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------- Sub-component ----------

function MetadataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="wrap-break-word text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
