'use client';

import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  MapPin,
  MessageSquare,
  Package,
  Paperclip,
  PauseCircle,
  Phone,
  Play,
  RotateCcw,
  Star,
  User,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { MaterialObservationsList } from '@/components/chamado/MaterialObservationsList';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatDateTime } from '@/lib/utils';
import {
  PAUSE_REASON_LABELS,
  type PauseReason,
} from '@/shared/chamados/pause-reason.constants';

import type { ChamadoDTO } from '../../meus-chamados/_components/ChamadoCard';
import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_BADGE,
  STATUS_ICONS,
} from '../../meus-chamados/_constants';
import { AttachmentGallery } from '../../meus-chamados/[id]/_components/AttachmentGallery';
import { CommentThread } from '../../meus-chamados/[id]/_components/CommentThread';
import { HistoryTimeline } from '../../meus-chamados/[id]/_components/HistoryTimeline';
import { CotacaoApprovalCard } from './CotacaoApprovalCard';

type TabId = 'detalhes' | 'historico' | 'comentarios' | 'anexos';

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
  validado: 'from-teal-400 to-emerald-500',
  'em atendimento': 'from-violet-400 to-purple-500',
  aguardando_solicitante: 'from-amber-400 to-orange-500',
  aguardando_terceiros: 'from-orange-400 to-amber-500',
  concluído: 'from-emerald-400 to-teal-500',
  encerrado: 'from-emerald-500 to-teal-600',
  cancelado: 'from-red-400 to-rose-500',
  recusado: 'from-rose-400 to-red-500',
};

// ---------- Props ----------

