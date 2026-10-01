'use client';

import {
  ClipboardCheck,
  ClipboardList,
  Loader2,
  MessagesSquare,
  Ticket,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';

import {
  CapacityMeter,
  capacityState,
  EmptyState,
  formatNumber,
  PainelRoot,
  SectionCard,
  SectionLink,
  StatTile,
  TicketRows,
  TodayLabel,
  toneClasses,
} from '@/app/(dashboard)/dashboard/_components/painel-ui';
import type { DashboardTecnicoData } from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  data: DashboardTecnicoData;
};

const CHAMADOS_ATRIBUIDOS_HREF = '/chamados-atribuidos';

export function DashboardTecnicoContent({ data }: Props) {
  const estado = capacityState(data.cargaAtiva, data.maxAssignedTickets);
  const vagas = Math.max(data.maxAssignedTickets - data.cargaAtiva, 0);
  const maxEspecialidade = Math.max(...data.especialidades.map((e) => e.chamadosAtivos), 1);

  return (
    <PainelRoot>
      <div>
        <TodayLabel />
        <div className="mt-1">
          <PageHeader
            title="Painel de Gestão"
            subtitle="Visão geral da sua carga de trabalho e chamados atribuídos"
            actions={
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href="/conversas">
                    <MessagesSquare aria-hidden />
                    Conversas
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={CHAMADOS_ATRIBUIDOS_HREF}>
                    <ClipboardList aria-hidden />
                    Meus atendimentos
                  </Link>
                </Button>
              </>
            }
          />
        </div>
      </div>

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 xl:gap-5">
        {/* Carga: o número que organiza o dia do técnico */}
        <StaggerItem className="sm:col-span-2">
          <Link
            href={CHAMADOS_ATRIBUIDOS_HREF}
            className="group flex h-full flex-col rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg hover:shadow-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-muted-foreground">
                Minha Carga de Trabalho
              </p>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  toneClasses(estado.tone).chip,
                )}
              >
                {estado.label}
              </span>
            </div>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight tabular-nums">
                {formatNumber(data.cargaAtiva)}
              </span>
              <span className="text-lg text-muted-foreground">
                de {formatNumber(data.maxAssignedTickets)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">chamados ativos atribuídos</p>
            <CapacityMeter
              className="mt-auto pt-5"
              value={data.cargaAtiva}
              max={data.maxAssignedTickets}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {vagas === 0
                ? 'Sem vagas para novas atribuições'
                : `${formatNumber(vagas)} ${vagas === 1 ? 'vaga livre' : 'vagas livres'} para novas atribuições`}
            </p>
          </Link>
        </StaggerItem>

        <StaggerItem>
          <StatTile
            href={CHAMADOS_ATRIBUIDOS_HREF}
            label="Em Atendimento"
            value={formatNumber(data.emAtendimento)}
            helper={data.emAtendimento === 0 ? 'Nenhum em execução' : 'Em execução por você'}
            icon={Loader2}
            tone="primary"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            href={CHAMADOS_ATRIBUIDOS_HREF}
            label="Prontos para Concluir"
            value={formatNumber(data.prontosParaConcluir)}
            helper={
              data.prontosParaConcluir === 0
                ? 'Nada para registrar agora'
                : 'Registre a execução ao terminar'
            }
            icon={ClipboardList}
            tone={data.prontosParaConcluir > 0 ? 'warning' : 'neutral'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            href={CHAMADOS_ATRIBUIDOS_HREF}
            label="Aguardando avaliação"
            value={formatNumber(data.concluidosAguardandoEncerramento)}
            helper={
              data.concluidosAguardandoEncerramento === 0
                ? 'Nenhum aguardando avaliação'
                : 'À espera do solicitante'
            }
            icon={ClipboardCheck}
            tone="success"
          />
        </StaggerItem>
      </Stagger>

      <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:gap-5">
        <StaggerItem className="lg:col-span-2">
          <SectionCard
            title="Últimos Chamados Atribuídos"
            description="Os mais recentes que chegaram para você"
            icon={Ticket}
            action={<SectionLink href={CHAMADOS_ATRIBUIDOS_HREF}>Ver todos</SectionLink>}
          >
            {data.ultimosChamados.length === 0 ? (
              <EmptyState
                icon={Ticket}
                title="Nenhum chamado atribuído"
                description="Você não possui chamados atribuídos no momento."
              />
            ) : (
              <TicketRows tickets={data.ultimosChamados} hrefBase={CHAMADOS_ATRIBUIDOS_HREF} />
            )}
          </SectionCard>
        </StaggerItem>

        <StaggerItem>
          <SectionCard
            title="Meus Serviços / Especialidades"
            description="Chamados ativos em cada especialidade"
            icon={Wrench}
          >
            {data.especialidades.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="Nenhuma especialidade"
                description="Peça ao administrador para cadastrar as suas no perfil."
              />
            ) : (
              <ul className="space-y-3">
                {data.especialidades.map((esp) => (
                  <li key={esp._id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {esp.code ? `${esp.code} — ${esp.name}` : esp.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {esp.chamadosAtivos === 0
                          ? 'sem ativos'
                          : `${formatNumber(esp.chamadosAtivos)} ${esp.chamadosAtivos === 1 ? 'ativo' : 'ativos'}`}
                      </span>
                    </div>
                    <div
                      aria-hidden
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                        style={{ width: `${(esp.chamadosAtivos / maxEspecialidade) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </StaggerItem>
      </Stagger>
    </PainelRoot>
  );
}
