'use client';

import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  Gavel,
  RefreshCw,
  ShieldCheck,
  Star,
  Timer,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { EncerrarChamadoDialog } from '@/app/(dashboard)/gestao/_components/EncerrarChamadoDialog';
import { ReatribuirChamadoDialog } from '@/app/(dashboard)/gestao/_components/ReatribuirChamadoDialog';
import {
  AvaliarChamadoDialog,
} from '@/app/(dashboard)/meus-chamados/_components/AvaliarChamadoDialog';
import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_BADGE,
  STATUS_ICONS,
} from '@/app/(dashboard)/meus-chamados/_constants';
import { AttachmentGallery } from '@/app/(dashboard)/meus-chamados/[id]/_components/AttachmentGallery';
import { CancelTicketDialog } from '@/app/(dashboard)/meus-chamados/[id]/_components/CancelTicketDialog';
import { HistoryTimeline } from '@/app/(dashboard)/meus-chamados/[id]/_components/HistoryTimeline';
import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/utils';
import { ATTENDANCE_NATURE_LABELS } from '@/shared/chamados/chamado.constants';
import { hasValidEvaluation } from '@/shared/chamados/evaluation.utils';

/* ─── SLA status helper ─── */

function getSlaStatusLabel(
  chamado: ChamadoDetailDTO,
): 'No prazo' | 'Próximo do vencimento' | 'Atrasado' | null {
  const sla = chamado.sla;
  if (!sla?.resolutionDueAt) return null;
  const now = new Date();
  const resolutionDueAt = new Date(sla.resolutionDueAt);
  const resolvedAt = sla.resolvedAt ? new Date(sla.resolvedAt) : null;
  const resolutionBreachedAt = sla.resolutionBreachedAt ? new Date(sla.resolutionBreachedAt) : null;
  const finalPriority = (chamado.finalPriority ?? 'NORMAL') as string;
  const resolutionStartAt = sla.computedAt ? new Date(sla.computedAt) : null;

  if (resolutionBreachedAt != null || (now > resolutionDueAt && resolvedAt == null))
    return 'Atrasado';
  if (resolvedAt != null) return resolutionBreachedAt != null ? 'Atrasado' : 'No prazo';
  const remainingMs = resolutionDueAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 'No prazo';
  if (finalPriority === 'ALTA' && remainingMs <= 4 * 60 * 60 * 1000) return 'Próximo do vencimento';
  if (
    resolutionStartAt &&
    remainingMs <= (resolutionDueAt.getTime() - resolutionStartAt.getTime()) * 0.2
  )
    return 'Próximo do vencimento';
  return 'No prazo';
}

/* ─── Types ─── */

type SlaDetailDTO = {
  priority: string | null;
  businessHoursOnly: boolean | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  responseStartedAt: string | null;
  resolvedAt: string | null;
  responseBreachedAt: string | null;
  resolutionBreachedAt: string | null;
  computedAt: string | null;
  configVersion: string | null;
} | null;

type ChamadoDetailDTO = {
  _id: string;
  ticket_number: string;
  titulo: string;
  descricao: string;
  status: ChamadoStatus;
  solicitanteId: string | null;
  unitId: string | null;
  assignedToUserId?: string | null;
  localExato: string;
  tipoServico: string;
  naturezaAtendimento: string;
  requestedAttendanceNature?: string | null;
  attendanceNature?: string | null;
  grauUrgencia: string;
  telefoneContato: string;
  subtypeId: string | null;
  catalogServiceId: string | null;
  finalPriority?: string | null;
  classifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  evaluation?: {
    rating?: number | null;
    notes?: string | null;
    createdAt?: string | null;
    createdByUserId?: string | null;
  } | null;
  sla?: SlaDetailDTO;
};

/* ─── InfoField helper ─── */

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </h4>
      <p className="wrap-break-word text-sm">{children}</p>
    </div>
  );
}

/* ─── Skeleton loader ─── */

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Main card skeleton */}
          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <Skeleton className="mb-2 h-4 w-32" />
            <Skeleton className="mb-4 h-6 w-3/4" />
            <Skeleton className="mb-6 h-20 w-full rounded-xl" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="mb-1 h-3 w-24" />
                  <Skeleton className="h-5 w-40" />
                </div>
              ))}
            </div>
          </div>
          {/* SLA card skeleton */}
          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <Skeleton className="mb-4 h-6 w-20" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          </div>
          {/* History skeleton */}
          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <Skeleton className="mb-4 h-6 w-48" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="mb-3 flex gap-3">
                <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="mb-1 h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="rounded-2xl border border-border/50 bg-card p-6">
            <Skeleton className="mb-4 h-6 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Accent stripe color by status ─── */

