'use client';

import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  ListChecks,
  Loader2,
  RefreshCw,
  Tags,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import {
  alertTone,
  formatNumber,
  PainelRoot,
  plural,
  RankBars,
  SectionCard,
  SectionLink,
  StackedBar,
  StatTile,
  TodayLabel,
  toneClasses,
} from '@/app/(dashboard)/dashboard/_components/painel-ui';
import type { DashboardPrepostoData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  data: DashboardPrepostoData;
};

export function DashboardPrepostoContent({ data }: Props) {
  const filaTotal =
    data.aguardandoClassificacao + data.aguardandoAtribuicao + data.aguardandoEncerramento;
  const ranking = [...data.atendimentosPorTecnico]
    .sort((a, b) => b.total - a.total)
    .map((t) => ({ id: t.tecnicoId, label: t.nome, value: t.total }));

  return (
    <PainelRoot>
      <div>
        <TodayLabel />
        <div className="mt-1">
          <PageHeader
            title="Painel de Gestão"
            subtitle="Visão operacional e pontos de ação para a gestão de chamados"
            actions={
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href="/sla-dashboard">
                    <Gauge aria-hidden />
                    Painel SLA
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/gestao">
                    <ListChecks aria-hidden />
                    Abrir gestão
                  </Link>
                </Button>
              </>
            }
          />
        </div>
      </div>

      {/* Fila de ação */}
      <section aria-labelledby="fila-acao" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="fila-acao" className="text-[15px] font-semibold text-foreground">
            Sua fila de ação
          </h2>
          <p className="text-sm text-muted-foreground">
            {filaTotal === 0
              ? 'Nada aguardando você'
              : plural(filaTotal, 'chamado aguarda uma etapa', 'chamados aguardam uma etapa')}
          </p>
        </div>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-5">
          <StaggerItem>
            <StatTile
              href="/gestao"
              label="Aguardando classificação"
              value={formatNumber(data.aguardandoClassificacao)}
              helper="Definir serviço e prioridade"
              icon={Tags}
              tone={alertTone(data.aguardandoClassificacao, 'warning')}
            />
          </StaggerItem>
          <StaggerItem>
            <StatTile
              href="/gestao"
              label="Aguardando atribuição"
              value={formatNumber(data.aguardandoAtribuicao)}
              helper="Validados sem técnico"
              icon={UserCheck}
              tone={alertTone(data.aguardandoAtribuicao, 'warning')}
            />
          </StaggerItem>
          <StaggerItem>
            <StatTile
              href="/gestao"
              label="Em atendimento"
              value={formatNumber(data.emAtendimento)}
              helper="Com técnico em execução"
              icon={Loader2}
              tone="primary"
            />
          </StaggerItem>
          <StaggerItem>
            <StatTile
              href="/gestao"
              label="Aguardando avaliação"
              value={formatNumber(data.aguardandoEncerramento)}
              helper="Concluídos, à espera do solicitante"
              icon={ClipboardCheck}
              tone="success"
            />
          </StaggerItem>
        </Stagger>
      </section>

      <Stagger className="grid gap-4 lg:grid-cols-5 xl:gap-5">
        <StaggerItem className="lg:col-span-3">
          <SectionCard
            title="Atendimentos por técnico"
            description="Chamados concluídos ou encerrados por cada técnico ativo"
            icon={Users}
            action={<SectionLink href="/gestao">Gestão</SectionLink>}
          >
            <RankBars
              items={ranking}
              emptyLabel="Nenhum técnico ativo ou nenhum atendimento concluído ainda."
            />
          </SectionCard>
        </StaggerItem>

        <StaggerItem className="flex flex-col gap-4 lg:col-span-2 xl:gap-5">
          <SectionCard title="Ritmo da equipe" icon={TrendingUp}>
            <dl className="grid grid-cols-2 gap-3">
              <Metric
                label="Encerrados hoje"
                value={data.encerradosHoje}
                sub={`${formatNumber(data.encerradosSemana)} na semana`}
                icon={CheckCircle2}
              />
              <Metric
                label="Reatribuições hoje"
                value={data.reatribuicoesHoje}
                sub={`${formatNumber(data.reatribuicoesSemana)} na semana`}
                icon={RefreshCw}
              />
            </dl>
            <div
              className={cn(
                'mt-3 flex items-center gap-3 rounded-xl p-3',
                data.sobrecargaTecnicos > 0
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/20',
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                  toneClasses(data.sobrecargaTecnicos > 0 ? 'danger' : 'success').chip,
                )}
              >
                <Users className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm text-foreground">
                {data.sobrecargaTecnicos > 0
                  ? `${plural(data.sobrecargaTecnicos, 'técnico está', 'técnicos estão')} no limite de chamados`
                  : 'Nenhum técnico sobrecarregado'}
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Da execução ao encerramento" icon={Activity}>
            <StackedBar
              size="sm"
              emptyLabel="Nenhum chamado em execução ou finalizado"
              segments={[
                {
                  key: 'em atendimento',
                  label: 'Em atendimento',
                  value: data.resumoGeral['em atendimento'],
                  tone: 'primary',
                },
                {
                  key: 'concluído',
                  label: 'Concluído',
                  value: data.resumoGeral['concluído'],
                  tone: 'success',
                },
                {
                  key: 'encerrado',
                  label: 'Encerrado',
                  value: data.resumoGeral.encerrado,
                  tone: 'neutral',
                },
              ]}
            />
          </SectionCard>
        </StaggerItem>
      </Stagger>
    </PainelRoot>
  );
}

function Metric({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1">
        <span className="block text-2xl font-semibold tabular-nums text-foreground">
          {formatNumber(value)}
        </span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </dd>
    </div>
  );
}
