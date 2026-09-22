import { MessagesSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { marcaDeAbertura } from '@/shared/conversas/marca';

/**
 * A marca `Aberto pelo chat` (spec 0004, AC-15). Chamado do formulário não
 * mostra nada. A marca é texto, não só cor.
 */

type SeloProps = {
  texto: string;
  /** Coluna estreita (tabela da gestão): uma linha só, cortada com reticências. */
  compacta?: boolean;
  className?: string;
};

/** O selo com um texto de marca já decidido (`marcaDeAbertura`). */
export function SeloAberturaChat({ texto, compacta = false, className }: SeloProps) {
  return (
    <Badge
      variant="outline"
      title={compacta ? texto : undefined}
      className={cn(
        'max-w-full min-w-0 justify-start gap-1 border-primary/20 bg-primary/10 text-primary',
        compacta ? 'whitespace-nowrap' : 'whitespace-normal',
        className,
      )}
    >
      <MessagesSquare aria-hidden="true" className="shrink-0" />
      <span className={cn(compacta && 'truncate')}>{texto}</span>
    </Badge>
  );
}

export function MarcaAberturaChat({
  canalAbertura,
  servicoSugeridoIa,
  compacta,
  className,
}: {
  canalAbertura: string | null | undefined;
  servicoSugeridoIa: boolean | null | undefined;
  compacta?: boolean;
  className?: string;
}) {
  const marca = marcaDeAbertura(canalAbertura, servicoSugeridoIa);
  if (!marca) return null;
  return <SeloAberturaChat texto={marca} compacta={compacta} className={className} />;
}