function getAccentStripeColor(status: ChamadoStatus): string {
  switch (status) {
    case 'cancelado':
      return 'from-red-500 to-red-600';
    case 'concluído':
    case 'encerrado':
      return 'from-emerald-500 to-emerald-600';
    case 'em atendimento':
      return 'from-violet-500 to-violet-600';
    default:
      return 'from-indigo-500 to-blue-500';
  }
}

/* ─── Main page ─── */

export default function ChamadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const timezone = useInstitutionalTimezone();
  const tzOpt = { timeZone: timezone };
  const [loading, setLoading] = useState(true);
  const [chamado, setChamado] = useState<ChamadoDetailDTO | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false);
  const [reatribuirDialogOpen, setReatribuirDialogOpen] = useState(false);
  const [avaliarDialogOpen, setAvaliarDialogOpen] = useState(false);
  const [chamadoId, setChamadoId] = useState<string | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [canManageChamado, setCanManageChamado] = useState(false);

  useEffect(() => {
    (async () => {
      const { id } = await params;
      setChamadoId(id);
      await fetchChamado(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchChamado(id: string) {
    setLoading(true);
    try {
      const [chamadoRes, sessionRes] = await Promise.all([
        fetch(`/api/meus-chamados/${id}`, { cache: 'no-store' }),
        fetch('/api/session', { cache: 'no-store' }),
      ]);

      if (chamadoRes.status === 401) {
        router.replace('/login?callbackUrl=/meus-chamados');
        return;
      }
      if (chamadoRes.status === 404) {
        router.replace('/meus-chamados');
        return;
      }

      const chamadoData = await chamadoRes.json().catch(() => ({}));
      const chamadoItem = chamadoData.item || null;
      setChamado(chamadoItem);

      if (sessionRes.ok && chamadoItem) {
        const sessionData = await sessionRes.json().catch(() => ({}));
        setIsOwner(String(chamadoItem.solicitanteId) === sessionData.userId);
        setCanManageChamado(sessionData.role === 'Admin' || sessionData.role === 'Preposto');
      }
    } catch (error) {
      console.error('Erro ao buscar chamado:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(observacoes?: string) {
    if (!chamadoId) return;

    try {
      const res = await fetch(`/api/chamados/${chamadoId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacoes }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Erro ao cancelar chamado');
        return;
      }

      if (chamado) {
        setChamado({ ...chamado, status: 'cancelado' });
      }
      setCancelDialogOpen(false);
      toast.success('Chamado cancelado com sucesso');

      await fetchChamado(chamadoId);
      setHistoryRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Erro ao cancelar chamado:', error);
      toast.error('Erro ao cancelar chamado. Tente novamente.');
    }
  }

  /* ─── Loading ─── */
  if (loading) {
    return <DetailSkeleton />;
  }

  /* ─── Not found ─── */
  if (!chamado) {
    return (
      <div className="mx-auto flex w-full max-w-7xl min-h-[400px] items-center justify-center px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="min-w-0 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
          </div>
          <p className="wrap-break-word text-lg font-medium">Chamado não encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            O chamado solicitado não existe ou foi removido.
          </p>
          <Button
            onClick={() => router.push('/meus-chamados')}
            className="mt-4"
            variant="outline"
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Voltar para Meus Chamados
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[chamado.status];
  const accentColor = getAccentStripeColor(chamado.status);

  /* Sidebar visibility */
  const showOwnerCancel =
    isOwner &&
    chamado.status !== 'cancelado' &&
    chamado.status !== 'concluído' &&
    chamado.status !== 'encerrado';
  const showReatribuir = canManageChamado && chamado.status === 'em atendimento';
  const showEncerrar = canManageChamado && chamado.status === 'concluído';
  const showEvaluation = isOwner && chamado.status === 'encerrado';
  const hasRightColumn = showOwnerCancel || showReatribuir || showEncerrar || showEvaluation;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      {/* Header */}
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title="Detalhes do Chamado" />
      </div>

      <div
        className={`grid min-w-0 gap-6 ${hasRightColumn ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}
      >
        {/* ─── Left column ─── */}
        <div className={`min-w-0 space-y-6 ${hasRightColumn ? 'lg:col-span-2' : ''}`}>
          {/* Main info card */}
          <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
            {/* Accent stripe */}
            <div
              className={`h-[3px] bg-linear-to-r ${accentColor} opacity-60 transition-opacity group-hover:opacity-100`}
            />
            <CardHeader>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70 font-mono">
                    {chamado.ticket_number || 'Sem número'}
                  </span>
                  <CardTitle className="mt-1 wrap-break-word text-xl" title={chamado.titulo}>
                    {chamado.titulo}
                  </CardTitle>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 border text-sm font-medium ${STATUS_BADGE[chamado.status]}`}
                >
                  <StatusIcon className="mr-2 h-4 w-4" aria-hidden />
                  {CHAMADO_STATUS_LABELS[chamado.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Description */}
              <div className="min-w-0">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                  Descrição
                </h4>
                <div className="rounded-xl bg-muted/40 p-4">
                  <p className="wrap-break-word text-sm leading-relaxed">{chamado.descricao}</p>
                </div>
              </div>

              {/* Fields grid */}
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <InfoField label="Tipo de Serviço">{chamado.tipoServico}</InfoField>
                <InfoField label="Local Exato">{chamado.localExato}</InfoField>
                <InfoField label="Natureza solicitada">
                  {chamado.requestedAttendanceNature
                    ? ATTENDANCE_NATURE_LABELS[
                        chamado.requestedAttendanceNature as keyof typeof ATTENDANCE_NATURE_LABELS
                      ]
                    : chamado.naturezaAtendimento || '—'}
                </InfoField>
                <InfoField label="Natureza aprovada">
                  {chamado.attendanceNature
                    ? ATTENDANCE_NATURE_LABELS[
                        chamado.attendanceNature as keyof typeof ATTENDANCE_NATURE_LABELS
                      ]
                    : chamado.naturezaAtendimento || '—'}
                </InfoField>
                <InfoField label="Grau de Urgência">{chamado.grauUrgencia}</InfoField>
                {chamado.telefoneContato && (
                  <InfoField label="Telefone para Contato">{chamado.telefoneContato}</InfoField>
                )}
              </div>

              {/* Timestamps */}
              <div className="flex min-w-0 flex-wrap items-center gap-3 border-t pt-4 text-xs text-muted-foreground sm:gap-4">
                <div className="flex shrink-0 items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden />
                  <span>Aberto em {formatDate(chamado.createdAt, tzOpt)}</span>
                </div>
                {chamado.updatedAt !== chamado.createdAt && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden />
                    <span>Atualizado em {formatDate(chamado.updatedAt, tzOpt)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SLA card */}
          {chamado.sla && (
            <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
              <div className="h-[3px] bg-linear-to-r from-sky-500 to-cyan-500 opacity-60 transition-opacity group-hover:opacity-100" />
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 transition-transform group-hover:scale-105 dark:bg-sky-900/30">
                      <Timer className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden />
                    </div>
                    <CardTitle className="text-base">SLA</CardTitle>
                  </div>
                  {(() => {
                    const slaStatus = getSlaStatusLabel(chamado);
                    if (!slaStatus) return null;
                    const statusClass =
                      slaStatus === 'Atrasado'
                        ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200'
                        : slaStatus === 'Próximo do vencimento'
                          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
                    return (
                      <Badge variant="outline" className={statusClass}>
                        {slaStatus}
                      </Badge>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <InfoField label="Prioridade final">
                    {chamado.sla.priority ?? chamado.finalPriority ?? '—'}
                  </InfoField>
                  {chamado.sla.businessHoursOnly != null && (
                    <InfoField label="Horário comercial">
                      {chamado.sla.businessHoursOnly ? 'Sim (08h–18h, seg–sex)' : 'Não (24x7)'}
                    </InfoField>
                  )}
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/50 p-3">
                    <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                      Prazo de Resposta
                    </h4>
                    <p className="text-sm font-medium">
                      {chamado.sla.responseDueAt
                        ? formatDateTime(chamado.sla.responseDueAt, tzOpt)
                        : '—'}
                    </p>
                    {chamado.sla.responseStartedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Iniciado em {formatDateTime(chamado.sla.responseStartedAt, tzOpt)}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/50 p-3">
                    <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                      Prazo de Solução
                    </h4>
                    <p className="text-sm font-medium">
                      {chamado.sla.resolutionDueAt
                        ? formatDateTime(chamado.sla.resolutionDueAt, tzOpt)
                        : '—'}
                    </p>
                    {chamado.sla.resolvedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Resolvido em {formatDateTime(chamado.sla.resolvedAt, tzOpt)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* History card */}
          <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
            <div className="h-[3px] bg-linear-to-r from-indigo-500 to-blue-500 opacity-60 transition-opacity group-hover:opacity-100" />
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 transition-transform group-hover:scale-105 dark:bg-indigo-900/30">
                  <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
                </div>
                <CardTitle>Histórico de Alterações</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="min-w-0">
              <HistoryTimeline chamadoId={chamado._id} refreshTrigger={historyRefreshTrigger} />
            </CardContent>
          </Card>

          {/* Attachments card */}
          <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
            <div className="h-[3px] bg-linear-to-r from-violet-500 to-purple-500 opacity-60 transition-opacity group-hover:opacity-100" />
            <CardContent className="pt-5">
              <AttachmentGallery
                chamadoId={chamado._id}
                canUpload={chamado.status !== 'encerrado' && chamado.status !== 'cancelado'}
              />
            </CardContent>
          </Card>
        </div>

        {/* ─── Right column (actions) ─── */}
        {hasRightColumn && (
          <div className="min-w-0 space-y-4">
            {/* Owner cancel */}
            {showOwnerCancel && (
              <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
                <div className="h-[3px] bg-linear-to-r from-red-500 to-rose-500 opacity-60 transition-opacity group-hover:opacity-100" />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 transition-transform group-hover:scale-105 dark:bg-red-900/30">
                      <Ban className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
                    </div>
                    <CardTitle className="text-base">Ações</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    onClick={() => setCancelDialogOpen(true)}
                    variant="destructive"
                    className="w-full justify-start"
                  >
                    Cancelar Chamado
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Manager reatribuir */}
            {showReatribuir && (
              <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
                <div className="h-[3px] bg-linear-to-r from-amber-500 to-orange-500 opacity-60 transition-opacity group-hover:opacity-100" />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 transition-transform group-hover:scale-105 dark:bg-amber-900/30">
                      <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                    </div>
                    <CardTitle className="text-base">Ações (Gestão)</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    onClick={() => setReatribuirDialogOpen(true)}
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    Reatribuir
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Manager encerrar */}
            {showEncerrar && (
              <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
                <div className="h-[3px] bg-linear-to-r from-emerald-500 to-green-500 opacity-60 transition-opacity group-hover:opacity-100" />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 transition-transform group-hover:scale-105 dark:bg-emerald-900/30">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    </div>
                    <CardTitle className="text-base">Ações (Gestão)</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    onClick={() => setEncerrarDialogOpen(true)}
                    className="w-full justify-start bg-linear-to-r from-emerald-600 to-green-600 shadow-sm shadow-emerald-500/20 hover:from-emerald-700 hover:to-green-700"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
                    Encerrar Chamado
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Evaluation */}
            {showEvaluation && (
              <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4">
                <div className="h-[3px] bg-linear-to-r from-amber-400 to-yellow-500 opacity-60 transition-opacity group-hover:opacity-100" />
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 transition-transform group-hover:scale-105 dark:bg-amber-900/30">
                      <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                    </div>
                    <CardTitle className="text-base">Avaliação</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {hasValidEvaluation(chamado.evaluation) ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/20">
                      <Star className="h-4 w-4 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" aria-hidden />
                      <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                        Avaliado
                        {chamado.evaluation?.rating != null && ` · ${chamado.evaluation.rating}/5`}
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Sua avaliação ajuda a melhorar nossos serviços.
                      </p>
                      <Button
                        className="w-full justify-start gap-2 bg-linear-to-r from-amber-500 to-amber-600 shadow-sm shadow-amber-500/20 hover:from-amber-600 hover:to-amber-700"
                        onClick={() => setAvaliarDialogOpen(true)}
                      >
                        <Gavel className="h-4 w-4" aria-hidden />
                        Avaliar Atendimento
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CancelTicketDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onCancel={handleCancel}
      />

      {chamadoId && (
        <EncerrarChamadoDialog
          open={encerrarDialogOpen}
          onOpenChange={setEncerrarDialogOpen}
          chamadoId={chamadoId}
          onSuccess={async () => {
            await fetchChamado(chamadoId);
            setHistoryRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}

      {chamado && (
        <ReatribuirChamadoDialog
          open={reatribuirDialogOpen}
          onOpenChange={setReatribuirDialogOpen}
          chamado={chamado as ChamadoDTO}
          onSuccess={async () => {
            await fetchChamado(chamado._id);
            setHistoryRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}

      {chamado && (
        <AvaliarChamadoDialog
          open={avaliarDialogOpen}
          onOpenChange={setAvaliarDialogOpen}
          chamado={{
            _id: chamado._id,
            ticket_number: chamado.ticket_number,
            titulo: chamado.titulo,
            assignedToUserId: chamado.assignedToUserId ?? null,
          }}
          onSuccess={async () => {
            await fetchChamado(chamado._id);
            setHistoryRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
