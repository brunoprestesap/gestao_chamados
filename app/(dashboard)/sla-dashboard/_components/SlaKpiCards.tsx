import { AlertTriangle, CheckCircle2, Timer, XCircle } from 'lucide-react';

import { KpiCard } from '@/components/dashboard/kpi-card';

interface SlaSummary {
  total: number;
  noPrazo: number;
  proximoVencimento: number;
  atrasado: number;
}

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}% do total`;
}

export function SlaKpiCards({ summary }: { summary: SlaSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Total Ativos"
        value={summary.total}
        helper="Chamados com SLA ativo"
        icon={Timer}
        accentClassName="from-sky-400 via-sky-500 to-sky-400 bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400"
      />
      <KpiCard
        title="No Prazo"
        value={summary.noPrazo}
        helper={pct(summary.noPrazo, summary.total)}
        icon={CheckCircle2}
        accentClassName="from-emerald-400 via-emerald-500 to-emerald-400 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
      />
      <KpiCard
        title="Próximo do Vencimento"
        value={summary.proximoVencimento}
        helper={pct(summary.proximoVencimento, summary.total)}
        icon={AlertTriangle}
        accentClassName="from-amber-400 via-amber-500 to-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
      />
      <KpiCard
        title="Atrasados"
        value={summary.atrasado}
        helper={pct(summary.atrasado, summary.total)}
        icon={XCircle}
        accentClassName="from-red-400 via-red-500 to-red-400 bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400"
        valueClassName={summary.atrasado > 0 ? 'text-red-600 dark:text-red-400' : undefined}
      />
    </div>
  );
}
