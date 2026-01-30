'use client';

import { CheckCircle2, ChevronRight, ClipboardList, Loader2, Ticket, Wrench } from 'lucide-react';
import Link from 'next/link';

import type { DashboardTecnicoData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';

type Props = {
  data: DashboardTecnicoData;
};

const CHAMADOS_ATRIBUIDOS_HREF = '/chamados-atribuidos';

export function DashboardTecnicoContent({ data }: Props) {
  return (
    <div className="w-full max-w-6xl space-y-5 sm:space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da sua carga de trabalho e chamados atribuídos"
      />

      {/* Grid de KPIs: 1 col mobile, 2 cols tablet+, 4 cols desktop largo */}
      <section className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1) Minha Carga de Trabalho (destaque) */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative h-full overflow-hidden border-primary/30 bg-primary/5 transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 sm:-right-10 sm:-top-10 sm:h-28 sm:w-28" />
            <CardContent className="relative p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    Minha Carga de Trabalho
                  </p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums sm:mt-2 sm:text-2xl">
                    {data.cargaAtiva} de {data.maxAssignedTickets}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1">
                    chamados ativos atribuídos
                  </p>
                </div>
                <Wrench className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 2) Em Atendimento */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-purple-100/70 dark:bg-purple-950/30 sm:-right-10 sm:-top-10 sm:h-28 sm:w-28" />
            <CardContent className="relative p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    Em Atendimento
                  </p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums sm:mt-2 sm:text-2xl">
                    {data.emAtendimento}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:mt-1">
                    {data.emAtendimento === 0
                      ? 'Nenhum chamado em atendimento no momento'
                      : data.emAtendimento === 1
                        ? '1 chamado em atendimento'
                        : `${data.emAtendimento} chamados em atendimento`}
                  </p>
                </div>
                <Loader2 className="h-5 w-5 shrink-0 text-muted-foreground sm:h-6 sm:w-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 3) Prontos para Concluir / Registrar Execução */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-100/70 dark:bg-amber-950/30 sm:-right-10 sm:-top-10 sm:h-28 sm:w-28" />
            <CardContent className="relative p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    Prontos para Concluir
                  </p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums sm:mt-2 sm:text-2xl">
                    {data.prontosParaConcluir}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:mt-1">
                    {data.prontosParaConcluir === 0
                      ? 'Nenhum chamado pronto para registrar execução'
                      : 'status Em atendimento'}
                  </p>
                </div>
                <ClipboardList className="h-5 w-5 shrink-0 text-muted-foreground sm:h-6 sm:w-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 4) Concluídos (Aguardando Encerramento) */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-100/70 dark:bg-emerald-950/30 sm:-right-10 sm:-top-10 sm:h-28 sm:w-28" />
            <CardContent className="relative p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    Concluídos (Aguardando)
                  </p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums sm:mt-2 sm:text-2xl">
                    {data.concluidosAguardandoEncerramento}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:mt-1">
                    {data.concluidosAguardandoEncerramento === 0
                      ? 'Nenhum aguardando encerramento'
                      : 'aguardando encerramento pelo Admin'}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground sm:h-6 sm:w-6" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>

      {/* Meus Serviços / Especialidades */}
      <Card>
        <CardHeader className="pb-2 pt-4 sm:pt-6">
          <CardTitle className="text-sm sm:text-base">Meus Serviços / Especialidades</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-0">
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
                  className="max-w-full text-xs sm:max-w-none"
                >
                  <span className="min-w-0 max-w-[180px] truncate sm:max-w-none">
                    {esp.code} — {esp.name}
                  </span>
                  {esp.chamadosAtivos > 0 && (
                    <span className="ml-1.5 shrink-0 font-semibold tabular-nums text-foreground">
                      ({esp.chamadosAtivos} ativo{esp.chamadosAtivos !== 1 ? 's' : ''})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimos Chamados Atribuídos */}
      <Card>
        <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:space-y-0">
          <CardTitle className="text-sm sm:text-base">Últimos Chamados Atribuídos</CardTitle>
          <Link
            href={CHAMADOS_ATRIBUIDOS_HREF}
            className="flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todos
            <ChevronRight className="h-4 w-4 shrink-0" />
          </Link>
        </CardHeader>
        <CardContent>
          {data.ultimosChamados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center sm:py-8">
              <Ticket className="h-8 w-8 text-muted-foreground sm:h-10 sm:w-10" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum chamado atribuído a você no momento
              </p>
              <Link
                href={CHAMADOS_ATRIBUIDOS_HREF}
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Chamados Atribuídos
              </Link>
            </div>
          ) : (
            <ul className="space-y-2 sm:space-y-3">
              {data.ultimosChamados.map((c) => (
                <li key={c._id}>
                  <Link
                    href={`/chamados-atribuidos/${c._id}`}
                    className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium text-foreground">
                        {c.ticket_number}
                      </p>
                      <p className="line-clamp-2 text-sm text-muted-foreground sm:line-clamp-none sm:truncate">
                        {c.titulo || 'Sem título'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {CHAMADO_STATUS_LABELS[c.status as ChamadoStatus] ?? c.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
