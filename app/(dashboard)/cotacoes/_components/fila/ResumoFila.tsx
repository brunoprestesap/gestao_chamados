import type { ResumoFila as Resumo } from '@/lib/material/leitura';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import { TEXTO_RESUMO_FILA as T } from '@/shared/material/mensagens';

/**
 * O resumo do topo da fila (spec 0021, AC-2), global por papel. O lado TRF1
 * vê valor e saldo; a contratada só contagens.
 */

function Bloco({
  titulo,
  valor,
  ajuda,
  destaque,
  alerta,
}: {
  titulo: string;
  valor: string;
  ajuda: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border/50 bg-card px-4 py-4',
        destaque &&
          'border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/10',
      )}
    >
      <dt
        className={cn(
          'text-sm font-semibold text-muted-foreground',
          destaque && 'text-indigo-800 dark:text-indigo-200',
          alerta && 'text-orange-800 dark:text-orange-200',
        )}
      >
        {titulo}
      </dt>
      <dd className="contents">
        <span
          className={cn(
            'text-3xl font-bold tracking-tight tabular-nums',
            alerta && 'text-orange-800 dark:text-orange-200',
          )}
        >
          {valor}
        </span>
        <span className="text-xs text-muted-foreground">{ajuda}</span>
      </dd>
    </div>
  );
}

export function ResumoFila({ resumo }: { resumo: Resumo }) {
  return (
    <section aria-label={T.rotulo}>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {resumo.lado === 'trf1' ? (
          <>
            <Bloco
              destaque
              titulo={T.esperandoVoce}
              valor={String(resumo.esperandoVoce)}
              ajuda={T.esperandoVoceAjuda}
            />
            <Bloco
              titulo={T.emAprovacao}
              valor={String(resumo.emAprovacao.qtd)}
              ajuda={T.aReservar(formatarReais(resumo.emAprovacao.valorCentavos))}
            />
            <Bloco
              alerta={resumo.atesteAtrasado > 0}
              titulo={T.atesteAtrasado}
              valor={String(resumo.atesteAtrasado)}
              ajuda={T.prazoPorEtapa}
            />
            <Bloco
              titulo={T.saldoElegivel}
              valor={
                resumo.saldoElegivelCentavos === null
                  ? '—'
                  : formatarReais(resumo.saldoElegivelCentavos)
              }
              ajuda={resumo.saldoElegivelCentavos === null ? T.semEmpenhoElegivel : ''}
            />
          </>
        ) : (
          <>
            <Bloco
              destaque
              titulo={T.esperandoVoce}
              valor={String(resumo.esperandoVoce)}
              ajuda={T.esperandoVoceAjuda}
            />
            <Bloco
              alerta={resumo.devolvidas > 0}
              titulo={T.devolvidas}
              valor={String(resumo.devolvidas)}
              ajuda={T.devolvidasAjuda}
            />
            <Bloco
              titulo={T.nfPendente}
              valor={String(resumo.nfPendente)}
              ajuda={T.nfPendenteAjuda}
            />
          </>
        )}
      </dl>
    </section>
  );
}
