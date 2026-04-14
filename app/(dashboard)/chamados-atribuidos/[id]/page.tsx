'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Package,
  PauseCircle,
  Phone,
  Play,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { MaterialObservationDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/MaterialObservationDialog';
import { PauseTicketDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/PauseTicketDialog';
import { RegisterExecutionDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/RegisterExecutionDialog';
import { ResumeFromRequesterDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/ResumeFromRequesterDialog';
import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_BADGE,
  STATUS_ICONS,
} from '@/app/(dashboard)/meus-chamados/_constants';
import { AttachmentGallery } from '@/app/(dashboard)/meus-chamados/[id]/_components/AttachmentGallery';
import { CommentThread } from '@/app/(dashboard)/meus-chamados/[id]/_components/CommentThread';
import { HistoryTimeline } from '@/app/(dashboard)/meus-chamados/[id]/_components/HistoryTimeline';
import { MaterialObservationsList } from '@/components/chamado/MaterialObservationsList';
import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { MaterialObservationNormalized } from '@/lib/dto-normalizers';
import { cn, formatDate } from '@/lib/utils';

export type ChamadoAtribuidoDetailDTO = {
  _id: string;
  ticket_number: string;
  titulo: string;
  descricao: string;
  status: ChamadoStatus;
  solicitanteId: string | null;
  unitId: string | null;
  localExato: string;
  tipoServico: string;
  naturezaAtendimento: string;
  grauUrgencia: string;
  telefoneContato: string;
  subtypeId: string | null;
  catalogServiceId: string | null;
  assignedToUserId: string | null;
  assignedAt: string | null;
  concludedAt: string | null;
  slaPausedAt: string | null;
  pauseReason: string | null;
  pauseDetails: string | null;
  materialObservations: MaterialObservationNormalized[];
  executions: Array<{
    _id: string | null;
    createdByUserId: string | null;
    serviceDescription: string;
    materialsUsed: string;
    evidencePhotos: string[];
    notes: string;
    concludedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export default function ChamadoAtribuidoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const timezone = useInstitutionalTimezone();
  const tzOpt = { timeZone: timezone };
  const [loading, setLoading] = useState(true);
  const [chamado, setChamado] = useState<ChamadoAtribuidoDetailDTO | null>(null);
  const [chamadoId, setChamadoId] = useState<string | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [materialObsDialogOpen, setMaterialObsDialogOpen] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const fetchChamado = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const [res, sessionRes] = await Promise.all([
          fetch(`/api/chamados-atribuidos/${id}`, { cache: 'no-store' }),
          fetch('/api/session', { cache: 'no-store' }),
        ]);

        if (sessionRes.ok) {
          const sessionData = await sessionRes.json().catch(() => ({}));
          if (sessionData.role) setUserRole(sessionData.role);
        }

        if (res.status === 401) {
          router.replace('/login?callbackUrl=/chamados-atribuidos');
          return;
        }
        if (res.status === 403) {
          router.replace('/dashboard');
          return;
        }
        if (res.status === 404) {
          router.replace('/chamados-atribuidos');
          return;
        }

        const data = await res.json().catch(() => ({}));
        setChamado(data.item || null);
      } catch (error) {
        console.error('Erro ao buscar chamado:', error);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { id } = await params;
      if (cancelled) return;
      setChamadoId(id);
      await fetchChamado(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [params, fetchChamado]);

  async function onActionSuccess() {
    if (chamadoId) await fetchChamado(chamadoId);
    setExecutionDialogOpen(false);
    setMaterialObsDialogOpen(false);
    setPauseDialogOpen(false);
    setResumeDialogOpen(false);
    setHistoryRefreshTrigger((prev) => prev + 1);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/30">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Carregando detalhes do chamado...
        </p>
      </div>
    );
  }

  if (!chamado) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Chamado não encontrado</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            O chamado que você está tentando acessar não existe ou você não tem permissão para vê-lo.
          </p>
        </div>
        <Button
          onClick={() => router.push('/chamados-atribuidos')}
          className="mt-2 rounded-xl"
          variant="outline"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Chamados Atribuidos
        </Button>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[chamado.status];
  const canRegisterExecution = chamado.status === 'em atendimento' && chamado.assignedToUserId;
  const canPause = chamado.status === 'em atendimento' && chamado.assignedToUserId;
  const canResume =
    chamado.status === 'aguardando_solicitante' || chamado.status === 'aguardando_terceiros';

  const hasActions = canRegisterExecution || canPause || canResume;

  const renderActions = (isMobile: boolean = false) => (
    <div className={cn("flex gap-3", isMobile ? "flex-col w-full" : "flex-col w-full")}>
      {canRegisterExecution && (
        <Button
          onClick={() => setExecutionDialogOpen(true)}
          className="w-full justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-500/30 hover:-translate-y-0.5 font-semibold h-11"
        >
          <Wrench className="h-4 w-4" />
          Registrar Execução
        </Button>
      )}
      {canRegisterExecution && (
        <Button
          onClick={() => setMaterialObsDialogOpen(true)}
          variant="outline"
          className="w-full justify-center gap-2 rounded-xl border-blue-300 text-blue-700 font-semibold transition-all hover:bg-blue-50 hover:text-blue-800 dark:border-blue-700/50 dark:text-blue-400 dark:hover:bg-blue-950/30 hover:-translate-y-0.5 h-11"
        >
          <Package className="h-4 w-4" />
          Observação de Material
        </Button>
      )}
      {canPause && (
        <Button
          onClick={() => setPauseDialogOpen(true)}
          variant="outline"
          className="w-full justify-center gap-2 rounded-xl border-orange-300 text-orange-700 font-semibold transition-all hover:bg-orange-50 hover:text-orange-800 dark:border-orange-700/50 dark:text-orange-400 dark:hover:bg-orange-950/30 hover:-translate-y-0.5 h-11"
        >
          <PauseCircle className="h-4 w-4" />
          Pausar Atendimento
        </Button>
      )}
      {canResume && (
        <Button
          onClick={() => setResumeDialogOpen(true)}
          className="w-full justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-500/30 hover:-translate-y-0.5 font-semibold h-11"
        >
          <Play className="h-4 w-4" />
          Retomar Atendimento
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-1 flex-col px-4 py-4 sm:px-6 md:py-6 lg:px-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()}
            className="mt-1 shrink-0 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-400"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {chamado.ticket_number || 'Sem número'}
              </h1>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-3 py-1 border text-xs font-bold uppercase tracking-wider shadow-sm",
                  STATUS_BADGE[chamado.status]
                )}
              >
                <StatusIcon className="mr-1.5 h-3.5 w-3.5" />
                {CHAMADO_STATUS_LABELS[chamado.status]}
              </Badge>
            </div>
            <p className="text-base font-medium text-muted-foreground">
              {chamado.titulo}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column (Content) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          
          {/* Detalhes Principais */}
          <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-blue-500 opacity-80" />
            <CardContent className="p-5 sm:p-6 space-y-6">
              {/* Descrição */}
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  <FileText className="h-4 w-4" />
                  Descrição do Problema
                </h3>
                <div className="rounded-xl bg-muted/30 p-4 border border-border/50 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {chamado.descricao}
                </div>
              </div>

              <Separator className="bg-border/50" />

              {/* Grid de Metadados */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="flex items-start gap-3 rounded-xl bg-muted/20 p-3.5 border border-border/40 transition-colors hover:bg-muted/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                    <Briefcase className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Tipo de Serviço</p>
                    <p className="text-sm font-semibold truncate" title={chamado.tipoServico}>{chamado.tipoServico}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-muted/20 p-3.5 border border-border/40 transition-colors hover:bg-muted/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                    <AlertTriangle className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Urgência</p>
                    <p className="text-sm font-semibold truncate" title={chamado.grauUrgencia}>{chamado.grauUrgencia}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-muted/20 p-3.5 border border-border/40 transition-colors hover:bg-muted/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                    <MapPin className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Local Exato</p>
                    <p className="text-sm font-semibold truncate" title={chamado.localExato}>{chamado.localExato}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-muted/20 p-3.5 border border-border/40 transition-colors hover:bg-muted/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                    <FileText className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Natureza</p>
                    <p className="text-sm font-semibold truncate" title={chamado.naturezaAtendimento}>{chamado.naturezaAtendimento}</p>
                  </div>
                </div>

                {chamado.telefoneContato && (
                  <div className="flex items-start gap-3 rounded-xl bg-muted/20 p-3.5 border border-border/40 transition-colors hover:bg-muted/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
                      <Phone className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Contato</p>
                      <p className="text-sm font-semibold truncate" title={chamado.telefoneContato}>{chamado.telefoneContato}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Datas */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-5 pt-2">
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  <span>Aberto em {formatDate(chamado.createdAt, tzOpt)}</span>
                </div>
                {chamado.concludedAt && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Concluído em {formatDate(chamado.concludedAt, tzOpt)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Material Necessário */}
          {chamado.materialObservations && chamado.materialObservations.length > 0 && (
            <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-yellow-500 opacity-80" />
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  <Package className="h-5 w-5 text-amber-600" />
                  Material Necessário
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MaterialObservationsList observations={chamado.materialObservations} />
              </CardContent>
            </Card>
          )}

          {/* Histórico */}
          <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-sky-500 opacity-80" />
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold tracking-tight">Histórico do Chamado</CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryTimeline chamadoId={chamado._id} refreshTrigger={historyRefreshTrigger} />
            </CardContent>
          </Card>

          {/* Comentários */}
          {userRole && (
            <div className="transition-all hover:shadow-md rounded-2xl">
              <CommentThread chamadoId={chamado._id} userRole={userRole} />
            </div>
          )}

          {/* Anexos */}
          <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500 to-indigo-500 opacity-80" />
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold tracking-tight">Anexos</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentGallery
                chamadoId={chamado._id}
                canUpload={chamado.status !== 'encerrado' && chamado.status !== 'cancelado'}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column (Actions - Desktop) */}
        {hasActions && (
          <div className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-24">
            <Card className="rounded-2xl border-border/50 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-80" />
              <CardHeader>
                <CardTitle className="text-base font-bold tracking-tight">Ações Disponíveis</CardTitle>
              </CardHeader>
              <CardContent>
                {renderActions(false)}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Mobile Sticky Actions Bar */}
      {hasActions && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/80 backdrop-blur-xl p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] lg:hidden">
          <div className="mx-auto max-w-md">
            {renderActions(true)}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <RegisterExecutionDialog
        open={executionDialogOpen}
        onOpenChange={setExecutionDialogOpen}
        chamado={chamado}
        onSuccess={onActionSuccess}
      />

      {chamadoId && (
        <MaterialObservationDialog
          open={materialObsDialogOpen}
          onOpenChange={setMaterialObsDialogOpen}
          ticketId={chamadoId}
          onSuccess={onActionSuccess}
        />
      )}

      {chamadoId && (
        <PauseTicketDialog
          open={pauseDialogOpen}
          onOpenChange={setPauseDialogOpen}
          ticketId={chamadoId}
          onSuccess={onActionSuccess}
        />
      )}

      {chamadoId && (
        <ResumeFromRequesterDialog
          open={resumeDialogOpen}
          onOpenChange={setResumeDialogOpen}
          ticketId={chamadoId}
          slaPausedAt={chamado.slaPausedAt ?? null}
          pauseReason={chamado.pauseReason ?? null}
          onSuccess={onActionSuccess}
        />
      )}
    </div>
  );
}
