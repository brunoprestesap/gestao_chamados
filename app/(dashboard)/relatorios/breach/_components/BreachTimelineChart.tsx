'use client';

import type { BreachTimeline } from '@/lib/sla-breach-report';

const CHART_HEIGHT = 160;
const CHART_WIDTH = 600;
const PADDING = { top: 16, right: 16, bottom: 32, left: 40 };

export function BreachTimelineChart({ data }: { data: BreachTimeline[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum dado de timeline no período.
      </p>
    );
  }

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.responseBreaches, d.resolutionBreaches)),
    1,
  );

  const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW / 2;

  function toPath(values: number[]): string {
    return values
      .map((v, i) => {
        const x = PADDING.left + (data.length > 1 ? i * xStep : innerW / 2);
        const y = PADDING.top + innerH - (v / maxVal) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }

  function toArea(values: number[]): string {
    const line = toPath(values);
    const lastX = PADDING.left + (data.length > 1 ? (values.length - 1) * xStep : innerW / 2);
    const firstX = PADDING.left + (data.length > 1 ? 0 : innerW / 2);
    const baseline = PADDING.top + innerH;
    return `${line} L${lastX},${baseline} L${firstX},${baseline} Z`;
  }

  const responsePath = toPath(data.map((d) => d.responseBreaches));
  const resolutionPath = toPath(data.map((d) => d.resolutionBreaches));
  const responseArea = toArea(data.map((d) => d.responseBreaches));
  const resolutionArea = toArea(data.map((d) => d.resolutionBreaches));

  // Tendência: compara último mês com penúltimo
  const trend = data.length >= 2 ? data[data.length - 1].total - data[data.length - 2].total : 0;
  const trendLabel = trend > 0 ? 'Piorando' : trend < 0 ? 'Melhorando' : 'Estável';
  const trendColor =
    trend > 0
      ? 'text-red-600 dark:text-red-400'
      : trend < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">Evolução mensal</p>
        {data.length >= 2 && (
          <span className={`text-xs font-medium ${trendColor}`}>Tendência: {trendLabel}</span>
        )}
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = PADDING.top + innerH - pct * innerH;
          return (
            <g key={pct}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + innerW}
                y2={y}
                className="stroke-border/30"
                strokeDasharray="4 4"
              />
              <text
                x={PADDING.left - 6}
                y={y + 1}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {Math.round(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {/* Areas */}
        <path d={responseArea} className="fill-sky-500/15" />
        <path d={resolutionArea} className="fill-red-500/15" />

        {/* Lines */}
        <path d={responsePath} fill="none" strokeWidth={2} className="stroke-sky-500" />
        <path d={resolutionPath} fill="none" strokeWidth={2} className="stroke-red-500" />

        {/* Dots + X labels */}
        {data.map((d, i) => {
          const x = PADDING.left + (data.length > 1 ? i * xStep : innerW / 2);
          const yResp = PADDING.top + innerH - (d.responseBreaches / maxVal) * innerH;
          const yResol = PADDING.top + innerH - (d.resolutionBreaches / maxVal) * innerH;
          return (
            <g key={d.month}>
              <circle cx={x} cy={yResp} r={3} className="fill-sky-500" />
              <circle cx={x} cy={yResol} r={3} className="fill-red-500" />
              <text
                x={x}
                y={PADDING.top + innerH + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          Resposta
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          Resolução
        </div>
      </div>
    </div>
  );
}
