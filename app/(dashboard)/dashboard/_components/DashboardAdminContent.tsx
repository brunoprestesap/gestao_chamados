'use client';

import {
  AlertTriangle,
  ChevronRight,
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
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const ADMIN_CARD_STATUSES = [
  'aberto',
  'emvalidacao',
  'em atendimento',
  'concluído',
  'encerrado',
] as const;

type Props = {
  data: DashboardAdminData;
};

const cardLinkBase =
  'group block rounded-xl outline-none transition-all duration-200 ease-out ' +
  'hover:-translate-y-1 hover:shadow-lg active:translate-y-0 active:shadow-md ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function DashboardCardLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(cardLinkBase, className)}>
      {children}
    </Link>
  );
}

const cardCommon =
  'relative h-full min-h-[140px] overflow-hidden border-2 transition-[border-color,box-shadow] duration-200 ' +
  'group-hover:border-primary/40';

export function DashboardAdminContent({ data }: Props) {
  return (
    <div className="space-y-4 px-1 sm:space-y-6 sm:px-0">
      <PageHeader
        title="Dashboard"
        subtitle="Visão global do sistema: saúde operacional, gargalos e qualidade"
      />

      <section
        className={cn('grid gap-4 sm:gap-5 sm:grid-cols-2 lg:gap-6 lg:grid-cols-3', 'auto-rows-fr')}
      >
        {/* 1) Chamados no Sistema (Visão Geral por Status) */}
        <DashboardCardLink href="/gestao">
          <Card className={cn(cardCommon)}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-100/70 transition-transform duration-200 group-hover:scale-110 dark:bg-sky-950/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <Ticket className="h-4 w-4 shrink-0" />
                Chamados no Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="relative flex flex-wrap gap-2">
              {ADMIN_CARD_STATUSES.map((status) => (
                <Badge key={status} variant="secondary" className="text-xs">
                  {CHAMADO_STATUS_LABELS[status]}: {data.porStatus[status]}
                </Badge>
              ))}
              {ADMIN_CARD_STATUSES.every((s) => data.porStatus[s] === 0) && (
                <span className="text-sm text-muted-foreground">Sem dados no período</span>
              )}
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 2) Chamados Críticos / Urgentes */}
        <DashboardCardLink href="/gestao">
          <Card
            className={cn(
              cardCommon,
              'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20',
            )}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-red-200/50 transition-transform duration-200 group-hover:scale-110 dark:bg-red-900/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-red-600/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-red-400/70"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                Chamados Críticos / Urgentes
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <p className="text-2xl font-semibold text-red-800 dark:text-red-200 sm:text-xl">
                {data.criticosUrgentes}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Natureza Urgente ou prioridade ALTA/EMERGENCIAL
              </p>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 3) Backlog Inicial */}
        <DashboardCardLink href="/gestao">
          <Card
            className={cn(
              cardCommon,
              'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20',
            )}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-200/50 transition-transform duration-200 group-hover:scale-110 dark:bg-amber-900/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-amber-600/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-amber-400/70"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <ClipboardList className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                Backlog Inicial
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <p className="text-2xl font-semibold text-amber-800 dark:text-amber-200 sm:text-xl">
                {data.backlogInicial}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Aberto e Em validação</p>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 4) Produtividade (Hoje) */}
        <DashboardCardLink href="/gestao">
          <Card className={cn(cardCommon)}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-100/70 transition-transform duration-200 group-hover:scale-110 dark:bg-emerald-950/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <RefreshCw className="h-4 w-4 shrink-0" />
                Produtividade (Hoje)
              </CardTitle>
            </CardHeader>
            <CardContent className="relative space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Abertos hoje</span>
                <span className="font-semibold">{data.abertosHoje}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Encerrados hoje</span>
                <span className="font-semibold">{data.encerradosHoje}</span>
              </div>
              {data.abertosHoje === 0 && data.encerradosHoje === 0 && (
                <p className="text-xs text-muted-foreground">Sem dados no período</p>
              )}
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 5) Capacidade dos Técnicos (Sobrecarga) */}
        <DashboardCardLink href="/gestao">
          <Card className={cn(cardCommon)}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-violet-100/70 transition-transform duration-200 group-hover:scale-110 dark:bg-violet-950/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <Wrench className="h-4 w-4 shrink-0" />
                Capacidade dos Técnicos
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <p className="text-sm font-medium">
                {data.tecnicosSobrecarregados} sobrecarregados
                {data.tecnicosNoLimite > 0 && ` • ${data.tecnicosNoLimite} no limite`}
              </p>
              {data.tecnicosSobrecarregados === 0 && data.tecnicosNoLimite === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Nenhum técnico sobrecarregado</p>
              )}
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 6) Reatribuições Recentes */}
        <DashboardCardLink href="/gestao">
          <Card className={cn(cardCommon)}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-orange-100/70 transition-transform duration-200 group-hover:scale-110 dark:bg-orange-950/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <Loader2 className="h-4 w-4 shrink-0" />
                Reatribuições Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <p className="text-2xl font-semibold sm:text-xl">{data.reatribuicoesHoje}</p>
              <p className="mt-1 text-xs text-muted-foreground">Reatribuições hoje</p>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 7) Avaliação do Atendimento */}
        <DashboardCardLink href="/gestao">
          <Card className={cn(cardCommon)}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-yellow-100/70 transition-transform duration-200 group-hover:scale-110 dark:bg-yellow-950/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <Star className="h-4 w-4 shrink-0" />
                Avaliação do Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent className="relative space-y-2">
              {data.totalAvaliacoes > 0 ? (
                <>
                  <p className="text-2xl font-semibold sm:text-xl">
                    {data.mediaAvaliacao != null ? data.mediaAvaliacao.toFixed(1) : '—'} / 5
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.totalAvaliacoes} avaliações
                    {data.avaliacoesNegativas > 0 &&
                      ` • ${data.avaliacoesNegativas} negativas (≤2)`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda</p>
              )}
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 8) Usuários e Técnicos */}
        <DashboardCardLink href="/usuarios">
          <Card className={cn(cardCommon)}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-slate-100/70 transition-transform duration-200 group-hover:scale-110 dark:bg-slate-950/30" />
            <ChevronRight
              className="absolute right-3 top-3 h-5 w-5 text-muted-foreground/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden
            />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-sm">
                <Users className="h-4 w-4 shrink-0" />
                Usuários e Técnicos
              </CardTitle>
            </CardHeader>
            <CardContent className="relative space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total de usuários</span>
                <span className="font-semibold">{data.totalUsuarios}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Técnicos ativos</span>
                <span className="font-semibold">{data.tecnicosAtivos}</span>
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>
      </section>
    </div>
  );
}