interface Props {
  chamado: ChamadoDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Ações de gestão (Preposto/Admin) — opcionais para reuso pela página /meus-chamados (Solicitante)
  onClassificar?: (chamado: ChamadoDTO) => void;
  onRecusar?: (chamado: ChamadoDTO) => void;
  onAtribuir?: (chamado: ChamadoDTO) => void;
  onEncerrar?: (chamado: ChamadoDTO) => void;
  onReabrir?: (chamado: ChamadoDTO) => void;
  onReatribuir?: (chamado: ChamadoDTO) => void;
  onPausar?: (chamado: ChamadoDTO) => void;
  onRetomar?: (chamado: ChamadoDTO) => void;
  // Ações de Solicitante
  onCancelar?: (chamado: ChamadoDTO) => void;
  onAvaliar?: (chamado: ChamadoDTO) => void;
  onRecusarServico?: (chamado: ChamadoDTO) => void;
  /** Papel do usuário logado. Recebido via prop para evitar fetch redundante a /api/session
   *  (a página pai já faz esse fetch uma vez). */
  userRole?: string | null;
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
  onReabrir,
  onReatribuir,
  onPausar,
  onRetomar,
  onCancelar,
  onAvaliar,
  onRecusarServico,
  userRole = null,
}: Props) {
  const router = useRouter();
  const timezone = useInstitutionalTimezone();
  const tzOpt = useMemo(() => ({ timeZone: timezone }), [timezone]);

  const [userName, setUserName] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [subtypeName, setSubtypeName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('detalhes');
  const [mountedTabs, setMountedTabs] = useState<Set<TabId>>(
    () => new Set<TabId>(['detalhes']),
  );

  useEffect(() => {
    if (!open || !chamado) {
      setUserName(null);
      setUnitName(null);
      setSubtypeName(null);
      setActiveTab('detalhes');
      setMountedTabs(new Set<TabId>(['detalhes']));
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

  const handleTabChange = useCallback((value: string) => {
    const tab = value as TabId;
    setActiveTab(tab);
    setMountedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  const canUpload = useMemo(
    () =>
      !!chamado &&
      chamado.status !== 'encerrado' &&
      chamado.status !== 'cancelado' &&
      chamado.status !== 'recusado',
    [chamado],
  );

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

  const isSolicitante = userRole === 'Solicitante';
  const isManager = userRole === 'Preposto' || userRole === 'Admin' || userRole === null;

  // Ações de gestão — apenas para Preposto/Admin (e quando o callback foi fornecido)
  const showClassificar = isManager && status === 'aberto' && !!onClassificar;
  const showRecusar = isManager && status === 'aberto' && !!onRecusar;
  const showAtribuir = isManager && status === 'validado' && !!onAtribuir;
  const showReatribuir = isManager && status === 'em atendimento' && !!onReatribuir;
  const showEncerrar = isManager && status === 'concluído' && !!onEncerrar;
  const showReabrir =
    isManager && (status === 'concluído' || status === 'encerrado') && !!onReabrir;
  const showPausar = isManager && status === 'em atendimento' && !!onPausar;
  const showRetomar =
    isManager &&
    (status === 'aguardando_solicitante' || status === 'aguardando_terceiros') &&
    !!onRetomar;

  // Ações do Solicitante
  const showCancelar = isSolicitante && status === 'aberto' && !!onCancelar;
  const showAvaliar =
    isSolicitante && status === 'encerrado' && !chamado.evaluation && !!onAvaliar;
  const showRecusarServico =
    isSolicitante &&
    (status === 'concluído' || status === 'encerrado') &&
    !!onRecusarServico;

  const hasActions =
    showClassificar ||
    showRecusar ||
    showAtribuir ||
    showReatribuir ||
    showEncerrar ||
    showReabrir ||
    showPausar ||
    showRetomar ||
    showCancelar ||
    showAvaliar ||
    showRecusarServico;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 sm:max-w-2xl"
      >
        {/* Accent stripe — slightly thicker for more visual presence */}
        <div
          className={cn('h-1.5 w-full shrink-0 bg-linear-to-r', accentGradient)}
          aria-hidden="true"
        />

        {/* Header — with subtle tinted background */}
        <SheetHeader
          className={cn(
            'shrink-0 px-5 pb-4 pt-5',
            'bg-linear-to-b from-muted/30 to-transparent',
          )}
        >
          <div className="flex items-start gap-3.5">
            {/* Icon container */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-amber-50 to-orange-100 shadow-sm ring-1 ring-orange-200/60 dark:from-amber-900/30 dark:to-orange-900/30 dark:ring-orange-800/40">
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base font-bold leading-tight">
                  #{chamado.ticket_number}
                </SheetTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 border text-xs font-semibold',
                    STATUS_BADGE[chamado.status],
                  )}
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

            {/* Expand to full page */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Abrir em tela cheia"
                  className="mr-8 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    onOpenChange(false);
                    setTimeout(() => router.push(`/meus-chamados/${chamado._id}`), 150);
                  }}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Abrir em tela cheia</TooltipContent>
            </Tooltip>
          </div>

          <SheetDescription className="sr-only">
            Detalhes do chamado #{chamado.ticket_number}: {chamado.titulo}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        {/* Tabs — wraps both the trigger list and the scrollable content */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {/* Sticky tab triggers */}
          <div className="shrink-0 border-b border-border/60 bg-background/80 px-5 py-2 backdrop-blur-sm">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="detalhes" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Detalhes</span>
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-1.5">
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Histórico</span>
              </TabsTrigger>
              <TabsTrigger value="comentarios" className="gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Comentários</span>
              </TabsTrigger>
              <TabsTrigger value="anexos" className="gap-1.5">
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Anexos</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Scrollable body */}
          <ScrollArea className="min-h-0 flex-1">
            <TabsContent value="detalhes" className="mt-0">
              <div className="space-y-5 px-5 py-5">
                <CotacaoApprovalCard
                  ticketId={chamado._id}
                  canReview={userRole === 'Admin'}
                />

            {/* Description — primary focus area */}
            <section aria-labelledby="desc-heading">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
                  <FileText
                    className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400"
                    aria-hidden="true"
                  />
                </div>
                <h2
                  id="desc-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  Descrição
                </h2>
              </div>
              {/* Description box with max-height + fade-out gradient for long text */}
              <div className="relative">
                <div
                  className={cn(
                    'max-h-48 overflow-hidden rounded-xl border border-border/60 bg-muted/30',
                    'px-4 py-3.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap',
                    'dark:bg-muted/20',
                  )}
                >
                  {chamado.descricao || (
                    <span className="italic text-muted-foreground">Sem descrição informada.</span>
                  )}
                </div>
                {/* Fade gradient at bottom when text may overflow */}
                {chamado.descricao && chamado.descricao.length > 300 && (
                  <div
                    className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-xl bg-linear-to-t from-muted/60 to-transparent dark:from-muted/40"
                    aria-hidden="true"
                  />
                )}
              </div>
            </section>

            {/* Urgency & Nature badges */}
            <section aria-label="Classificação de urgência">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'border text-xs font-medium',
                    GRAU_URGENCIA_COLORS[chamado.grauUrgencia] ?? 'bg-gray-100 text-gray-700',
                  )}
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
                  <ClipboardList
                    className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400"
                    aria-hidden="true"
                  />
                </div>
                <h2
                  id="meta-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  Informações do chamado
                </h2>
              </div>
              <div className="space-y-0 divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50 bg-card">
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
                {chamado.assignedToUserName && (
                  <MetadataRow icon={UserCheck} label="Técnico" value={chamado.assignedToUserName} />
                )}
                <MetadataRow icon={Clock} label="Aberto em" value={formattedDate} />
                {categoriaText && (
                  <MetadataRow icon={Wrench} label="Serviço" value={categoriaText} />
                )}
              </div>
            </section>

            {/* Material Necessário */}
            {chamado.materialObservations && chamado.materialObservations.length > 0 && (
              <>
                <Separator className="opacity-60" />
                <section aria-labelledby="material-heading">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                      <Package
                        className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                        aria-hidden="true"
                      />
                    </div>
                    <h2
                      id="material-heading"
                      className="text-sm font-semibold text-foreground"
                    >
                      Material Necessário
                    </h2>
                  </div>
                  <MaterialObservationsList observations={chamado.materialObservations} />
                </section>
              </>
            )}

            {/* Informações da Pausa (Aguardando Terceiros / Solicitante) */}
            {chamado.pauseReason && (
              <>
                <Separator className="opacity-60" />
                <section aria-labelledby="pause-heading">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40">
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400"
                        aria-hidden="true"
                      />
                    </div>
                    <h2
                      id="pause-heading"
                      className="text-sm font-semibold text-foreground"
                    >
                      Informações da Pausa
                    </h2>
                  </div>
                  <div className="space-y-2.5 rounded-xl border border-orange-200/60 bg-orange-50/60 px-4 py-3.5 dark:border-orange-800/40 dark:bg-orange-950/20">
                    <div>
                      <p className="text-xs font-medium text-orange-700/80 dark:text-orange-400/80">
                        Motivo
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {PAUSE_REASON_LABELS[chamado.pauseReason as PauseReason] ?? chamado.pauseReason}
                      </p>
                    </div>
                    {chamado.pauseDetails && chamado.pauseDetails.trim() !== '' && (
                      <div>
                        <p className="text-xs font-medium text-orange-700/80 dark:text-orange-400/80">
                          Observações do Técnico
                        </p>
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                          {chamado.pauseDetails}
                        </p>
                      </div>
                    )}
                    {chamado.slaPausedAt && (
                      <div>
                        <p className="text-xs font-medium text-orange-700/80 dark:text-orange-400/80">
                          Pausado desde
                        </p>
                        <p className="text-sm text-foreground">
                          {formatDateTime(chamado.slaPausedAt, tzOpt)}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

              </div>
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <div className="px-5 py-5">
                {mountedTabs.has('historico') ? (
                  <HistoryTimeline chamadoId={chamado._id} />
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="comentarios" className="mt-0">
              <div className="px-5 py-5">
                {mountedTabs.has('comentarios') ? (
                  userRole ? (
                    <CommentThread chamadoId={chamado._id} userRole={userRole} />
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <Loader2
                        className="h-6 w-6 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  )
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="anexos" className="mt-0">
              <div className="px-5 py-5">
                {mountedTabs.has('anexos') ? (
                  <AttachmentGallery chamadoId={chamado._id} canUpload={canUpload} />
                ) : null}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Sticky footer with action buttons */}
        {hasActions && (
          <div className="shrink-0 border-t border-border/60 bg-background/90 px-5 py-4 backdrop-blur-sm">
            {/* Mobile: full-width stacked; Desktop: row */}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto justify-start gap-1 px-0 text-xs text-muted-foreground hover:text-primary sm:justify-center"
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => router.push(`/meus-chamados/${chamado._id}`), 150);
                }}
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Abrir em tela cheia
              </Button>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              {showRecusar && onRecusar && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full border-rose-200 text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30 sm:w-auto"
                  onClick={() => handleAction(onRecusar)}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Recusar
                </Button>
              )}
              {showClassificar && onClassificar && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 transition-opacity hover:opacity-90 sm:w-auto"
                  onClick={() => handleAction(onClassificar)}
                >
                  <ClipboardList className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Classificar
                </Button>
              )}
              {showAtribuir && onAtribuir && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 transition-opacity hover:opacity-90 sm:w-auto"
                  onClick={() => handleAction(onAtribuir)}
                >
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Atribuir
                </Button>
              )}
              {showReatribuir && onReatribuir && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full transition-colors sm:w-auto"
                  onClick={() => handleAction(onReatribuir)}
                >
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Reatribuir
                </Button>
              )}
              {showPausar && onPausar && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full border-orange-200 text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30 sm:w-auto"
                  onClick={() => handleAction(onPausar)}
                >
                  <PauseCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Pausar
                </Button>
              )}
              {showRetomar && onRetomar && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:w-auto"
                  onClick={() => handleAction(onRetomar)}
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Retomar
                </Button>
              )}
              {showEncerrar && onEncerrar && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:w-auto"
                  onClick={() => handleAction(onEncerrar)}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Encerrar Chamado
                </Button>
              )}
              {showReabrir && onReabrir && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full border-amber-200 text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30 sm:w-auto"
                  onClick={() => handleAction(onReabrir)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Reabrir Chamado
                </Button>
              )}
              {showCancelar && onCancelar && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full border-rose-200 text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30 sm:w-auto"
                  onClick={() => handleAction(onCancelar)}
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Cancelar
                </Button>
              )}
              {showRecusarServico && onRecusarServico && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full border-orange-200 text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30 sm:w-auto"
                  onClick={() => handleAction(onRecusarServico)}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Recusar Serviço
                </Button>
              )}
              {showAvaliar && onAvaliar && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-linear-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 transition-opacity hover:opacity-90 sm:w-auto"
                  onClick={() => handleAction(onAvaliar)}
                >
                  <Star className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Avaliar
                </Button>
              )}
              </div>
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
    <div className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/40">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="wrap-break-word text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
