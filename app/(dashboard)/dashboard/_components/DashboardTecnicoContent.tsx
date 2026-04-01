'use client';

import { CheckCircle2, ChevronRight, ClipboardList, Loader2, Ticket, Wrench } from 'lucide-react';
import Link from 'next/link';

import type { DashboardTecnicoData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';

type Props = {
  data: DashboardTecnicoData;
};

const CHAMADOS_ATRIBUIDOS_HREF = '/chamados-atribuidos';

function StatCard({
  href,
  title,
  value,
  helper,
  icon: Icon,
  iconClassName,
  accentClassName,
  valueClassName,
}: {
  href: string;
  title: string;
  value: string | number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  accentClassName?: string;
  valueClassName?: string;
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
            <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
            <p
              className={cn(
                'mt-2 text-2xl font-bold tabular-nums tracking-tight',
                valueClassName,
              )}
            >
              {value}
            </p>
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/70">{helper}</p>
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

export function DashboardTecnicoContent({ data }: Props) {
  return (
    <div className="w-full max-w-6xl space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Visao geral da sua carga de trabalho e chamados atribuidos"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          href={CHAMADOS_ATRIBUIDOS_HREF}
          title="Minha Carga de Trabalho"
          value={`${data.cargaAtiva} de ${data.maxAssignedTickets}`}
          helper="chamados ativos atribuidos"
          icon={Wrench}
          iconClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
          accentClassName="via-blue-500/60"
        />

        <StatCard
          href={CHAMADOS_ATRIBUIDOS_HREF}
          title="Em Atendimento"
          value={data.emAtendimento}
          helper={
            data.emAtendimento === 0
              ? 'Nenhum chamado em atendimento'
              : data.emAtendimento === 1
                ? '1 chamado em atendimento'
                : `${data.emAtendimento} chamados em atendimento`
          }
          icon={Loader2}
          iconClassName="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
          accentClassName="via-purple-400/50"
        />

        <StatCard
          href={CHAMADOS_ATRIBUIDOS_HREF}
          title="Prontos para Concluir"
          value={data.prontosParaConcluir}
          helper={
            data.prontosParaConcluir === 0
              ? 'Nenhum chamado pronto para registrar execucao'
              : 'status Em atendimento'
          }
          icon={ClipboardList}
          iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
          accentClassName="via-amber-400/50"
        />

        <StatCard
          href={CHAMADOS_ATRIBUIDOS_HREF}
          title="Concluidos (Aguardando)"
          value={data.concluidosAguardandoEncerramento}
          helper={
            data.concluidosAguardandoEncerramento === 0
              ? 'Nenhum aguardando encerramento'
              : 'aguardando encerramento pelo Admin'
          }
          icon={CheckCircle2}
          iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          accentClassName="via-emerald-400/50"
        />
      </section>

      {/* Specialties */}
      <div className="rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="border-b border-border/30 px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">Meus Servicos / Especialidades</h3>
        </div>
        <div className="p-5">
          {data.especialidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma especialidade cadastrada no seu perfil.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.especialidades.map((esp) => (
                <Badge
                  key={esp._id}
                  variant="secondary"
                  className="max-w-full rounded-md text-xs sm:max-w-none"
                >
                  <span className="min-w-0 max-w-[180px] truncate sm:max-w-none">
                    {esp.code} — {esp.name}
                  </span>
                  {esp.chamadosAtivos > 0 && (
                    <span className="ml-1.5 shrink-0 font-bold tabular-nums text-foreground">
                      ({esp.chamadosAtivos} ativo{esp.chamadosAtivos !== 1 ? 's' : ''})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent tickets */}
      <div className="rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
          <h3 className="text-sm font-semibold text-foreground">Ultimos Chamados Atribuidos</h3>
          <Link
            href={CHAMADOS_ATRIBUIDOS_HREF}
            className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todos
            <ChevronRight className="h-4 w-4 shrink-0" />
          </Link>
        </div>
        <div className="p-5">
          {data.ultimosChamados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted/50">
                <Ticket className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum chamado atribuido a voce no momento
              </p>
              <Link
                href={CHAMADOS_ATRIBUIDOS_HREF}
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Chamados Atribuidos
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.ultimosChamados.map((c) => (
                <li key={c._id}>
                  <Link
                    href={`/chamados-atribuidos/${c._id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border/30 p-3.5 transition-all duration-150 hover:border-border/60 hover:bg-muted/30 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {c.ticket_number}
                      </p>
                      <p className="line-clamp-2 text-sm text-muted-foreground sm:line-clamp-none sm:truncate">
                        {c.titulo || 'Sem titulo'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="rounded-md text-xs">
                        {CHAMADO_STATUS_LABELS[c.status as ChamadoStatus] ?? c.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
