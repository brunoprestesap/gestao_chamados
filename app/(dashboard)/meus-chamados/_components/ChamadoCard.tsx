'use client';

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  MapPin,
  Star,
  User,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { hasValidEvaluation } from '@/shared/chamados/evaluation.utils';
import { ATTENDANCE_NATURE_LABELS } from '@/shared/chamados/chamado.constants';

/** Status de exibição do SLA (resolução) a partir de dados do DTO */
type SlaStatusDisplay = 'no_prazo' | 'proximo_vencimento' | 'atrasado';
function getSlaDisplayStatus(
  chamado: ChamadoDTO,
): SlaStatusDisplay | null {
  const sla = chamado.sla;
  const finalPriority = (chamado.finalPriority ?? 'NORMAL') as 'BAIXA' | 'NORMAL' | 'ALTA' | 'EMERGENCIAL';
  if (!sla?.resolutionDueAt) return null;
  const now = new Date();
  const resolutionDueAt = new Date(sla.resolutionDueAt);
  const resolvedAt = sla.resolvedAt ? new Date(sla.resolvedAt) : null;
  const resolutionBreachedAt = sla.resolutionBreachedAt ? new Date(sla.resolutionBreachedAt) : null;
  const resolutionStartAt = sla.computedAt ? new Date(sla.computedAt) : null;

  if (resolutionBreachedAt != null || (now > resolutionDueAt && resolvedAt == null)) return 'atrasado';
  if (resolvedAt != null) return resolutionBreachedAt != null ? 'atrasado' : 'no_prazo';

  const remainingMs = resolutionDueAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 'no_prazo';
  const fourHoursMs = 4 * 60 * 60 * 1000;
  if (finalPriority === 'ALTA' && remainingMs <= fourHoursMs) return 'proximo_vencimento';
  if (resolutionStartAt) {
    const totalMs = resolutionDueAt.getTime() - resolutionStartAt.getTime();
    if (totalMs > 0 && remainingMs <= totalMs * 0.2) return 'proximo_vencimento';
  }
  return 'no_prazo';
}

const SLA_STATUS_LABELS: Record<SlaStatusDisplay, string> = {
  no_prazo: 'No prazo',
  proximo_vencimento: 'Próximo do vencimento',
  atrasado: 'Atrasado',
};

import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_BADGE,
  STATUS_ICONS,
} from '../_constants';

// Types
export type SlaDTO = {
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  responseStartedAt: string | null;
  resolvedAt: string | null;
  responseBreachedAt: string | null;
  resolutionBreachedAt: string | null;
  computedAt: string | null;
  configVersion: string | null;
} | null;

export type ChamadoDTO = {
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
  createdAt: string;
  updatedAt: string;
  evaluation?: {
    rating?: number | null;
    notes?: string | null;
    createdAt?: string | null;
    createdByUserId?: string | null;
  } | null;
  sla?: SlaDTO;
};

type Props = {
  chamado: ChamadoDTO;
  /** Quando fornecido, exibe botão "Classificar" e chama ao clicar. */
  onClassificar?: (chamado: ChamadoDTO) => void;
  /** Quando fornecido, exibe botão "Atribuir" e chama ao clicar. */
  onAtribuir?: (chamado: ChamadoDTO) => void;
  /** Quando fornecido e status "Concluído", exibe botão "Encerrar Chamado" (Preposto/Admin). */
  onEncerrar?: (chamado: ChamadoDTO) => void;
  /** Quando fornecido e status "Em atendimento", exibe botão "Reatribuir" (Preposto/Admin). */
  onReatribuir?: (chamado: ChamadoDTO) => void;
  /** Quando fornecido com showAvaliar, ao clicar em "Avaliar" chama isto em vez de navegar. */
  onAvaliar?: (chamado: ChamadoDTO) => void;
  /** Se true, card e título não navegam para detalhe (ex.: módulo gestão). */
  hideDetailLink?: boolean;
  /** Se true, exibe "Avaliar" ou "Avaliado" para chamados encerrados (solicitante). */
  showAvaliar?: boolean;
  /** Se true, exibe versão compacta (ex.: Kanban gestão) com padding e textos menores. */
  compact?: boolean;
};

