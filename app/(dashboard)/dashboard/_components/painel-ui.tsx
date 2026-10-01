'use client';

import { motion, MotionConfig } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { cn } from '@/lib/utils';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';

/**
 * Peças visuais do Painel de Gestão (`/dashboard`), compartilhadas pelos
 * quatro perfis. Regra de cor: tons de alerta (warning/danger) só acendem
 * quando há algo a fazer; com zero, a métrica fica neutra.
 */

export type Tone = 'neutral' | 'primary' | 'info' | 'warning' | 'danger' | 'success';

const TONE: Record<Tone, { chip: string; value: string; bar: string; dot: string }> = {
  neutral: {
    chip: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
    bar: 'bg-slate-400 dark:bg-slate-500',
    dot: 'bg-slate-400 dark:bg-slate-500',
  },
  primary: {
    chip: 'bg-primary/10 text-primary',
    value: 'text-foreground',
    bar: 'bg-primary',
    dot: 'bg-primary',
  },
  info: {
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    value: 'text-foreground',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
  },
  warning: {
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    value: 'text-amber-800 dark:text-amber-300',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
  },
  danger: {
    chip: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    value: 'text-red-700 dark:text-red-300',
    bar: 'bg-red-500',
    dot: 'bg-red-500',
  },
  success: {
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    value: 'text-foreground',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
  },
};

export function toneClasses(tone: Tone) {
  return TONE[tone];
}

/** Tom de alerta só quando o valor é maior que zero. */
export function alertTone(value: number, tone: Tone): Tone {
  return value > 0 ? tone : 'neutral';
}

export function formatNumber(value: number) {
  return value.toLocaleString('pt-BR');
}

