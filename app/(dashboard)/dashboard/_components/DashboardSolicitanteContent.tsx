'use client';

import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  MessagesSquare,
  Plus,
  Star,
  Ticket,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  alertTone,
  EmptyState,
  formatNumber,
  PainelRoot,
  plural,
  SectionCard,
  SectionLink,
  StatTile,
  TicketRows,
  TodayLabel,
} from '@/app/(dashboard)/dashboard/_components/painel-ui';
import type { DashboardSolicitanteData } from '@/app/(dashboard)/dashboard/actions';
import { NewTicketDialog } from '@/app/(dashboard)/meus-chamados/_components/NewTicketDialog';
import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { PageHeader } from '@/components/dashboard/header';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

type Props = {
  data: DashboardSolicitanteData;
};

export function DashboardSolicitanteContent({ data }: Props) {
  const timezone = useInstitutionalTimezone();
  const router = useRouter();
  const [novoAberto, setNovoAberto] = useState(false);

  const criadoEm = new Map(
    data.ultimosChamados.map((c) => [c._id, formatDate(c.createdAt, { timeZone: timezone })]),
  );
  const pctAvaliados =
    data.encerradosTotal > 0
      ? Math.round((data.encerradosAvaliados / data.encerradosTotal) * 100)
      : 0;

  return (
    <PainelRoot>
      <div>
        <TodayLabel />
        <div className="mt-1">
          <PageHeader
            title="Painel de Gestão"
            subtitle="Acompanhe seus chamados de manutenção e abra novas solicitações"
            actions={
              <Button size="sm" onClick={() => setNovoAberto(true)}>
                <Plus aria-hidden />
                Abrir chamado
              </Button>
            }
          />
        </div>
      </div>

      {data.avaliacoesPendentes > 0 ? (
        <Link
          href="/meus-chamados"
          className="group flex items-center gap-4 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 transition-colors hover:bg-amber-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 sm:p-5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
            <Star className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {data.avaliacoesPendentes === 1
                ? '1 chamado aguarda a sua avaliação'
                : `${formatNumber(data.avaliacoesPendentes)} chamados aguardam a sua avaliação`}
            </span>
            <span className="block text-[13px] text-muted-foreground">
              A avaliação tem prazo: depois dele o chamado é encerrado sem a sua nota.
            </span>
          </span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-amber-700 transition-transform group-hover:translate-x-0.5 dark:text-amber-300"
            aria-hidden
          />
        </Link>
      ) : null}

      <Stagger className="grid gap-4 sm:grid-cols-3 xl:gap-5">
        <StaggerItem>
          <StatTile
            href="/meus-chamados"
            label="Em andamento"
            value={formatNumber(data.emAndamento)}
            helper={
              data.emAndamento === 0
                ? 'Nenhum chamado em andamento'
                : plural(data.emAndamento, 'chamado sendo tratado', 'chamados sendo tratados')
            }
            icon={Loader2}
            tone="primary"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            href="/meus-chamados"
            label="Avaliações pendentes"
            value={formatNumber(data.avaliacoesPendentes)}
            helper={
              data.avaliacoesPendentes === 0 ? 'Nenhuma avaliação pendente' : 'Dentro do prazo'
            }
            icon={Star}
            tone={alertTone(data.avaliacoesPendentes, 'warning')}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            href="/meus-chamados"
            label="Encerrados"
            value={formatNumber(data.encerradosTotal)}
            helper={
              data.encerradosTotal === 0
                ? 'Nenhum chamado encerrado'
                : `${formatNumber(data.encerradosAvaliados)} avaliados (${pctAvaliados}%)`
            }
            icon={CheckCircle2}
            tone="success"
          />
        </StaggerItem>
      </Stagger>

      <Stagger className="grid gap-4 lg:grid-cols-3 xl:gap-5">
        <StaggerItem className="lg:col-span-2">
          <SectionCard
            title="Últimos chamados"
            description="Os três mais recentes que você abriu"
            icon={ClipboardList}
            action={<SectionLink href="/meus-chamados">Ver todos</SectionLink>}
          >
            {data.ultimosChamados.length === 0 ? (
              <EmptyState
                icon={Ticket}
                title="Nenhum chamado criado ainda"
                description="Quando você abrir um chamado, ele aparece aqui."
                action={
                  <Button size="sm" onClick={() => setNovoAberto(true)}>
                    <Plus aria-hidden />
                    Abrir primeiro chamado
                  </Button>
                }
              />
            ) : (
              <TicketRows
                tickets={data.ultimosChamados}
                hrefBase="/meus-chamados"
                meta={(id) => `aberto em ${criadoEm.get(id) ?? ''}`}
              />
            )}
          </SectionCard>
        </StaggerItem>

        <StaggerItem>
          <section className="flex h-full flex-col justify-between gap-6 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Precisa de manutenção?</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Preencha o formulário ou descreva o problema na conversa: o assistente monta o
                chamado para você.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setNovoAberto(true)} className="h-11">
                <Plus aria-hidden />
                Abrir pelo formulário
              </Button>
              <Button asChild variant="outline" className="h-11 bg-background">
                <Link href="/conversas">
                  <MessagesSquare aria-hidden />
                  Descrever na conversa
                </Link>
              </Button>
            </div>
          </section>
        </StaggerItem>
      </Stagger>

      <NewTicketDialog
        open={novoAberto}
        onOpenChange={setNovoAberto}
        onSuccess={() => router.refresh()}
      />
    </PainelRoot>
  );
}
