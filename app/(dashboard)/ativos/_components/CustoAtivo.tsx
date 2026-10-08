import Link from 'next/link';

import type { CustoDaFichaComLinks } from '@/lib/ativos/ficha';
import { formatDate } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';

/**
 * O bloco "Custo de manutenção" da ficha (spec 0018, AC-11). Só chega para
 * Admin e Preposto; `null` é falha da leitura (AC-19).
 */
export function CustoAtivo({ custo }: { custo: CustoDaFichaComLinks | null }) {
  if (!custo) {
    return (
      <p className="text-sm text-muted-foreground">Não foi possível calcular o custo agora.</p>
    );
  }
  if (custo.totalGeralCentavos === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum custo registrado para este ativo.</p>
    );
  }
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 sm:grid-cols-4">
        {[
          ['Corretivo em 12 meses', custo.doze.corretivoCentavos],
          ['Preventiva em 12 meses', custo.doze.preventivaCentavos],
          ['Total em 12 meses', custo.doze.totalCentavos],
          ['Total desde sempre', custo.totalGeralCentavos],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{rotulo}</dt>
            <dd className="text-base font-semibold text-foreground">
              {formatarReais(Number(valor))}
            </dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Chamados com custo</caption>
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Chamado
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Aberto em
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Tipo
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Cotações
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Material
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {custo.chamados.map((c) => (
              <tr key={c.id} className="border-b border-border/40 last:border-0">
                <td className="py-2 pr-3">
                  {c.href ? (
                    <Link href={c.href} className="font-medium text-primary hover:underline">
                      {c.numero}
                    </Link>
                  ) : (
                    c.numero
                  )}
                </td>
                <td className="py-2 pr-3">{formatDate(c.abertoEm)}</td>
                <td className="py-2 pr-3">{c.preventiva ? 'Preventiva' : 'Corretivo'}</td>
                <td className="py-2 pr-3 text-right">{formatarReais(c.cotacoesCentavos)}</td>
                <td className="py-2 pr-3 text-right">{formatarReais(c.materialCentavos)}</td>
                <td className="py-2 text-right font-medium">{formatarReais(c.totalCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
