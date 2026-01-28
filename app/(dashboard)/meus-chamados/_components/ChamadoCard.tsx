'use client';

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  MapPin,
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

import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_BADGE,
  STATUS_ICONS,
} from '../_constants';

// Types
export type ChamadoDTO = {
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
  createdAt: string;
  updatedAt: string;
};

type Props = {
  chamado: ChamadoDTO;
  /** Quando fornecido, exibe botão "Classificar" e chama ao clicar. */
  onClassificar?: (chamado: ChamadoDTO) => void;
  /** Quando fornecido, exibe botão "Atribuir" e chama ao clicar. */
  onAtribuir?: (chamado: ChamadoDTO) => void;
  /** Se true, card e título não navegam para detalhe (ex.: módulo gestão). */
  hideDetailLink?: boolean;
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
export function ChamadoCard({ chamado, onClassificar, onAtribuir, hideDetailLink }: Props) {
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

  const isUrgente = useMemo(
    () => chamado.naturezaAtendimento === 'Urgente',
    [chamado.naturezaAtendimento],
  );

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

  return (
    <Card
      className={cn(
        'group overflow-hidden border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700',
        !hideDetailLink && 'cursor-pointer',
      )}
      onClick={handleCardClick}
    >
      <CardContent className="p-6">
        <div className="flex gap-5">
          {/* Ícone lateral - elemento visual de destaque */}
          <div className="flex shrink-0 items-start">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-100 to-orange-100 shadow-sm dark:from-yellow-900/30 dark:to-orange-900/30">
              <Wrench className="h-7 w-7 text-orange-600 dark:text-orange-400" />
            </div>
          </div>

          {/* Conteúdo principal - hierarquia visual clara */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Seção 1: Cabeçalho - Informações primárias */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                      #{chamado.ticket_number || 'Sem número'}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`shrink-0 border text-xs font-semibold ${STATUS_BADGE[chamado.status]}`}
                    >
                      <StatusIcon className="mr-1.5 h-3.5 w-3.5" />
                      {CHAMADO_STATUS_LABELS[chamado.status]}
                    </Badge>
                    {isUrgente && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      >
                        <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                        Urgente
                      </Badge>
                    )}
                  </div>
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
                </div>
              </div>
            </div>

            {/* Seção 2: Conteúdo do chamado - Título e descrição */}
            <div className="space-y-2.5">
              <button
                type="button"
                className="group/title flex items-start gap-2 text-left transition-colors hover:text-blue-700 dark:hover:text-blue-300"
                onClick={handleTitleClick}
              >
                <span className="text-base font-semibold text-gray-900 group-hover/title:underline dark:text-gray-100">
                  {chamado.titulo || 'Sem título'}
                </span>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-hover/title:opacity-100 dark:text-blue-400" />
              </button>
              <p className="line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                {chamado.descricao || 'Sem descrição'}
              </p>
            </div>

            {/* Seção 3: Metadados contextuais - Agrupados visualmente */}
            <div className="rounded-lg bg-gray-50/50 p-3 dark:bg-gray-800/50">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {additionalData.unitName && (
                  <MetadataItem icon={Building2} label={additionalData.unitName} />
                )}
                {chamado.localExato && <MetadataItem icon={MapPin} label={chamado.localExato} />}
                <MetadataItem icon={Clock} label={formattedDate} />
                {additionalData.userName && (
                  <MetadataItem icon={User} label={additionalData.userName} />
                )}
              </div>
            </div>

            {/* Seção 4: Rodapé - Indicadores e ações */}
            <div className="flex flex-wrap items-center gap-2.5 border-t border-gray-200 pt-3.5 dark:border-gray-800">
              <Badge
                variant="outline"
                className={`border text-xs font-medium ${getGrauUrgenciaColor(chamado.grauUrgencia)}`}
              >
                {getGrauUrgenciaLabel(chamado.grauUrgencia)}
              </Badge>
              <Badge
                variant="outline"
                className="border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200"
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Dentro do Prazo 0
              </Badge>
              <div className="ml-auto flex gap-2">
                {onClassificar && (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="gap-1.5"
                    onClick={handleClassificarClick}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Classificar
                  </Button>
                )}
                {onAtribuir && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleAtribuirClick}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Atribuir
                  </Button>
                )}
              </div>
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
};

function MetadataItem({ icon: Icon, label }: MetadataItemProps) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
      <span className="truncate text-sm text-gray-700 dark:text-gray-300" title={label}>
        {label}
      </span>
    </div>
  );
}