type AdditionalData = {
  userName: string | null;
  unitName: string | null;
  subtypeName: string | null;
};

// Constants
const GRAU_URGENCIA_LABELS: Record<string, string> = {
  Baixo: 'Baixa',
  Normal: 'Normal',
  Alto: 'Alta',
  Crítico: 'Emergencial',
} as const;

const GRAU_URGENCIA_COLORS: Record<string, string> = {
  Baixo: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300',
  Normal: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300',
  Alto: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900 dark:text-orange-300',
  Crítico: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300',
} as const;

// Utility functions
const formatDateTime = (dateString: string): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
};

const formatDateShort = (dateString: string): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(dateString));
};

const getGrauUrgenciaLabel = (grau: string): string => {
  return GRAU_URGENCIA_LABELS[grau] || grau;
};

const getGrauUrgenciaColor = (grau: string): string => {
  return GRAU_URGENCIA_COLORS[grau] || 'bg-gray-100 text-gray-700';
};

// API helpers
async function fetchUser(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/users/${userId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    // Retorna o nome completo (nome e sobrenome) ao invés da matrícula
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

// Component
export function ChamadoCard({
  chamado,
  onClassificar,
  onAtribuir,
  onEncerrar,
  onReatribuir,
  onAvaliar,
  hideDetailLink,
  showAvaliar = false,
  compact = false,
}: Props) {
  const router = useRouter();
  const StatusIcon = STATUS_ICONS[chamado.status];
  const [additionalData, setAdditionalData] = useState<AdditionalData>({
    userName: null,
    unitName: null,
    subtypeName: null,
  });

  // Fetch additional data
  useEffect(() => {
    let isMounted = true;

    async function loadAdditionalData() {
      const promises: Promise<void>[] = [];

      if (chamado.solicitanteId) {
        promises.push(
          fetchUser(chamado.solicitanteId).then((userName) => {
            if (isMounted) {
              setAdditionalData((prev) => ({ ...prev, userName }));
            }
          }),
        );
      }

      if (chamado.unitId) {
        promises.push(
          fetchUnit(chamado.unitId).then((unitName) => {
            if (isMounted) {
              setAdditionalData((prev) => ({ ...prev, unitName }));
            }
          }),
        );
      }

      if (chamado.subtypeId) {
        promises.push(
          fetchSubtype(chamado.subtypeId).then((subtypeName) => {
            if (isMounted) {
              setAdditionalData((prev) => ({ ...prev, subtypeName }));
            }
          }),
        );
      }

      await Promise.all(promises);
    }

    loadAdditionalData();

    return () => {
      isMounted = false;
    };
  }, [chamado.solicitanteId, chamado.unitId, chamado.subtypeId]);

  // Memoized values
  const categoriaText = useMemo(() => {
    const parts = [chamado.tipoServico];
    if (additionalData.subtypeName) {
      parts.push(additionalData.subtypeName);
    }
    return parts.filter(Boolean).join(' • ');
  }, [chamado.tipoServico, additionalData.subtypeName]);

  const formattedDate = useMemo(() => formatDateTime(chamado.createdAt), [chamado.createdAt]);
  const formattedDateShort = useMemo(() => formatDateShort(chamado.createdAt), [chamado.createdAt]);

  /** Urgente com base na natureza APROVADA (nunca na solicitada) */
  const isUrgente = useMemo(
    () =>
      chamado.attendanceNature === 'URGENTE' ||
      (chamado.naturezaAtendimento === 'Urgente' && !chamado.attendanceNature),
    [chamado.attendanceNature, chamado.naturezaAtendimento],
  );

  const slaStatus = useMemo(() => getSlaDisplayStatus(chamado), [chamado]);
  const slaTooltip = useMemo(() => {
    const s = chamado.sla;
    const parts: string[] = [];
    if (chamado.finalPriority) parts.push(`Prioridade: ${chamado.finalPriority}`);
    const approvedLabel =
      chamado.attendanceNature && ATTENDANCE_NATURE_LABELS[chamado.attendanceNature as keyof typeof ATTENDANCE_NATURE_LABELS]
        ? ATTENDANCE_NATURE_LABELS[chamado.attendanceNature as keyof typeof ATTENDANCE_NATURE_LABELS]
        : chamado.naturezaAtendimento;
    if (approvedLabel) parts.push(`Natureza aprovada: ${approvedLabel}`);
    if (s?.responseDueAt) parts.push(`Prazo resposta: ${formatDateTime(s.responseDueAt)}`);
    if (s?.resolutionDueAt) parts.push(`Prazo solução: ${formatDateTime(s.resolutionDueAt)}`);
    return parts.join(' · ');
  }, [chamado.sla, chamado.finalPriority, chamado.attendanceNature, chamado.naturezaAtendimento]);

  const handleCardClick = useCallback(() => {
    if (hideDetailLink) return;
    router.push(`/meus-chamados/${chamado._id}`);
  }, [router, chamado._id, hideDetailLink]);

  const handleTitleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hideDetailLink) return;
      router.push(`/meus-chamados/${chamado._id}`);
    },
    [router, chamado._id, hideDetailLink],
  );

  const handleClassificarClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClassificar?.(chamado);
    },
    [onClassificar, chamado],
  );

  const handleAtribuirClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAtribuir?.(chamado);
    },
    [onAtribuir, chamado],
  );

  const handleEncerrarClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEncerrar?.(chamado);
    },
    [onEncerrar, chamado],
  );

  const handleReatribuirClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReatribuir?.(chamado);
    },
    [onReatribuir, chamado],
  );

  const evaluated = hasValidEvaluation(chamado.evaluation);
  const showAvaliarBtn = showAvaliar && chamado.status === 'encerrado' && !evaluated;
  const showAvaliadoBadge = showAvaliar && chamado.status === 'encerrado' && evaluated;
  const hasActionButtons =
    showAvaliarBtn ||
    showAvaliadoBadge ||
    onClassificar ||
    onAtribuir ||
    (onEncerrar && chamado.status === 'concluído') ||
    (onReatribuir && chamado.status === 'em atendimento');

  return (
    <Card
      className={cn(
        'group overflow-hidden border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700',
        !hideDetailLink && 'cursor-pointer',
        compact && 'shadow-xs',
      )}
      onClick={handleCardClick}
    >
      <CardContent className={cn(compact ? 'p-3' : 'p-6')}>
        <div className={cn('flex', compact ? 'gap-3' : 'gap-5')}>
          {/* Ícone lateral - elemento visual de destaque */}
          <div className="flex shrink-0 items-start">
            <div
              className={cn(
                'flex items-center justify-center rounded-xl bg-gradient-to-br from-yellow-100 to-orange-100 shadow-sm dark:from-yellow-900/30 dark:to-orange-900/30',
                compact ? 'h-9 w-9' : 'h-14 w-14',
              )}
            >
              <Wrench
                className={cn(
                  'text-orange-600 dark:text-orange-400',
                  compact ? 'h-4 w-4' : 'h-7 w-7',
                )}
              />
            </div>
          </div>

          {/* Conteúdo principal - hierarquia visual clara */}
          <div className={cn('flex-1 min-w-0', compact ? 'space-y-2' : 'space-y-4')}>
            {/* Seção 1: Cabeçalho - Informações primárias */}
            <div className={compact ? 'space-y-1' : 'space-y-2'}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className={cn('flex flex-wrap items-center gap-2', !compact && 'gap-3')}>
                    <h3
                      className={cn(
                        'font-bold tracking-tight text-gray-900 dark:text-gray-100',
                        compact
                          ? 'rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-sm tabular-nums'
                          : 'text-2xl',
                      )}
                      title={`Chamado ${chamado.ticket_number || 'Sem número'}`}
                    >
                      #{chamado.ticket_number || 'Sem número'}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 border font-semibold',
                        compact ? 'text-[10px]' : 'text-xs',
                        STATUS_BADGE[chamado.status],
                      )}
                    >
                      <StatusIcon className={cn(compact ? 'mr-1 h-3 w-3' : 'mr-1.5 h-3.5 w-3.5')} />
                      {CHAMADO_STATUS_LABELS[chamado.status]}
                    </Badge>
                    {isUrgente && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'shrink-0 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
                          compact && 'text-[10px]',
                        )}
                      >
                        <AlertTriangle
                          className={cn(compact ? 'mr-1 h-3 w-3' : 'mr-1.5 h-3.5 w-3.5')}
                        />
                        Urgente
                      </Badge>
                    )}
                    {chamado.sla && slaStatus != null && (
                      <Badge
                        variant="outline"
                        title={slaTooltip}
                        className={cn(
                          'shrink-0',
                          compact && 'text-[10px]',
                          slaStatus === 'atrasado' &&
                            'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200',
                          slaStatus === 'proximo_vencimento' &&
                            'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
                          slaStatus === 'no_prazo' &&
                            'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
                        )}
                      >
                        {SLA_STATUS_LABELS[slaStatus]}
                      </Badge>
                    )}
                  </div>
                  {!compact && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {categoriaText && (
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          {categoriaText}
                        </p>
                      )}
                      {chamado.naturezaAtendimento && chamado.naturezaAtendimento !== 'Urgente' && (
                        <>
                          {categoriaText && <span className="text-gray-400">•</span>}
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {chamado.naturezaAtendimento}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {compact && categoriaText && (
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {categoriaText}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Seção 2: Conteúdo do chamado - Título e descrição */}
            <div className={compact ? 'space-y-1' : 'space-y-2.5'}>
              <button
                type="button"
                className="group/title flex items-start gap-1.5 text-left transition-colors hover:text-blue-700 dark:hover:text-blue-300"
                onClick={handleTitleClick}
                title={chamado.titulo || 'Sem título'}
              >
                <span
                  className={cn(
                    'font-semibold text-gray-900 group-hover/title:underline dark:text-gray-100',
                    compact ? 'text-sm line-clamp-1' : 'text-base',
                  )}
                >
                  {chamado.titulo || 'Sem título'}
                </span>
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 opacity-0 transition-opacity group-hover/title:opacity-100 dark:text-blue-400" />
              </button>
              <p
                className={cn(
                  'leading-relaxed text-gray-600 dark:text-gray-300',
                  compact ? 'line-clamp-1 text-xs' : 'line-clamp-2 text-sm',
                )}
                title={chamado.descricao || 'Sem descrição'}
              >
                {chamado.descricao || 'Sem descrição'}
              </p>
            </div>

            {/* Seção 3: Metadados contextuais - Agrupados visualmente */}
            <div
              className={cn(
                'rounded-lg bg-gray-50/50 dark:bg-gray-800/50',
                compact ? 'p-2' : 'p-3',
              )}
            >
              <div className={cn('grid grid-cols-1 gap-2.5 sm:grid-cols-2', compact && 'gap-1.5')}>
                {additionalData.unitName && (
                  <MetadataItem
                    icon={Building2}
                    label={additionalData.unitName}
                    compact={compact}
                  />
                )}
                {chamado.localExato && (
                  <MetadataItem icon={MapPin} label={chamado.localExato} compact={compact} />
                )}
                <MetadataItem
                  icon={Clock}
                  label={compact ? formattedDateShort : formattedDate}
                  title={formattedDate}
                  compact={compact}
                />
                {additionalData.userName && (
                  <MetadataItem icon={User} label={additionalData.userName} compact={compact} />
                )}
              </div>
            </div>

            {/* Seção 4: Rodapé - Indicadores e ações */}
            <div className="space-y-0 border-t border-gray-200 dark:border-gray-800">
              {/* Indicadores: prioridade e SLA */}
              <div
                className={cn(
                  'flex flex-wrap items-center gap-2',
                  compact ? 'gap-1.5 py-2' : 'gap-2.5 py-3',
                )}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    'border font-medium',
                    compact ? 'text-[10px]' : 'text-xs',
                    getGrauUrgenciaColor(chamado.grauUrgencia),
                  )}
                >
                  {getGrauUrgenciaLabel(chamado.grauUrgencia)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200',
                    compact && 'text-[10px]',
                  )}
                >
                  <CheckCircle2 className={cn(compact ? 'mr-1 h-3 w-3' : 'mr-1.5 h-3.5 w-3.5')} />
                  Dentro do Prazo 0
                </Badge>
              </div>
              {/* Ações: botões separados visualmente */}
              {hasActionButtons && (
                <div
                  className={cn(
                    'flex flex-wrap items-center justify-end gap-2 rounded-md bg-muted/40 px-2 py-2 dark:bg-muted/20',
                    compact && 'gap-1.5 py-1.5',
                  )}
                  role="group"
                  aria-label="Ações do chamado"
                >
                  {showAvaliarBtn && (
                    <Button
                      type="button"
                      size={compact ? 'sm' : 'sm'}
                      variant="default"
                      title="Avaliar atendimento"
                      className={cn(
                        'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700',
                        compact ? 'h-7 gap-1 px-2 text-xs' : 'gap-1.5',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onAvaliar) onAvaliar(chamado);
                        else router.push(`/meus-chamados/${chamado._id}`);
                      }}
                    >
                      <Star className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                      Avaliar
                    </Button>
                  )}
                  {showAvaliadoBadge && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
                        compact && 'text-[10px]',
                      )}
                      title="Chamado já avaliado"
                    >
                      <Star
                        className={cn(
                          compact ? 'mr-1 h-3 w-3 fill-current' : 'mr-1.5 h-3.5 w-3.5 fill-current',
                        )}
                      />
                      Avaliado
                    </Badge>
                  )}
                  {onClassificar && (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      title="Classificar chamado (prioridade e natureza)"
                      className={cn(compact && 'h-7 gap-1 px-2 text-xs')}
                      onClick={handleClassificarClick}
                    >
                      <ClipboardList className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                      Classificar
                    </Button>
                  )}
                  {onAtribuir && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      title="Atribuir a um técnico"
                      className={cn(compact && 'h-7 gap-1 px-2 text-xs')}
                      onClick={handleAtribuirClick}
                    >
                      <UserCheck className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                      Atribuir
                    </Button>
                  )}
                  {onEncerrar && chamado.status === 'concluído' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      title="Encerrar chamado"
                      className={cn(
                        'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700',
                        compact && 'h-7 gap-1 px-2 text-xs',
                      )}
                      onClick={handleEncerrarClick}
                    >
                      <CheckCircle2 className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                      Encerrar Chamado
                    </Button>
                  )}
                  {onReatribuir && chamado.status === 'em atendimento' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      title="Reatribuir a outro técnico"
                      className={cn(compact && 'h-7 gap-1 px-2 text-xs')}
                      onClick={handleReatribuirClick}
                    >
                      <UserCheck className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
                      Reatribuir
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Sub-components
type MetadataItemProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title?: string;
  compact?: boolean;
};

function MetadataItem({ icon: Icon, label, title, compact }: MetadataItemProps) {
  return (
    <div className={cn('flex items-center gap-2.5', compact && 'gap-1.5')}>
      <Icon
        className={cn(
          'shrink-0 text-gray-400 dark:text-gray-500',
          compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
        )}
      />
      <span
        className={cn('truncate text-gray-700 dark:text-gray-300', compact ? 'text-xs' : 'text-sm')}
        title={title ?? label}
      >
        {label}
      </span>
    </div>
  );
}
