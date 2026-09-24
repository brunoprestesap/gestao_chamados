import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * O selo "Validado automaticamente pela IA" (spec 0007, AC-15). Marca a
 * origem da validação, não o estado atual dela: continua aparecendo mesmo
 * depois de uma correção de prioridade (AC-11), porque quem chama nunca lê
 * `Chamado.iaSituacao` para decidir `validadoPelaIa` (esse campo vira
 * `'revisada'` numa correção e desfaria o selo sem motivo).
 */
export function SeloValidadoIa({
  validadoPelaIa,
  className,
}: {
  validadoPelaIa: boolean | null | undefined;
  className?: string;
}) {
  if (!validadoPelaIa) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'max-w-full min-w-0 justify-start gap-1 whitespace-nowrap border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
        className,
      )}
    >
      <Sparkles aria-hidden="true" className="shrink-0" />
      <span>Validado automaticamente pela IA</span>
    </Badge>
  );
}
