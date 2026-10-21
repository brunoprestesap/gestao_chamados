import { cn } from '@/lib/utils';
import { ROTULO_SINAL, TEXTO_FILA, textoSeloPrazoAteste } from '@/shared/material/mensagens';

/**
 * As etiquetas de sinal da fila (spec 0021, AC-4): Urgente, NF pendente,
 * Pesquisa pendente e o prazo do ateste. Sem sinal, um traço com o texto
 * para leitor de tela.
 */

type Prazo = { etapa: 'provisorio' | 'definitivo'; venceEm: string; atrasado: boolean };

const ETIQUETA =
  'inline-flex h-[22px] items-center rounded-md border px-2 text-[11.5px] font-semibold whitespace-nowrap';

const COR = {
  urgente:
    'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200',
  nf: 'border-border bg-background text-foreground/80',
  pesquisa:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  prazoAtrasado:
    'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200',
  prazo: 'border-border bg-background text-muted-foreground',
};

export function SinaisCotacao({
  urgente,
  notaFiscalPendente,
  pesquisaPendente,
  prazoAteste,
  className,
}: {
  urgente: boolean;
  notaFiscalPendente: boolean;
  pesquisaPendente: boolean;
  prazoAteste: Prazo | null;
  className?: string;
}) {
  const nada = !urgente && !notaFiscalPendente && !pesquisaPendente && !prazoAteste;
  if (nada) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{TEXTO_FILA.semSinal}</span>
      </span>
    );
  }
  return (
    <span className={cn('flex flex-wrap gap-1.5', className)}>
      {urgente && <span className={cn(ETIQUETA, COR.urgente)}>{ROTULO_SINAL.urgente}</span>}
      {notaFiscalPendente && (
        <span className={cn(ETIQUETA, COR.nf)}>{ROTULO_SINAL.notaFiscalPendente}</span>
      )}
      {pesquisaPendente && (
        <span className={cn(ETIQUETA, COR.pesquisa)}>{ROTULO_SINAL.pesquisaPendente}</span>
      )}
      {prazoAteste && (
        <span className={cn(ETIQUETA, prazoAteste.atrasado ? COR.prazoAtrasado : COR.prazo)}>
          {textoSeloPrazoAteste(prazoAteste)}
        </span>
      )}
    </span>
  );
}
