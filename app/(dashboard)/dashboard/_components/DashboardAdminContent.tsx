'use client';

import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Star,
  Ticket,
  Users,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';

import type { DashboardAdminData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';

const ADMIN_CARD_STATUSES = [
  'aberto',
  'em atendimento',
  'concluído',
  'encerrado',
] as const;

type Props = {
  data: DashboardAdminData;
};

function MetricCard({
  href,
  title,
  icon: Icon,
  iconClassName,
  accentClassName,
  children,
}: {
  href: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  accentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5"
    >
      <div className="relative overflow-hidden p-5">
        {/* Top accent line */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-100',
            accentClassName ?? 'via-primary/40',
          )}
        />

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105',
                iconClassName ?? 'bg-muted/60 text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>

        {children}
      </div>
    </Link>
  );
}

export function DashboardAdminContent({ data }: Props) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Visao global do sistema: saude operacional, gargalos e qualidade"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
        {/* 1) Chamados no Sistema */}
        <MetricCard
          href="/gestao"
          title="Chamados no Sistema"
          icon={Ticket}
          iconClassName="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
          accentClassName="via-sky-400/50"
        >
          <div className="flex flex-wrap gap-1.5">
            {ADMIN_CARD_STATUSES.map((status) => (
              <Badge
                key={status}
                variant="secondary"
                className="rounded-md text-xs font-medium"
              >
                {CHAMADO_STATUS_LABELS[status]}{' '}
                <span className="ml-1 font-bold tabular-nums">{data.porStatus[status]}</span>
              </Badge>
            ))}
            {ADMIN_CARD_STATUSES.every((s) => data.porStatus[s] === 0) && (
              <span className="text-sm text-muted-foreground">Sem dados no periodo</span>
            )}
          </div>
        </MetricCard>

        {/* 2) Chamados Criticos / Urgentes */}
        <MetricCard
          href="/gestao"
          title="Criticos / Urgentes"
          icon={AlertTriangle}
          iconClassName="bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
          accentClassName="via-red-400/60"
        >
          <p className="text-3xl font-bold tabular-nums text-red-700 dark:text-red-300">
            {data.criticosUrgentes}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Natureza Urgente ou prioridade ALTA/EMERGENCIAL
          </p>
        </MetricCard>

        {/* 3) Backlog Inicial */}
        <MetricCard
          href="/gestao"
          title="Backlog Inicial"
          icon={ClipboardList}
          iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
          accentClassName="via-amber-400/60"
        >
          <p className="text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {data.backlogInicial}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Aberto e Em validacao</p>
        </MetricCard>

        {/* 4) Produtividade (Hoje) */}
        <MetricCard
          href="/gestao"
          title="Produtividade (Hoje)"
          icon={RefreshCw}
          iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          accentClassName="via-emerald-400/50"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Abertos</span>
              <span className="font-bold tabular-nums">{data.abertosHoje}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Encerrados</span>
              <span className="font-bold tabular-nums">{data.encerradosHoje}</span>
            </div>
          </div>
        </MetricCard>

        {/* 5) Capacidade dos Tecnicos */}
        <MetricCard
          href="/gestao"
          title="Capacidade dos Tecnicos"
          icon={Wrench}
          iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400"
          accentClassName="via-violet-400/50"
        >
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">
              {data.tecnicosSobrecarregados}{' '}
              <span className="font-normal text-muted-foreground">sobrecarregados</span>
            </p>
            {data.tecnicosNoLimite > 0 && (
              <p className="text-sm">
                {data.tecnicosNoLimite}{' '}
                <span className="text-muted-foreground">no limite</span>
              </p>
            )}
            {data.tecnicosSobrecarregados === 0 && data.tecnicosNoLimite === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum tecnico sobrecarregado</p>
            )}
          </div>
        </MetricCard>

        {/* 6) Reatribuicoes Recentes */}
        <MetricCard
          href="/gestao"
          title="Reatribuicoes Recentes"
          icon={Loader2}
          iconClassName="bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
          accentClassName="via-orange-400/50"
        >
          <p className="text-3xl font-bold tabular-nums">{data.reatribuicoesHoje}</p>
          <p className="mt-1 text-xs text-muted-foreground">Reatribuicoes hoje</p>
        </MetricCard>

        {/* 7) Avaliacao do Atendimento */}
        <MetricCard
          href="/gestao"
          title="Avaliacao do Atendimento"
          icon={Star}
          iconClassName="bg-yellow-50 text-yellow-600 dark:bg-yellow-950/50 dark:text-yellow-400"
          accentClassName="via-yellow-400/50"
        >
          {data.totalAvaliacoes > 0 ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums">
                  {data.mediaAvaliacao != null ? data.mediaAvaliacao.toFixed(1) : '—'}
                </span>
                <span className="text-sm text-muted-foreground">/ 5</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.totalAvaliacoes} avaliacoes
                {data.avaliacoesNegativas > 0 &&
                  ` · ${data.avaliacoesNegativas} negativas`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma avaliacao ainda</p>
          )}
        </MetricCard>

        {/* 8) Usuarios e Tecnicos */}
        <MetricCard
          href="/usuarios"
          title="Usuarios e Tecnicos"
          icon={Users}
          iconClassName="bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"
          accentClassName="via-slate-400/40"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total de usuarios</span>
              <span className="font-bold tabular-nums">{data.totalUsuarios}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tecnicos ativos</span>
              <span className="font-bold tabular-nums">{data.tecnicosAtivos}</span>
            </div>
          </div>
        </MetricCard>
      </section>
    </div>
  );
}
