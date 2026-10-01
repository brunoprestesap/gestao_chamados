'use client';

import { Clock, History } from 'lucide-react';
import Link from 'next/link';

import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { cn } from '@/lib/utils';
import { formatarPrazoAvaliacao } from '@/shared/chamados/janela-avaliacao';

/**
 * "Avalie ou recuse até DD/MM às HH:mm" (spec 0010, AC-10), no fuso do
 * expediente. Quem decide se a janela está aberta é o servidor
 * (`janelaAvaliacaoAberta`); aqui só se mostra a data gravada.
 */
export function PrazoAvaliacao({
  prazoAvaliacaoAte,
  texto = 'Avalie ou recuse até',
  className,
}: {
  prazoAvaliacaoAte: string | null | undefined;
  texto?: string;
  className?: string;
}) {
  const timezone = useInstitutionalTimezone();
  const quando = formatarPrazoAvaliacao(prazoAvaliacaoAte, timezone);
  if (!quando) return null;
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {texto} {quando}
    </p>
  );
}

/** "Reincidência do chamado #N" com link para o anterior (spec 0010, AC-12). */
export function VinculoReincidencia({
  chamadoAnteriorId,
  chamadoAnteriorNumero,
  className,
}: {
  chamadoAnteriorId: string | null | undefined;
  chamadoAnteriorNumero: string | null | undefined;
  className?: string;
}) {
  if (!chamadoAnteriorId) return null;
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Reincidência do chamado{' '}
      <Link
        href={`/meus-chamados/${chamadoAnteriorId}`}
        className="font-semibold text-primary underline-offset-2 hover:underline"
      >
        #{chamadoAnteriorNumero ?? '…'}
      </Link>
    </p>
  );
}
