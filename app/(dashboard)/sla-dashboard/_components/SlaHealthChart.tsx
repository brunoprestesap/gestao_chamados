'use client';

import { cn } from '@/lib/utils';

interface Props {
  noPrazo: number;
  proximoVencimento: number;
  atrasado: number;
}

const SIZE = 160;
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Segment {
  label: string;
  value: number;
  color: string;
  dotClass: string;
}

export function SlaHealthChart({ noPrazo, proximoVencimento, atrasado }: Props) {
  const total = noPrazo + proximoVencimento + atrasado;
  const healthPct = total > 0 ? Math.round((noPrazo / total) * 100) : 100;

  const segments: Segment[] = [
    {
      label: 'No prazo',
      value: noPrazo,
      color: 'stroke-emerald-500',
      dotClass: 'bg-emerald-500',
    },
    {
      label: 'Risco',
      value: proximoVencimento,
      color: 'stroke-amber-500',
      dotClass: 'bg-amber-500',
    },
    {
      label: 'Atrasado',
      value: atrasado,
      color: 'stroke-red-500',
      dotClass: 'bg-red-500',
    },
  ];

  // Calcula offsets acumulados para cada segmento
  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0;
    const dashLength = pct * CIRCUMFERENCE;
    const offset = CIRCUMFERENCE - accumulated;
    accumulated += dashLength;
    return { ...seg, dashLength, offset, pct };
  });

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />

      <p className="mb-4 text-[13px] font-medium text-muted-foreground">Saúde Geral do SLA</p>

      <div className="flex flex-col items-center gap-4">
        {/* Donut SVG */}
        <div className="relative">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="-rotate-90"
            role="img"
            aria-label={`Saúde do SLA: ${healthPct}% no prazo, ${proximoVencimento} em risco, ${atrasado} atrasados`}
          >
            {/* Background track */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-muted/30"
            />
            {/* Segments */}
            {arcs.map(
              (arc) =>
                arc.dashLength > 0 && (
                  <circle
                    key={arc.label}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    strokeWidth={STROKE}
                    strokeDasharray={`${arc.dashLength} ${CIRCUMFERENCE - arc.dashLength}`}
                    strokeDashoffset={arc.offset}
                    strokeLinecap="butt"
                    className={cn(arc.color, 'transition-all duration-500')}
                  />
                ),
            )}
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums tracking-tight">{healthPct}%</span>
            <span className="text-[11px] text-muted-foreground">saudável</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', seg.dotClass)} />
              <span className="text-xs text-muted-foreground">
                {seg.label}{' '}
                <span className="font-semibold tabular-nums text-foreground">{seg.value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
