import { AlertTriangle, Wind, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDate, truncate } from '@/lib/utils';

import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  STATUS_ACCENT,
  STATUS_BADGE,
  STATUS_ICONS,
} from '../_constants';

export type ChamadoDTO = {
  _id: string;
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

type Props = { chamado: ChamadoDTO };

export function ChamadoCard({ chamado }: Props) {
  const StatusIcon = STATUS_ICONS[chamado.status];
  const isUrgente = chamado.naturezaAtendimento === 'Urgente';
  const TipoIcon = chamado.tipoServico === 'Manutenção Predial' ? Wrench : Wind;

  return (
    <Card
      className={`overflow-hidden border-l-4 transition-shadow hover:shadow-md ${STATUS_ACCENT[chamado.status]}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-semibold leading-tight text-foreground">
            {chamado.titulo || 'Sem título'}
          </h3>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge
              variant="outline"
              className={`border text-xs font-medium ${STATUS_BADGE[chamado.status]}`}
            >
              <StatusIcon className="mr-1 h-3 w-3" />
              {CHAMADO_STATUS_LABELS[chamado.status]}
            </Badge>
            {isUrgente && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Urgente
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <TipoIcon className="h-3 w-3" />
            <span>{chamado.tipoServico}</span>
          </div>
          {chamado.localExato && (
            <>
              <span>•</span>
              <span className="line-clamp-1">{chamado.localExato}</span>
            </>
          )}
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {truncate(chamado.descricao, 120)}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Aberto em {formatDate(chamado.createdAt)}</span>
          {chamado.updatedAt !== chamado.createdAt && (
            <span>Atualizado em {formatDate(chamado.updatedAt)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
