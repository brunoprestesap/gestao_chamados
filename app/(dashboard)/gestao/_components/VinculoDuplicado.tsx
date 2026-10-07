'use client';

import { Copy } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

import { cn } from '@/lib/utils';

/**
 * "Possível duplicado de #N" (spec 0017, AC-13): o chamado foi aberto pelo
 * chat mesmo depois do aviso de chamado parecido. Só a gestão vê; os números
 * vêm da rota, lidos na hora, e id que não existe mais já veio omitido.
 */
export function VinculoDuplicado({
  avisoDuplicado,
  className,
}: {
  avisoDuplicado: { chamadoId: string; ticketNumber: string }[] | null | undefined;
  className?: string;
}) {
  if (!avisoDuplicado || avisoDuplicado.length === 0) return null;
  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Possível duplicado de{' '}
      {avisoDuplicado.map((item, indice) => (
        <Fragment key={item.chamadoId}>
          {indice > 0 ? ', ' : null}
          <Link
            href={`/meus-chamados/${item.chamadoId}`}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            #{item.ticketNumber}
          </Link>
        </Fragment>
      ))}
    </p>
  );
}
