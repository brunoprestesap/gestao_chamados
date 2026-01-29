'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, Plus, Ticket } from 'lucide-react';
import Link from 'next/link';

import type { DashboardSolicitanteData } from '@/app/(dashboard)/dashboard/actions';
import { NewTicketDialog } from '@/app/(dashboard)/meus-chamados/_components/NewTicketDialog';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';

type Props = {
  data: DashboardSolicitanteData;
};

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function DashboardSolicitanteContent({ data }: Props) {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Visão geral dos seus chamados de manutenção" />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1) Chamados em Andamento */}
        <Link href="/meus-chamados" className="block transition-opacity hover:opacity-90">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-100/70 dark:bg-amber-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Chamados em Andamento</p>
                  <p className="mt-2 text-2xl font-semibold">{data.emAndamento}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.emAndamento === 1
                      ? '1 chamado em andamento'
                      : `${data.emAndamento} chamados em andamento`}
                  </p>
                </div>
                <Loader2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 2) Avaliações Pendentes */}
        <Link href="/meus-chamados" className="block transition-opacity hover:opacity-90">
          <Card className="relative overflow-hidden border-amber-200 bg-amber-50/50 transition-shadow hover:shadow-md dark:border-amber-800 dark:bg-amber-950/20">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-200/50 dark:bg-amber-900/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    Avaliações Pendentes
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-amber-800 dark:text-amber-200">
                    {data.avaliacoesPendentes}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.avaliacoesPendentes === 1
                      ? '1 chamado aguarda sua avaliação'
                      : `${data.avaliacoesPendentes} chamados aguardam sua avaliação`}
                  </p>
                </div>
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 3) Chamados Encerrados */}
        <Link href="/meus-chamados" className="block transition-opacity hover:opacity-90">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-100/70 dark:bg-emerald-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Chamados Encerrados</p>
                  <p className="mt-2 text-2xl font-semibold">{data.encerradosTotal}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.encerradosTotal} encerrados • {data.encerradosAvaliados} avaliados
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 4) Abrir Novo Chamado (CTA) - sem Link, abre modal */}
        <AbrirNovoChamadoCard />
      </section>

      {/* 5) Últimos Chamados Abertos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Últimos Chamados Abertos</CardTitle>
          <Link
            href="/meus-chamados"
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
              <p className="mt-2 text-sm text-muted-foreground">Nenhum chamado criado ainda</p>
              <Link
                href="/meus-chamados"
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Abrir primeiro chamado
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.ultimosChamados.map((c) => (
                <li key={c._id}>
                  <Link
                    href={`/meus-chamados/${c._id}`}
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
                      <span className="text-xs text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </span>
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

function AbrirNovoChamadoCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        className="cursor-pointer border-primary/30 bg-primary/5 transition-shadow hover:shadow-md focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10" />
        <CardContent className="relative flex flex-col items-center justify-center p-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/20 text-primary">
            <Plus className="h-6 w-6" />
          </div>
          <p className="mt-3 font-semibold text-foreground">Abrir Novo Chamado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Registre uma nova solicitação de manutenção
          </p>
        </CardContent>
      </Card>
      <NewTicketDialog open={open} onOpenChange={setOpen} onSuccess={() => {}} />
    </>
  );
}
