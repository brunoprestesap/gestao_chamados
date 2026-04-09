'use client';

import { ArrowLeft, CheckCircle2, Clock, Hourglass, Loader2, Play, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PauseForRequesterDialog } from '@/app/(dashboard)/chamados-atribuidos/[id]/_components/PauseForRequesterDialog';
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
import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '@/lib/utils';

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
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { id } = await params;
      setChamadoId(id);
      await fetchChamado(id);
    })();
  }, [params]);

  async function fetchChamado(id: string) {
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
  }

  async function onActionSuccess() {
    if (chamadoId) await fetchChamado(chamadoId);
    setExecutionDialogOpen(false);
    setPauseDialogOpen(false);
    setResumeDialogOpen(false);
    setHistoryRefreshTrigger((prev) => prev + 1);
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando chamado...</p>
        </div>
      </div>
    );
  }

  if (!chamado) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">Chamado não encontrado</p>
          <Button
            onClick={() => router.push('/chamados-atribuidos')}
            className="mt-4"
            variant="outline"
          >
            Voltar para Chamados Atribuídos
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[chamado.status];
  const canRegisterExecution = chamado.status === 'em atendimento' && chamado.assignedToUserId;
  const canPause = chamado.status === 'em atendimento' && chamado.assignedToUserId;
  const canResume = chamado.status === 'aguardando_solicitante';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title="Detalhes do Chamado" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">{chamado.ticket_number || 'Sem número'}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{chamado.titulo}</p>
                </div>
                <Badge
                  variant="outline"
                  className={`border text-sm font-medium ${STATUS_BADGE[chamado.status]}`}
                >
                  <StatusIcon className="mr-2 h-4 w-4" />
                  {CHAMADO_STATUS_LABELS[chamado.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Descrição</h4>
                <p className="text-sm leading-relaxed">{chamado.descricao}</p>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                    Tipo de Serviço
                  </h4>
                  <p className="text-sm">{chamado.tipoServico}</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">Local Exato</h4>
                  <p className="text-sm">{chamado.localExato}</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                    Natureza do Atendimento
                  </h4>
                  <p className="text-sm">{chamado.naturezaAtendimento}</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                    Grau de Urgência
                  </h4>
                  <p className="text-sm">{chamado.grauUrgencia}</p>
                </div>
                {chamado.telefoneContato && (
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                      Telefone para Contato
                    </h4>
                    <p className="text-sm">{chamado.telefoneContato}</p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Aberto em {formatDate(chamado.createdAt, tzOpt)}</span>
                </div>
                {chamado.concludedAt && (
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Concluído em {formatDate(chamado.concludedAt, tzOpt)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de Alterações</CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryTimeline chamadoId={chamado._id} refreshTrigger={historyRefreshTrigger} />
            </CardContent>
          </Card>

          {/* Comentários */}
          {userRole && (
            <CommentThread chamadoId={chamado._id} userRole={userRole} />
          )}

          {/* Anexos */}
          <Card className="overflow-hidden">
            <CardContent className="pt-5">
              <AttachmentGallery
                chamadoId={chamado._id}
                canUpload={chamado.status !== 'encerrado' && chamado.status !== 'cancelado'}
              />
            </CardContent>
          </Card>
        </div>

        {(canRegisterExecution || canPause || canResume) && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {canRegisterExecution && (
                  <Button
                    onClick={() => setExecutionDialogOpen(true)}
                    className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Wrench className="h-4 w-4" />
                    Registrar Execução
                  </Button>
                )}
                {canPause && (
                  <Button
                    onClick={() => setPauseDialogOpen(true)}
                    variant="outline"
                    className="w-full justify-start gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  >
                    <Hourglass className="h-4 w-4" />
                    Aguardando Solicitante
                  </Button>
                )}
                {canResume && (
                  <Button
                    onClick={() => setResumeDialogOpen(true)}
                    className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Play className="h-4 w-4" />
                    Retomar Atendimento
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <RegisterExecutionDialog
        open={executionDialogOpen}
        onOpenChange={setExecutionDialogOpen}
        chamado={chamado}
        onSuccess={onActionSuccess}
      />

      {chamadoId && (
        <PauseForRequesterDialog
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
          onSuccess={onActionSuccess}
        />
      )}
    </div>
  );
}
