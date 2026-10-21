import { Landmark } from 'lucide-react';

import type { EmpenhoDoDetalheDTO } from '@/lib/material/serializar';
import { TEXTO_EMPENHO_DETALHE as T } from '@/shared/material/mensagens';

import { BarraSaldoEmpenho } from '../compartilhado/BarraSaldoEmpenho';

/**
 * O bloco Empenho do detalhe, só do lado TRF1 (spec 0021, AC-8). A conta de
 * cada barra vem do servidor conforme a situação; sem barra, uma frase, nunca
 * um zero.
 */
export function BlocoEmpenho({ empenho }: { empenho: EmpenhoDoDetalheDTO }) {
  return (
    <section
      aria-labelledby="empenho-titulo"
      className="space-y-4 rounded-2xl border border-border/50 bg-card p-5"
    >
      <h2 id="empenho-titulo" className="flex items-center gap-2 text-base font-semibold">
        <Landmark className="size-4 text-muted-foreground" aria-hidden="true" />
        {T.titulo}
      </h2>
      {empenho.barras.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {empenho.modo === 'da_cotacao' ? T.semEmpenhoDaCotacao : T.semElegivel}
        </p>
      ) : (
        <ul className="space-y-5">
          {empenho.barras.map((b) => (
            <li key={b.empenhoId}>
              <BarraSaldoEmpenho barra={b} />
            </li>
          ))}
        </ul>
      )}
      {empenho.podemAprovar && (
        <p className="text-[13px] text-muted-foreground">
          {empenho.podemAprovar.length
            ? T.podemAprovar(empenho.podemAprovar.join(', '))
            : T.ninguemAprova}
        </p>
      )}
    </section>
  );
}
