'use client';

import type { BreachByPriority, BreachByTipoServico } from '@/lib/sla-breach-report';

const BAR_HEIGHT = 28;
const LABEL_WIDTH = 120;
const GAP = 8;

export function BreachByPriorityChart({
  data,
  label,
}: {
  data: (BreachByPriority | BreachByTipoServico)[];
  label: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Nenhum dado no período.</p>
    );
  }

  const maxStacked = Math.max(
    ...data.map((d) => d.responseBreaches + d.resolutionBreaches),
    1,
  );
  const svgHeight = data.length * (BAR_HEIGHT + GAP) + GAP;
  const chartWidth = 320;
  const totalWidth = LABEL_WIDTH + chartWidth + 60;

  return (
    <div className="space-y-3">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>

      <svg
        viewBox={`0 0 ${totalWidth} ${svgHeight}`}
        className="w-full"
        style={{ maxHeight: svgHeight }}
      >
        {data.map((d, i) => {
          const y = GAP + i * (BAR_HEIGHT + GAP);
          const respWidth = (d.responseBreaches / maxStacked) * chartWidth;
          const resolWidth = (d.resolutionBreaches / maxStacked) * chartWidth;

          return (
            <g key={'priority' in d ? d.priority : d.tipoServico}>
              {/* Label */}
              <text
                x={LABEL_WIDTH - 8}
                y={y + BAR_HEIGHT / 2 + 1}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-foreground text-[12px] font-medium"
              >
                {'priority' in d ? d.priority : d.tipoServico}
              </text>
              {/* Background track */}
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={chartWidth}
                height={BAR_HEIGHT}
                rx={4}
                className="fill-muted/30"
              />
              {/* Response bar */}
              {respWidth > 0 && (
                <rect
                  x={LABEL_WIDTH}
                  y={y}
                  width={respWidth}
                  height={BAR_HEIGHT}
                  rx={4}
                  className="fill-sky-500"
                />
              )}
              {/* Resolution bar (stacked) */}
              {resolWidth > 0 && (
                <rect
                  x={LABEL_WIDTH + respWidth}
                  y={y}
                  width={resolWidth}
                  height={BAR_HEIGHT}
                  rx={resolWidth > 0 && respWidth === 0 ? 4 : 0}
                  className="fill-red-500"
                />
              )}
              {/* Total count */}
              <text
                x={LABEL_WIDTH + chartWidth + 8}
                y={y + BAR_HEIGHT / 2 + 1}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {d.total}
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
