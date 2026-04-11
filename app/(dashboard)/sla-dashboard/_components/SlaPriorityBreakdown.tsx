interface PriorityBreakdown {
  priority: string;
  total: number;
  noPrazo: number;
  proximoVencimento: number;
  atrasado: number;
}

const PRIORITY_ORDER = ['EMERGENCIAL', 'ALTA', 'NORMAL', 'BAIXA'];

export function SlaPriorityBreakdown({ data }: { data: PriorityBreakdown[] }) {
  const sorted = [...data].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
  );

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />

      <p className="mb-4 text-[13px] font-medium text-muted-foreground">Por Prioridade</p>

      <div className="space-y-3">
        {sorted.map((p) => {
          const okPct = p.total > 0 ? Math.round((p.noPrazo / p.total) * 100) : 100;
          const riskPct = p.total > 0 ? Math.round((p.proximoVencimento / p.total) * 100) : 0;
          const badPct = Math.max(0, 100 - okPct - riskPct);

          return (
            <div key={p.priority} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.priority}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {p.noPrazo}/{p.total} OK
                  {p.proximoVencimento > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' '}· {p.proximoVencimento} risco
                    </span>
                  )}
                  {p.atrasado > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      {' '}· {p.atrasado} atrasado
                    </span>
                  )}
                </span>
              </div>
              {/* Mini stacked bar */}
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
                {okPct > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${okPct}%` }}
                  />
                )}
                {riskPct > 0 && (
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${riskPct}%` }}
                  />
                )}
                {p.atrasado > 0 && badPct > 0 && (
                  <div
                    className="h-full bg-red-500 transition-all duration-500"
                    style={{ width: `${badPct}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum chamado com SLA ativo
          </p>
        )}
      </div>
    </div>
  );
}
