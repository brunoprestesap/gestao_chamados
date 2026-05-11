'use client';

import { AlertCircle, CheckCircle2, ChevronRight, Loader2, Plus, Ticket } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';

import type { DashboardSolicitanteData } from '@/app/(dashboard)/dashboard/actions';
import { NewTicketDialog } from '@/app/(dashboard)/meus-chamados/_components/NewTicketDialog';
import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';

type Props = {
  data: DashboardSolicitanteData;
};

export function DashboardSolicitanteContent({ data }: Props) {
  const timezone = useInstitutionalTimezone();
  const tzOpt = { timeZone: timezone };
  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle="Visao geral dos seus chamados de manutencao" />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1) Chamados em Andamento */}
        <Link
          href="/meus-chamados"
          className="group block rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5"
        >
          <div className="relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-muted-foreground">
                  Chamados em Andamento
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                  {data.emAndamento}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground/70">
                  {data.emAndamento === 1
                    ? '1 chamado em andamento'
                    : `${data.emAndamento} chamados em andamento`}
                </p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 transition-transform duration-200 group-hover:scale-105 dark:bg-amber-950/50 dark:text-amber-400">
                <Loader2 className="h-5 w-5" />
              </div>
            </div>
          </div>
        </Link>

        {/* 2) Avaliacoes Pendentes */}
        <Link
          href="/meus-chamados"
          className="group block rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5"
        >
          <div className="relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-orange-400/60 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
                  Avaliacoes Pendentes
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-orange-700 dark:text-orange-300">
                  {data.avaliacoesPendentes}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground/70">
                  {data.avaliacoesPendentes === 1
                    ? '1 chamado aguarda sua avaliacao'
                    : `${data.avaliacoesPendentes} chamados aguardam sua avaliacao`}
                </p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600 transition-transform duration-200 group-hover:scale-105 dark:bg-orange-950/50 dark:text-orange-400">
                <AlertCircle className="h-5 w-5" />
              </div>
            </div>
          </div>
        </Link>

        {/* 3) Chamados Encerrados */}
        <Link
          href="/meus-chamados"
          className="group block rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5"
        >
          <div className="relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-muted-foreground">Chamados Encerrados</p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                  {data.encerradosTotal}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground/70">
                  {data.encerradosTotal} encerrados · {data.encerradosAvaliados} avaliados
                </p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 transition-transform duration-200 group-hover:scale-105 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </div>
        </Link>

        {/* 4) Abrir Novo Chamado */}
        <AbrirNovoChamadoCard />
      </section>

      {/* 5) Recent tickets */}
      <div className="rounded-2xl border border-border/50 bg-card shadow-sm">
        <div className="flex flex-row items-center justify-between border-b border-border/30 px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">Ultimos Chamados Abertos</h3>
          <Link
            href="/meus-chamados"
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todos
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-5">
          {data.ultimosChamados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted/50">
                <Ticket className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Nenhum chamado criado ainda</p>
              <Link
                href="/meus-chamados"
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                Abrir primeiro chamado
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.ultimosChamados.map((c) => (
                <li key={c._id}>
                  <Link
                    href={`/meus-chamados/${c._id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/30 p-3.5 transition-all duration-150 hover:border-border/60 hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {c.ticket_number}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {c.titulo || 'Sem titulo'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="rounded-md text-xs">
                        {CHAMADO_STATUS_LABELS[c.status as ChamadoStatus] ?? c.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(c.createdAt, tzOpt)}
                      </span>
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

function AbrirNovoChamadoCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'group cursor-pointer rounded-2xl border-2 border-dashed border-primary/25 bg-primary/[0.03] shadow-sm transition-all duration-200',
          'hover:border-primary/40 hover:bg-primary/[0.06] hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110">
            <Plus className="h-6 w-6" />
          </div>
          <p className="mt-3 font-semibold text-foreground">Abrir Novo Chamado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Registre uma nova solicitacao de manutencao
          </p>
        </div>
      </div>
      <NewTicketDialog open={open} onOpenChange={setOpen} onSuccess={() => {}} />
    </>
  );
}
