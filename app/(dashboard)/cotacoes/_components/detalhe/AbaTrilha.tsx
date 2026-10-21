import type { EventoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import {
  ROTULO_ACAO,
  ROTULO_PAPEL,
  TEXTO_DETALHE as T,
  textoDoMotivo,
  textoProjecao,
} from '@/shared/material/mensagens';

import { SituacaoPill } from '../compartilhado/SituacaoPill';

/**
 * A aba Trilha do detalhe (spec 0021, AC-7), do ato mais novo ao mais antigo.
 * Mostra só o que `serializarCotacao` entregou à visão: o TRF1 recebe limite,
 * valores e projeção; contratada e técnico chegam sem eles, sem o autor dos
 * atos de `ACOES_SEM_AUTOR_FORA_DO_TRF1` e sem `conciliar`.
 */

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

export function AbaTrilha({ trilha }: { trilha: EventoDTO[] }) {
  if (!trilha.length) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{T.semTrilha}</p>;
  }
  return (
    <ol className="px-5 py-5 sm:px-6">
      {[...trilha].reverse().map((ev, n) => {
        const mudou = ev.de !== ev.para;
        const valores = [
          ev.limiteCentavosNoAto != null
            ? T.limiteNoAto(formatarReais(ev.limiteCentavosNoAto))
            : null,
          ev.valorCentavos != null
            ? (ev.valorCentavos >= 0 ? T.reservado : T.liberado)(
                formatarReais(Math.abs(ev.valorCentavos)),
              )
            : null,
        ].filter(Boolean);
        const motivo = textoDoMotivo(ev.motivo);
        return (
          <li key={ev.id} className="relative grid grid-cols-[20px_1fr] gap-3.5 pb-5 last:pb-0">
            {n < trilha.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-5 bottom-0 left-[9px] w-px bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative mt-1 size-3 justify-self-center rounded-full ring-4 ring-card',
                mudou ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-indigo-200 dark:bg-indigo-500/40',
              )}
            />
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {ROTULO_ACAO[ev.acao as keyof typeof ROTULO_ACAO] ?? ev.acao}
                {mudou && <SituacaoPill situacao={ev.para} />}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {ev.autorNome
                  ? `${ev.autorNome} (${ROTULO_PAPEL[ev.papel]})`
                  : ROTULO_PAPEL[ev.papel]}{' '}
                · {dataHora(ev.em)}
                {valores.length > 0 && ` · ${valores.join(' · ')}`}
              </p>
              {motivo && (
                <p className="text-[13px]">
                  {T.motivo}: {motivo}
                </p>
              )}
              {ev.projecao && <p className="text-[13px]">{textoProjecao(ev.projecao)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
