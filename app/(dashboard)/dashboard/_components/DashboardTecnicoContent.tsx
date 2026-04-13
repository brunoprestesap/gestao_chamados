'use client';

import { CheckCircle2, ChevronRight, ClipboardList, Loader2, Ticket, Wrench } from 'lucide-react';
import Link from 'next/link';

import type { DashboardTecnicoData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      className="group relative block overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/4"
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-100',
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
    </Link>
  );
}

export function DashboardTecnicoContent({ data }: Props) {
  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da sua carga de trabalho e chamados atribuídos"
      />

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            href={CHAMADOS_ATRIBUIDOS_HREF}
            title="Minha Carga de Trabalho"
            value={`${data.cargaAtiva} de ${data.maxAssignedTickets}`}
            helper="chamados ativos atribuídos"
            icon={Wrench}
            iconClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
            accentClassName="via-blue-500/60"
          />
        </StaggerItem>

        <StaggerItem>
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
        </StaggerItem>

        <StaggerItem>
          <StatCard
            href={CHAMADOS_ATRIBUIDOS_HREF}
            title="Prontos para Concluir"
            value={data.prontosParaConcluir}
            helper={
              data.prontosParaConcluir === 0
                ? 'Nenhum chamado pronto para registrar execução'
                : 'status Em atendimento'
            }
            icon={ClipboardList}
            iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
            accentClassName="via-amber-400/50"
          />
        </StaggerItem>

        <StaggerItem>
          <StatCard
            href={CHAMADOS_ATRIBUIDOS_HREF}
            title="Concluídos (Aguardando)"
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
        </StaggerItem>
      </Stagger>

      <Stagger className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Meus Serviços / Especialidades</CardTitle>
            </CardHeader>
            <CardContent>
              {data.especialidades.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/20 py-8 text-center">
                  <Wrench className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma especialidade cadastrada no seu perfil.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.especialidades.map((esp) => (
                    <Badge
                      key={esp._id}
                      variant="secondary"
                      className="max-w-full rounded-md px-2.5 py-1 text-xs font-medium sm:max-w-none"
                    >
                      <span className="min-w-0 max-w-[180px] truncate sm:max-w-none">
                        {esp.code} — {esp.name}
                      </span>
                      {esp.chamadosAtivos > 0 && (
                        <span className="ml-1.5 shrink-0 font-bold tabular-nums text-primary">
                          ({esp.chamadosAtivos} ativo{esp.chamadosAtivos !== 1 ? 's' : ''})
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Últimos Chamados Atribuídos</CardTitle>
              <Link
                href={CHAMADOS_ATRIBUIDOS_HREF}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ver todos
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Link>
            </CardHeader>
            <CardContent>
              {data.ultimosChamados.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/20 py-10 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-muted/50">
                    <Ticket className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    Nenhum chamado atribuído
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Você não possui chamados atribuídos no momento.
                  </p>
                  <Link
                    href={CHAMADOS_ATRIBUIDOS_HREF}
                    className="mt-4 text-sm font-medium text-primary hover:underline"
                  >
                    Ir para Chamados Atribuídos
                  </Link>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.ultimosChamados.map((c) => (
                    <li key={c._id}>
                      <Link
                        href={`/chamados-atribuidos/${c._id}`}
                        className="group flex h-full flex-col justify-between gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold text-primary/80">
                              {c.ticket_number}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                              {c.titulo || 'Sem título'}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/60" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="rounded-md text-[11px] font-medium">
                            {CHAMADO_STATUS_LABELS[c.status as ChamadoStatus] ?? c.status}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
