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
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da sua carga de trabalho e chamados atribuídos"
      />

      <section className="grid gap-4 md:grid-cols-2">
        {/* 1) Minha Carga de Trabalho (destaque) */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative overflow-hidden border-primary/30 bg-primary/5 transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Minha Carga de Trabalho
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {data.cargaAtiva} de {data.maxAssignedTickets}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">chamados ativos atribuídos</p>
                </div>
                <Wrench className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 2) Em Atendimento */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-purple-100/70 dark:bg-purple-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Em Atendimento</p>
                  <p className="mt-2 text-2xl font-semibold">{data.emAtendimento}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.emAtendimento === 0
                      ? 'Nenhum chamado em atendimento no momento'
                      : data.emAtendimento === 1
                        ? '1 chamado em atendimento'
                        : `${data.emAtendimento} chamados em atendimento`}
                  </p>
                </div>
                <Loader2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 3) Prontos para Concluir / Registrar Execução */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-100/70 dark:bg-amber-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Prontos para Concluir / Registrar Execução
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{data.prontosParaConcluir}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.prontosParaConcluir === 0
                      ? 'Nenhum chamado pronto para registrar execução'
                      : 'status Em atendimento'}
                  </p>
                </div>
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 4) Concluídos (Aguardando Encerramento) */}
        <Link href={CHAMADOS_ATRIBUIDOS_HREF} className="block transition-opacity hover:opacity-90">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-100/70 dark:bg-emerald-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Concluídos (Aguardando Encerramento)
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {data.concluidosAguardandoEncerramento}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.concluidosAguardandoEncerramento === 0
                      ? 'Nenhum aguardando encerramento'
                      : 'aguardando encerramento pelo Admin'}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>

      {/* 5) Meus Serviços / Especialidades */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Meus Serviços / Especialidades</CardTitle>
        </CardHeader>
        <CardContent>
          {data.especialidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma especialidade cadastrada no seu perfil.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.especialidades.map((esp) => (
                <Badge key={esp._id} variant="secondary" className="text-xs">
                  {esp.code} — {esp.name}
                  {esp.chamadosAtivos > 0 && (
                    <span className="ml-1.5 font-semibold tabular-nums text-foreground">
                      ({esp.chamadosAtivos} ativo{esp.chamadosAtivos !== 1 ? 's' : ''})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6) Últimos Chamados Atribuídos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Últimos Chamados Atribuídos</CardTitle>
          <Link
            href={CHAMADOS_ATRIBUIDOS_HREF}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todos
            <ChevronRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {data.ultimosChamados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Ticket className="h-10 w-10 text-muted-foreground" />
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
            <ul className="space-y-3">
              {data.ultimosChamados.map((c) => (
                <li key={c._id}>
                  <Link
                    href={`/chamados-atribuidos/${c._id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium text-foreground">
                        {c.ticket_number}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
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
