import { UserX } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AtribuicaoAutomaticaGestao } from '@/shared/chamados/atribuicao-automatica.constants';

/**
 * O selo "Sem técnico automático" (spec 0008, AC-15), na lista da gestão. Diz
 * ao Preposto que a atribuição automática tentou e não achou técnico, e que o
 * chamado espera por ele. Some assim que o chamado tem técnico, seja por quem
 * atribuiu à mão, seja qual for o motivo. O motivo em si fica no detalhe.
 *
 * A informação é texto, nunca só cor: o ícone é decorativo.
 */
export function SeloSemTecnicoAutomatico({
  atribuicaoAutomatica,
  assignedToUserId,
  className,
}: {
  atribuicaoAutomatica: AtribuicaoAutomaticaGestao | null | undefined;
  assignedToUserId: string | null | undefined;
  className?: string;
}) {
  if (atribuicaoAutomatica?.resultado !== 'sem_tecnico' || assignedToUserId) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'max-w-full min-w-0 justify-start gap-1 whitespace-nowrap border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
        className,
      )}
    >
      <UserX aria-hidden="true" className="shrink-0" />
      <span>Sem técnico automático</span>
    </Badge>
  );
}