export function plural(n: number, singular: string, pluralForm: string) {
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm}`;
}

/* ── Status do chamado ──────────────────────────────────────────── */

const STATUS_TONE: Record<ChamadoStatus, Tone> = {
  aberto: 'warning',
  validado: 'info',
  'em atendimento': 'primary',
  aguardando_solicitante: 'warning',
  aguardando_terceiros: 'warning',
  concluído: 'success',
  encerrado: 'neutral',
  cancelado: 'neutral',
  recusado: 'danger',
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status as ChamadoStatus] ?? 'neutral';
}

export function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-xs font-medium text-foreground">
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', TONE[tone].dot)} />
      {CHAMADO_STATUS_LABELS[status as ChamadoStatus] ?? status}
    </span>
  );
}

/* ── Estrutura ──────────────────────────────────────────────────── */

/** Raiz do painel: respeita "reduzir movimento" do sistema. */
export function PainelRoot({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 sm:space-y-8">{children}</div>
    </MotionConfig>
  );
}

/** Data de hoje por extenso, no fuso institucional. */
export function TodayLabel() {
  const timeZone = useInstitutionalTimezone();
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(new Date());
  return (
    <p
      className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
      suppressHydrationWarning
    >
      {label}
    </p>
  );
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex h-full flex-col rounded-2xl border border-border/50 bg-card shadow-sm',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight text-foreground">{title}</h2>
            {description ? (
              <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="flex-1 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/* ── Métrica ────────────────────────────────────────────────────── */

export function StatTile({
  href,
  label,
  value,
  helper,
  icon: Icon,
  tone = 'neutral',
  footer,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  footer?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg hover:shadow-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-105',
            t.chip,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          aria-hidden
        />
      </div>
      {/* O rótulo ocupa a largura toda do cartão, abaixo do ícone: ao lado dele,
          nos cartões estreitos do desktop, "Aguardando avaliação" virava reticências. */}
      <p className="mt-3 text-[13px] leading-snug font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-3xl font-bold tracking-tight tabular-nums', t.value)}>{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
    </Link>
  );
}

/* ── Barras ─────────────────────────────────────────────────────── */

function AnimatedBar({ pct, className }: { pct: number; className: string }) {
  return (
    <motion.div
      className={cn('h-full', className)}
      initial={{ width: 0 }}
      animate={{ width: `${pct}%` }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

export type Segment = { key: string; label: string; value: number; tone: Tone; href?: string };

/**
 * Barra empilhada + legenda com valores. A legenda é o dado acessível; a
 * barra é só reforço visual (aria-hidden).
 */
export function StackedBar({
  segments,
  emptyLabel = 'Nenhum registro',
  size = 'md',
}: {
  segments: Segment[];
  emptyLabel?: string;
  size?: 'sm' | 'md';
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  return (
    <div>
      <div
        aria-hidden
        className={cn(
          'flex w-full gap-0.5 overflow-hidden rounded-full bg-muted',
          size === 'md' ? 'h-3' : 'h-2',
        )}
      >
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <AnimatedBar
                  key={s.key}
                  pct={(s.value / total) * 100}
                  className={TONE[s.tone].bar}
                />
              ))
          : null}
      </div>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul
          className={cn(
            'mt-4 grid gap-2',
            segments.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
          )}
        >
          {segments.map((s) => {
            const content = (
              <>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className={cn('h-2 w-2 rounded-full', TONE[s.tone].dot)} />
                  {s.label}
                </span>
                <span className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums text-foreground">
                    {formatNumber(s.value)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {Math.round((s.value / total) * 100)}%
                  </span>
                </span>
              </>
            );
            return (
              <li key={s.key}>
                {s.href ? (
                  <Link
                    href={s.href}
                    className="flex flex-col rounded-lg p-2 -m-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex flex-col">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Ocupação contra um limite, com marca de 80% (onde começa "no limite"). */
export function CapacityMeter({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const safeMax = Math.max(max, 1);
  const pct = Math.min((value / safeMax) * 100, 100);
  const tone: Tone =
    value >= safeMax ? 'danger' : value >= Math.ceil(safeMax * 0.8) ? 'warning' : 'primary';
  return (
    <div className={className}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={value}
        aria-label={`Ocupação: ${value} de ${max}`}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <AnimatedBar pct={pct} className={cn('rounded-full', TONE[tone].bar)} />
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-foreground/25"
          style={{ left: '80%' }}
        />
      </div>
    </div>
  );
}

export function capacityState(value: number, max: number): { label: string; tone: Tone } {
  const safeMax = Math.max(max, 1);
  if (value >= safeMax) return { label: 'Capacidade esgotada', tone: 'danger' };
  if (value >= Math.ceil(safeMax * 0.8)) return { label: 'Perto do limite', tone: 'warning' };
  if (value === 0) return { label: 'Livre para novos chamados', tone: 'success' };
  return { label: 'Com folga', tone: 'success' };
}

/** Ranking em barras horizontais (ex.: atendimentos por técnico). */
export function RankBars({
  items,
  emptyLabel,
}: {
  items: Array<{ id: string; label: string; value: number }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3"
        >
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
            <div aria-hidden className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <AnimatedBar
                pct={(item.value / max) * 100}
                className={cn('rounded-full', index === 0 ? 'bg-primary' : 'bg-primary/55')}
              />
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatNumber(item.value)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ── Fila de atenção ────────────────────────────────────────────── */

export type AttentionItem = {
  key: string;
  count: number;
  title: string;
  description: string;
  href: string;
  tone: Tone;
};

/** Lista do que pede ação agora. Itens com zero somem; vazio vira "tudo em dia". */
export function AttentionList({
  items,
  emptyTitle = 'Tudo em dia',
  emptyDescription = 'Nada pede sua ação neste momento.',
}: {
  items: AttentionItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const visible = items.filter((i) => i.count > 0);
  if (visible.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300/60 bg-emerald-50/50 px-4 py-8 text-center dark:border-emerald-800/50 dark:bg-emerald-950/20">
        <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-foreground">{emptyTitle}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {visible.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="group flex min-h-14 items-center gap-3 rounded-xl border border-border/50 bg-background/60 p-3 transition-colors hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                'grid h-10 min-w-10 shrink-0 place-items-center rounded-lg px-2 text-base font-bold tabular-nums',
                TONE[item.tone].chip,
              )}
            >
              {formatNumber(item.count)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ── Lista de chamados ──────────────────────────────────────────── */

export function TicketRows({
  tickets,
  hrefBase,
  meta,
}: {
  tickets: Array<{ _id: string; ticket_number: string; titulo: string; status: string }>;
  hrefBase: string;
  meta?: (id: string) => React.ReactNode;
}) {
  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
      {tickets.map((c) => (
        <li key={c._id}>
          <Link
            href={`${hrefBase}/${c._id}`}
            className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
          >
            <span
              aria-hidden
              className={cn('h-2 w-2 shrink-0 rounded-full', TONE[statusTone(c.status)].dot)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                {c.titulo || 'Sem título'}
              </span>
              <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                {c.ticket_number}
                {meta ? <span className="font-sans"> · {meta(c._id)}</span> : null}
              </span>
            </span>
            <span className="hidden shrink-0 sm:block">
              <StatusPill status={c.status} />
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
