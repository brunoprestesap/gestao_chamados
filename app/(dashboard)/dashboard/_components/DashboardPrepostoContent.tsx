'use client';

import {
  AlertCircle,
  AlertTriangle,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  data: DashboardPrepostoData;
};

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
    <Link href={href} className={`block transition-opacity hover:opacity-90 ${className ?? ''}`}>
      {children}
    </Link>
  );
}

export function DashboardPrepostoContent({ data }: Props) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Visão operacional e pontos de ação para gestão de chamados"
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1) Chamados Aguardando Classificação */}
        <DashboardCardLink href="/gestao">
          <Card className="relative overflow-hidden border-amber-200 bg-amber-50/50 transition-shadow hover:shadow-md dark:border-amber-800 dark:bg-amber-950/20">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-200/50 dark:bg-amber-900/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    Aguardando Classificação
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-amber-800 dark:text-amber-200">
                    {data.aguardandoClassificacao}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.aguardandoClassificacao === 1
                      ? '1 chamado aguarda classificação'
                      : `${data.aguardandoClassificacao} chamados aguardam classificação`}
                  </p>
                </div>
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 2) Chamados Aguardando Atribuição */}
        <DashboardCardLink href="/gestao">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-100/70 dark:bg-sky-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Aguardando Atribuição</p>
                  <p className="mt-2 text-2xl font-semibold">{data.aguardandoAtribuicao}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.aguardandoAtribuicao === 1
                      ? '1 chamado aguarda atribuição'
                      : `${data.aguardandoAtribuicao} chamados aguardam atribuição`}
                  </p>
                </div>
                <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 3) Chamados em Atendimento */}
        <DashboardCardLink href="/gestao">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-violet-100/70 dark:bg-violet-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Em Atendimento</p>
                  <p className="mt-2 text-2xl font-semibold">{data.emAtendimento}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.emAtendimento === 1
                      ? '1 chamado em atendimento'
                      : `${data.emAtendimento} chamados em atendimento`}
                  </p>
                </div>
                <Loader2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 4) Chamados Concluídos (Aguardando Encerramento) - destaque */}
        <DashboardCardLink href="/gestao">
          <Card className="relative overflow-hidden border-emerald-200 bg-emerald-50/50 transition-shadow hover:shadow-md dark:border-emerald-800 dark:bg-emerald-950/20">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-emerald-200/50 dark:bg-emerald-900/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Aguardando Encerramento
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-800 dark:text-emerald-200">
                    {data.aguardandoEncerramento}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.aguardandoEncerramento === 1
                      ? '1 chamado aguarda encerramento'
                      : `${data.aguardandoEncerramento} chamados aguardam encerramento`}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 5) Chamados Encerrados (Hoje ou Semana) */}
        <DashboardCardLink href="/gestao">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-teal-100/70 dark:bg-teal-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Encerrados (hoje / semana)
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{data.encerradosHoje}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.encerradosHoje === 1
                      ? '1 chamado encerrado hoje'
                      : `${data.encerradosHoje} chamados encerrados hoje`}
                    {data.encerradosSemana > 0 && ` • ${data.encerradosSemana} esta semana`}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 6) Sobrecarga de Técnicos */}
        <DashboardCardLink href="/gestao">
          <Card
            className={`relative overflow-hidden transition-shadow hover:shadow-md ${
              data.sobrecargaTecnicos > 0
                ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                : ''
            }`}
          >
            <div
              className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full ${
                data.sobrecargaTecnicos > 0 ? 'bg-red-200/50 dark:bg-red-900/30' : 'bg-muted'
              }`}
            />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {data.sobrecargaTecnicos > 0 && (
                      <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    )}
                    Sobrecarga de Técnicos
                  </p>
                  <p
                    className={`mt-2 text-2xl font-semibold ${
                      data.sobrecargaTecnicos > 0 ? 'text-red-800 dark:text-red-200' : ''
                    }`}
                  >
                    {data.sobrecargaTecnicos}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.sobrecargaTecnicos === 1
                      ? '1 técnico sobrecarregado'
                      : `${data.sobrecargaTecnicos} técnicos sobrecarregados`}
                  </p>
                </div>
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>

        {/* 7) Reatribuições Recentes */}
        <DashboardCardLink href="/gestao">
          <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-orange-100/70 dark:bg-orange-950/30" />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Reatribuições Recentes
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{data.reatribuicoesHoje}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.reatribuicoesHoje === 1
                      ? '1 chamado reatribuído hoje'
                      : `${data.reatribuicoesHoje} chamados reatribuídos hoje`}
                    {data.reatribuicoesSemana > 0 && ` • ${data.reatribuicoesSemana} esta semana`}
                  </p>
                </div>
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </DashboardCardLink>
      </section>

      {/* Atendimentos realizados por técnico (somente Preposto) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Atendimentos realizados por técnico
          </CardTitle>
          <p className="text-xs font-normal text-muted-foreground">
            Chamados concluídos ou encerrados atribuídos a cada técnico
          </p>
        </CardHeader>
        <CardContent>
          {data.atendimentosPorTecnico.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum técnico ativo ou nenhum atendimento concluído/encerrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {[...data.atendimentosPorTecnico]
                .sort((a, b) => b.total - a.total)
                .map((item) => (
                  <li
                    key={item.tecnicoId}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    <span className="text-sm font-medium">{item.nome}</span>
                    <Badge variant="secondary" className="font-semibold">
                      {item.total} {item.total === 1 ? 'atendimento' : 'atendimentos'}
                    </Badge>
                  </li>
                ))}
            </ul>
          )}
          <Link
            href="/gestao"
            className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Ir para Gestão de Chamados
          </Link>
        </CardContent>
      </Card>

      {/* Resumo Geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Resumo Geral
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
              Em Validação
              <span className="font-semibold">{data.resumoGeral.emvalidacao}</span>
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
              Em Atendimento
              <span className="font-semibold">{data.resumoGeral['em atendimento']}</span>
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
              Concluído
              <span className="font-semibold">{data.resumoGeral.concluído}</span>
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
              Encerrado
              <span className="font-semibold">{data.resumoGeral.encerrado}</span>
            </Badge>
          </div>
          <Link
            href="/gestao"
            className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            Ir para Gestão de Chamados
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
