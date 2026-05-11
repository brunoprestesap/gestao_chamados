'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Users,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';

import type { DashboardPrepostoData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Props = {
  data: DashboardPrepostoData;
};

function MetricCard({
  href,
  title,
  value,
  helper,
  icon: Icon,
  iconClassName,
  accentClassName,
  valueClassName,
  alertIcon: AlertIcon,
}: {
  href: string;
  title: string;
  value: string | number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  accentClassName?: string;
  valueClassName?: string;
  alertIcon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5"
    >
      <div className="relative overflow-hidden p-5">
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-100',
            accentClassName ?? 'via-primary/40',
          )}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
              {AlertIcon && <AlertIcon className="h-3.5 w-3.5" />}
              {title}
            </p>
            <p
              className={cn(
                'mt-2 text-2xl font-bold tabular-nums tracking-tight',
                valueClassName,
              )}
            >
              {value}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground/70">{helper}</p>
          </div>
          <div
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105',
              iconClassName ?? 'bg-muted/50 text-muted-foreground',
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function DashboardPrepostoContent({ data }: Props) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Visao operacional e pontos de acao para gestao de chamados"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          href="/gestao"
          title="Aguardando Classificacao"
          value={data.aguardandoClassificacao}
          helper={
            data.aguardandoClassificacao === 1
              ? '1 chamado aguarda classificacao'
              : `${data.aguardandoClassificacao} chamados aguardam classificacao`
          }
          icon={AlertTriangle}
          iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
          accentClassName="via-amber-400/60"
          valueClassName="text-amber-700 dark:text-amber-300"
          alertIcon={({ className }) => (
            <AlertTriangle className={cn(className, 'text-amber-500')} />
          )}
        />

        <MetricCard
          href="/gestao"
          title="Aguardando Atribuicao"
          value={data.aguardandoAtribuicao}
          helper={
            data.aguardandoAtribuicao === 1
              ? '1 chamado aguarda atribuicao'
              : `${data.aguardandoAtribuicao} chamados aguardam atribuicao`
          }
          icon={ClipboardCheck}
          iconClassName="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
          accentClassName="via-sky-400/50"
        />

        <MetricCard
          href="/gestao"
          title="Em Atendimento"
          value={data.emAtendimento}
          helper={
            data.emAtendimento === 1
              ? '1 chamado em atendimento'
              : `${data.emAtendimento} chamados em atendimento`
          }
          icon={Loader2}
          iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400"
          accentClassName="via-violet-400/50"
        />

        <MetricCard
          href="/gestao"
          title="Aguardando Encerramento"
          value={data.aguardandoEncerramento}
          helper={
            data.aguardandoEncerramento === 1
              ? '1 chamado aguarda encerramento'
              : `${data.aguardandoEncerramento} chamados aguardam encerramento`
          }
          icon={CheckCircle2}
          iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          accentClassName="via-emerald-400/60"
          valueClassName="text-emerald-700 dark:text-emerald-300"
          alertIcon={({ className }) => (
            <CheckCircle2 className={cn(className, 'text-emerald-500')} />
          )}
        />

        <MetricCard
          href="/gestao"
          title="Encerrados (hoje / semana)"
          value={data.encerradosHoje}
          helper={
            (data.encerradosHoje === 1
              ? '1 chamado encerrado hoje'
              : `${data.encerradosHoje} chamados encerrados hoje`) +
            (data.encerradosSemana > 0 ? ` · ${data.encerradosSemana} esta semana` : '')
          }
          icon={CheckCircle2}
          iconClassName="bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400"
          accentClassName="via-teal-400/50"
        />

        <MetricCard
          href="/gestao"
          title="Sobrecarga de Tecnicos"
          value={data.sobrecargaTecnicos}
          helper={
            data.sobrecargaTecnicos === 1
              ? '1 tecnico sobrecarregado'
              : `${data.sobrecargaTecnicos} tecnicos sobrecarregados`
          }
          icon={Users}
          iconClassName={
            data.sobrecargaTecnicos > 0
              ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
              : 'bg-muted/50 text-muted-foreground'
          }
          accentClassName={data.sobrecargaTecnicos > 0 ? 'via-red-400/60' : 'via-muted-foreground/20'}
          valueClassName={data.sobrecargaTecnicos > 0 ? 'text-red-700 dark:text-red-300' : undefined}
          alertIcon={
            data.sobrecargaTecnicos > 0
              ? ({ className }) => <AlertCircle className={cn(className, 'text-red-500')} />
              : undefined
          }
        />

        <MetricCard
          href="/gestao"
          title="Reatribuicoes Recentes"
          value={data.reatribuicoesHoje}
          helper={
            (data.reatribuicoesHoje === 1
              ? '1 chamado reatribuido hoje'
              : `${data.reatribuicoesHoje} chamados reatribuidos hoje`) +
            (data.reatribuicoesSemana > 0 ? ` · ${data.reatribuicoesSemana} esta semana` : '')
          }
          icon={RefreshCw}
          iconClassName="bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
          accentClassName="via-orange-400/50"
        />
      </section>

      {/* Bottom two-column section */}
      <section className="grid gap-5 md:grid-cols-2">
        {/* Atendimentos por tecnico */}
        <div className="flex flex-col rounded-2xl border border-border/50 bg-card shadow-sm">
          <div className="border-b border-border/30 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Atendimentos por tecnico
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Chamados concluidos ou encerrados
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 p-5">
            {data.atendimentosPorTecnico.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum tecnico ativo ou nenhum atendimento concluido/encerrado.
              </p>
            ) : (
              <ul className="space-y-2">
                {[...data.atendimentosPorTecnico]
                  .sort((a, b) => b.total - a.total)
                  .map((item) => (
                    <li
                      key={item.tecnicoId}
                      className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 px-3.5 py-2.5"
                    >
                      <span className="text-sm font-medium">{item.nome}</span>
                      <Badge variant="secondary" className="shrink-0 rounded-md font-bold">
                        {item.total}
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
            <Link
              href="/gestao"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ir para Gestao
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Resumo Geral */}
        <div className="flex flex-col rounded-2xl border border-border/50 bg-card shadow-sm">
          <div className="border-b border-border/30 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <Wrench className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Resumo Geral</h3>
            </div>
          </div>
          <div className="flex-1 p-5">
            <div className="flex flex-wrap gap-2.5">
              {[
                { label: 'Em Atendimento', key: 'em atendimento' as const },
                { label: 'Concluido', key: 'concluído' as const },
                { label: 'Encerrado', key: 'encerrado' as const },
              ].map(({ label, key }) => (
                <Badge
                  key={key}
                  variant="secondary"
                  className="gap-2 rounded-md px-3 py-1.5 text-sm"
                >
                  {label}
                  <span className="font-bold tabular-nums">{data.resumoGeral[key]}</span>
                </Badge>
              ))}
            </div>
            <Link
              href="/gestao"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ir para Gestao
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
