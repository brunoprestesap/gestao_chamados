'use client';

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Gauge,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Star,
  Users,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';

import {
  alertTone,
  type AttentionItem,
  AttentionList,
  formatNumber,
  PainelRoot,
  plural,
  SectionCard,
  SectionLink,
  StackedBar,
  StatTile,
  TodayLabel,
} from '@/app/(dashboard)/dashboard/_components/painel-ui';
import type { DashboardAdminData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  data: DashboardAdminData;
};

export function DashboardAdminContent({ data }: Props) {
  const { porStatus } = data;
  const totalSistema =
    porStatus.aberto + porStatus['em atendimento'] + porStatus['concluído'] + porStatus.encerrado;
  const saldoHoje = data.encerradosHoje - data.abertosHoje;
  const tecnicosComFolga = Math.max(
    data.tecnicosAtivos - data.tecnicosSobrecarregados - data.tecnicosNoLimite,
    0,
  );

  const atencao: AttentionItem[] = [
    {
      key: 'criticos',
      count: data.criticosUrgentes,
      title: 'Críticos ou urgentes',
      description: 'Natureza urgente ou prioridade Alta/Emergencial',
      href: '/gestao',
      tone: 'danger',
    },
    {
      key: 'sobrecarga',
      count: data.tecnicosSobrecarregados,
      title:
        data.tecnicosSobrecarregados === 1 ? 'Técnico sobrecarregado' : 'Técnicos sobrecarregados',
      description: 'Carga igual ou acima do limite de chamados',
      href: '/gestao',
      tone: 'danger',
    },
    {
      key: 'backlog',
      count: data.backlogInicial,
      title: 'Aguardando classificação',
      description: 'Chamados abertos ainda sem triagem',
      href: '/gestao',
      tone: 'warning',
    },
    {
      key: 'negativas',
      count: data.avaliacoesNegativas,
      title: data.avaliacoesNegativas === 1 ? 'Avaliação negativa' : 'Avaliações negativas',
      description: 'Notas 1 ou 2 dadas pelos solicitantes',
      href: '/relatorios/imr',
      tone: 'warning',
    },
  ];

  return (
    <PainelRoot>
      <div>
        <TodayLabel />
        <div className="mt-1">
          <PageHeader
            title="Painel de Gestão"
            subtitle="Visão global do sistema: saúde operacional, gargalos e qualidade do atendimento"
            actions={
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href="/sla-dashboard">
                    <Gauge aria-hidden />
                    Painel SLA
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/relatorios/imr">
                    <BarChart3 aria-hidden />
                    Relatório IMR
                  </Link>
                </Button>
              </>
            }
          />
        </div>
      </div>

      {/* Fluxo + atenção */}
      <Stagger className="grid gap-4 lg:grid-cols-5 xl:gap-5">
        <StaggerItem className="lg:col-span-3">
          <SectionCard
            title="Fluxo de chamados"
            description="Onde estão os chamados do sistema agora"
            icon={Activity}
            action={<SectionLink href="/gestao">Gestão</SectionLink>}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight tabular-nums">
                {formatNumber(totalSistema)}
              </span>
              <span className="text-sm text-muted-foreground">chamados</span>
            </div>
            <div className="mt-5">
              <StackedBar
                emptyLabel="Nenhum chamado registrado ainda"
                segments={[
                  { key: 'aberto', label: 'Aberto', value: porStatus.aberto, tone: 'warning' },
                  {
                    key: 'em atendimento',
                    label: 'Em atendimento',
                    value: porStatus['em atendimento'],
                    tone: 'primary',
                  },
                  {
                    key: 'concluído',
                    label: 'Concluído',
                    value: porStatus['concluído'],
                    tone: 'success',
                  },
                  {
                    key: 'encerrado',
                    label: 'Encerrado',
                    value: porStatus.encerrado,
                    tone: 'neutral',
                  },
                ]}
              />
            </div>
          </SectionCard>
        </StaggerItem>

        <StaggerItem className="lg:col-span-2">
          <SectionCard
            title="Precisa de atenção"
            description="Gargalos que pedem decisão"
            icon={ShieldCheck}
          >
            <AttentionList
              items={atencao}
              emptyDescription="Sem críticos, backlog, sobrecarga ou avaliações negativas."
            />
          </SectionCard>
        </StaggerItem>
      </Stagger>

      {/* Hoje */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-5">
        <StaggerItem>
          <StatTile
            href="/gestao"
            label="Abertos hoje"
            value={formatNumber(data.abertosHoje)}
            helper="Novos chamados desde 00h"
            icon={Inbox}
            tone="info"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            href="/gestao"
            label="Encerrados hoje"
            value={formatNumber(data.encerradosHoje)}
            icon={Wrench}
            tone="success"
            helper={
              <span className="inline-flex items-center gap-1">
                {saldoHoje === 0 ? (
                  'Entrada e saída equilibradas'
                ) : (
                  <>
                    {saldoHoje > 0 ? (
                      <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                    )}
                    {saldoHoje > 0
                      ? `Fila diminuiu em ${formatNumber(saldoHoje)}`
                      : `Fila cresceu em ${formatNumber(Math.abs(saldoHoje))}`}
                  </>
                )}
              </span>
            }
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            href="/gestao"
            label="Reatribuições hoje"
            value={formatNumber(data.reatribuicoesHoje)}
            helper="Chamados que trocaram de técnico"
            icon={RefreshCw}
            tone={alertTone(data.reatribuicoesHoje, 'warning')}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            href="/usuarios"
            label="Usuários"
            value={formatNumber(data.totalUsuarios)}
            helper={plural(data.tecnicosAtivos, 'técnico ativo', 'técnicos ativos')}
            icon={Users}
          />
        </StaggerItem>
      </Stagger>

      {/* Equipe + qualidade */}
      <Stagger className="grid gap-4 lg:grid-cols-2 xl:gap-5">
        <StaggerItem>
          <SectionCard
            title="Capacidade da equipe"
            description="Carga atual dos técnicos ativos contra o limite de cada um"
            icon={Wrench}
            action={<SectionLink href="/usuarios">Técnicos</SectionLink>}
          >
            <StackedBar
              emptyLabel="Nenhum técnico ativo cadastrado"
              segments={[
                {
                  key: 'folga',
                  label: 'Com folga',
                  value: tecnicosComFolga,
                  tone: 'success',
                },
                {
                  key: 'limite',
                  label: 'No limite',
                  value: data.tecnicosNoLimite,
                  tone: 'warning',
                },
                {
                  key: 'sobrecarga',
                  label: 'Sobrecarregados',
                  value: data.tecnicosSobrecarregados,
                  tone: 'danger',
                },
              ]}
            />
          </SectionCard>
        </StaggerItem>

        <StaggerItem>
          <SectionCard
            title="Satisfação dos solicitantes"
            description="Média de todas as avaliações registradas"
            icon={Star}
            action={<SectionLink href="/relatorios/imr">IMR</SectionLink>}
          >
            {data.totalAvaliacoes > 0 && data.mediaAvaliacao != null ? (
              <RatingSummary
                media={data.mediaAvaliacao}
                total={data.totalAvaliacoes}
                negativas={data.avaliacoesNegativas}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma avaliação registrada ainda.</p>
            )}
          </SectionCard>
        </StaggerItem>
      </Stagger>
    </PainelRoot>
  );
}

function RatingSummary({
  media,
  total,
  negativas,
}: {
  media: number;
  total: number;
  negativas: number;
}) {
  const pctNegativas = Math.round((negativas / total) * 100);
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold tracking-tight tabular-nums">
            {media.toFixed(1).replace('.', ',')}
          </span>
          <span className="text-sm text-muted-foreground">de 5</span>
        </div>
        <div className="mt-2 flex gap-0.5" role="img" aria-label={`Média ${media} de 5 estrelas`}>
          {[1, 2, 3, 4, 5].map((n) => {
            const fill = Math.min(Math.max(media - (n - 1), 0), 1);
            return (
              <span key={n} className="relative h-5 w-5">
                <Star className="absolute inset-0 h-5 w-5 text-muted-foreground/30" aria-hidden />
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden />
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">Avaliações</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{formatNumber(total)}</dd>
        </div>
        <div
          className={cn(
            'rounded-xl p-3',
            negativas > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/50',
          )}
        >
          <dt className="text-xs text-muted-foreground">Negativas (1–2)</dt>
          <dd className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums">{formatNumber(negativas)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{pctNegativas}%</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
