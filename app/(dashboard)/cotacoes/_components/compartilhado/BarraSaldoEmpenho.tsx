import type { BarraEmpenhoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import { TEXTO_EMPENHO_DETALHE as T, textoProjecao } from '@/shared/material/mensagens';

/**
 * A barra de saldo de um empenho (spec 0021, AC-8): o comprometido pelas
 * outras cotações, o valor desta cotação e o que sobra depois dela, sobre o
 * líquido. A conta vem pronta do servidor; aqui só se desenha.
 */

const pct = (parte: number, todo: number) =>
  todo > 0 ? `${Math.min(100, Math.max(0, (parte / todo) * 100))}%` : '0%';

export function BarraSaldoEmpenho({
  barra,
  className,
}: {
  barra: BarraEmpenhoDTO;
  className?: string;
}) {
  const semSaldo = barra.saldoDepoisCentavos < 0;
  const esta = barra.estaCotacaoCentavos;
  const rotulo = T.rotuloBarra({
    numero: barra.numero,
    comprometido: formatarReais(barra.comprometidoCentavos),
    esta: esta != null ? formatarReais(esta) : null,
    depois: formatarReais(barra.saldoDepoisCentavos),
  });

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="font-mono text-[13px] font-medium">{barra.numero}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {T.liquido(formatarReais(barra.liquidoCentavos))}
        </span>
      </div>
      <div
        role="img"
        aria-label={rotulo}
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="h-full bg-indigo-300 dark:bg-indigo-400/50"
          style={{ width: pct(barra.comprometidoCentavos, barra.liquidoCentavos) }}
        />
        {esta != null && (
          <span
            className={cn('h-full', semSaldo ? 'bg-rose-600' : 'bg-indigo-600 dark:bg-indigo-400')}
            style={{ width: pct(esta, barra.liquidoCentavos) }}
          />
        )}
      </div>
      <dl
        className={cn(
          'grid gap-2 text-xs text-muted-foreground',
          esta != null ? 'grid-cols-3' : 'grid-cols-2',
        )}
      >
        <div>
          <dt>{T.comprometido}</dt>
          <dd className="text-[13px] font-semibold text-foreground tabular-nums">
            {formatarReais(barra.comprometidoCentavos)}
          </dd>
        </div>
        {esta != null && (
          <div>
            <dt>{T.estaCotacao}</dt>
            <dd className="text-[13px] font-semibold text-indigo-700 tabular-nums dark:text-indigo-300">
              {formatarReais(esta)}
            </dd>
          </div>
        )}
        <div>
          <dt>{esta != null ? T.saldoDepois : T.saldo}</dt>
          <dd
            className={cn(
              'text-[13px] font-semibold tabular-nums',
              semSaldo ? 'text-rose-700 dark:text-rose-300' : 'text-foreground',
            )}
          >
            {formatarReais(barra.saldoDepoisCentavos)}
          </dd>
        </div>
      </dl>
      {semSaldo && (
        <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{T.semSaldo}</p>
      )}
      {barra.projecao && (
        <p className="text-xs text-muted-foreground">{textoProjecao(barra.projecao)}</p>
      )}
    </div>
  );
}
