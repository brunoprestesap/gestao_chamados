import { AlertTriangle, Clock, TrendingDown, XCircle } from 'lucide-react';

import { KpiCard } from '@/components/dashboard/kpi-card';

interface Props {
  totalBreachedChamados: number;
  totalResponseBreaches: number;
  totalResolutionBreaches: number;
  avgBreachRate: number;
}

export function BreachKpiCards({
  totalBreachedChamados,
  totalResponseBreaches,
  totalResolutionBreaches,
  avgBreachRate,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Chamados com Breach"
        value={totalBreachedChamados}
        helper="Chamados com pelo menos 1 SLA estourado"
        icon={XCircle}
        accentClassName="from-red-400 via-red-500 to-red-400 bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400"
        valueClassName={totalBreachedChamados > 0 ? 'text-red-600 dark:text-red-400' : undefined}
      />
      <KpiCard
        title="Breach de Resposta"
        value={totalResponseBreaches}
        helper="Prazo de resposta estourado"
        icon={Clock}
        accentClassName="from-sky-400 via-sky-500 to-sky-400 bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400"
      />
      <KpiCard
        title="Breach de Resolução"
        value={totalResolutionBreaches}
        helper="Prazo de resolução estourado"
        icon={AlertTriangle}
        accentClassName="from-amber-400 via-amber-500 to-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
      />
      <KpiCard
        title="Taxa Média de Breach"
        value={`${avgBreachRate}%`}
        helper="Breaches / total com SLA"
        icon={TrendingDown}
        accentClassName="from-violet-400 via-violet-500 to-violet-400 bg-violet-50 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400"
      />
    </div>
  );
}
