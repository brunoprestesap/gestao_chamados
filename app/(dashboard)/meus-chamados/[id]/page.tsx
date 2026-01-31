'use client';

import { ArrowLeft, Clock, Loader2, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import {
  AvaliarChamadoDialog,
  type AvaliarChamadoDialogChamado,
} from '@/app/(dashboard)/meus-chamados/_components/AvaliarChamadoDialog';
import { HistoryTimeline } from '@/app/(dashboard)/meus-chamados/[id]/_components/HistoryTimeline';
import { CancelTicketDialog } from '@/app/(dashboard)/meus-chamados/[id]/_components/CancelTicketDialog';
import { EncerrarChamadoDialog } from '@/app/(dashboard)/gestao/_components/EncerrarChamadoDialog';
import { ReatribuirChamadoDialog } from '@/app/(dashboard)/gestao/_components/ReatribuirChamadoDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/dashboard/header';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatDateTime } from '@/lib/utils';
import { ATTENDANCE_NATURE_LABELS } from '@/shared/chamados/chamado.constants';

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

  if (resolutionBreachedAt != null || (now > resolutionDueAt && resolvedAt == null)) return 'Atrasado';
  if (resolvedAt != null) return resolutionBreachedAt != null ? 'Atrasado' : 'No prazo';
  const remainingMs = resolutionDueAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 'No prazo';
  if (finalPriority === 'ALTA' && remainingMs <= 4 * 60 * 60 * 1000) return 'Próximo do vencimento';
  if (resolutionStartAt && remainingMs <= (resolutionDueAt.getTime() - resolutionStartAt.getTime()) * 0.2)
    return 'Próximo do vencimento';
  return 'No prazo';
}
import { hasValidEvaluation } from '@/shared/chamados/evaluation.utils';
import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_ACCENT,
  STATUS_BADGE,
  STATUS_ICONS,
} from '@/app/(dashboard)/meus-chamados/_constants';

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

export default function ChamadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
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
        alert(data.error || 'Erro ao cancelar chamado');
        return;
      }

      // Atualiza o chamado localmente
      if (chamado) {
        setChamado({ ...chamado, status: 'cancelado' });
      }
      setCancelDialogOpen(false);

      // Recarrega o chamado e força atualização do histórico
      await fetchChamado(chamadoId);
      setHistoryRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Erro ao cancelar chamado:', error);
      alert('Erro ao cancelar chamado. Tente novamente.');
    }
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
          <Button onClick={() => router.push('/meus-chamados')} className="mt-4" variant="outline">
            Voltar para Meus Chamados
          </Button>
        </div>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[chamado.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title="Detalhes do Chamado" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informações principais */}
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
                    Natureza solicitada
                  </h4>
                  <p className="text-sm">
                    {chamado.requestedAttendanceNature
                      ? ATTENDANCE_NATURE_LABELS[chamado.requestedAttendanceNature as keyof typeof ATTENDANCE_NATURE_LABELS]
                      : chamado.naturezaAtendimento || '—'}
                  </p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                    Natureza aprovada
                  </h4>
                  <p className="text-sm">
                    {chamado.attendanceNature
                      ? ATTENDANCE_NATURE_LABELS[chamado.attendanceNature as keyof typeof ATTENDANCE_NATURE_LABELS]
                      : chamado.naturezaAtendimento || '—'}
                  </p>
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
                  <span>Aberto em {formatDate(chamado.createdAt)}</span>
                </div>
                {chamado.updatedAt !== chamado.createdAt && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Atualizado em {formatDate(chamado.updatedAt)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SLA */}
          {chamado.sla && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SLA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                      Prioridade final
                    </h4>
                    <p className="text-sm">{chamado.sla.priority ?? chamado.finalPriority ?? '—'}</p>
                  </div>
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                      Natureza aprovada
                    </h4>
                    <p className="text-sm">
                      {chamado.attendanceNature
                        ? ATTENDANCE_NATURE_LABELS[chamado.attendanceNature as keyof typeof ATTENDANCE_NATURE_LABELS]
                        : chamado.naturezaAtendimento || '—'}
                    </p>
                  </div>
                  {chamado.sla.businessHoursOnly != null && (
                    <div>
                      <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                        Horário comercial
                      </h4>
                      <p className="text-sm">{chamado.sla.businessHoursOnly ? 'Sim (08h–18h, seg–sex)' : 'Não (24x7)'}</p>
                    </div>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                      Prazo de Resposta
                    </h4>
                    <p className="text-sm">
                      {chamado.sla.responseDueAt
                        ? formatDateTime(chamado.sla.responseDueAt)
                        : '—'}
                    </p>
                    {chamado.sla.responseStartedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Iniciado em {formatDateTime(chamado.sla.responseStartedAt)}
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                      Prazo de Solução
                    </h4>
                    <p className="text-sm">
                      {chamado.sla.resolutionDueAt
                        ? formatDateTime(chamado.sla.resolutionDueAt)
                        : '—'}
                    </p>
                    {chamado.sla.resolvedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Resolvido em {formatDateTime(chamado.sla.resolvedAt)}
                      </p>
                    )}
                  </div>
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
                    <div>
                      <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                        Status do SLA
                      </h4>
                      <Badge variant="outline" className={statusClass}>
                        {slaStatus}
                      </Badge>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Histórico */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Alterações</CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryTimeline chamadoId={chamado._id} refreshTrigger={historyRefreshTrigger} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Ações */}
        {isOwner &&
          chamado.status !== 'cancelado' &&
          chamado.status !== 'concluído' &&
          chamado.status !== 'encerrado' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ações</CardTitle>
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
            </div>
          )}

        {canManageChamado && chamado.status === 'em atendimento' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ações (Gestão)</CardTitle>
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
          </div>
        )}

        {canManageChamado && chamado.status === 'concluído' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ações (Gestão)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  onClick={() => setEncerrarDialogOpen(true)}
                  className="w-full justify-start bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                >
                  Encerrar Chamado
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {isOwner && chamado.status === 'encerrado' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Avaliação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {hasValidEvaluation(chamado.evaluation) ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/20">
                    <Star className="h-4 w-4 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                      Avaliado
                      {chamado.evaluation?.rating != null && ` · ${chamado.evaluation.rating}/5`}
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Pendente</p>
                    <Button
                      className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                      onClick={() => setAvaliarDialogOpen(true)}
                    >
                      <Star className="h-4 w-4" />
                      Avaliar
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

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
