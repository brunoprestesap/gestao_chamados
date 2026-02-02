import { AlertTriangle, Clock, Ticket, Wrench } from 'lucide-react';

import { DashboardAdminContent } from '@/app/(dashboard)/dashboard/_components/DashboardAdminContent';
import { DashboardPrepostoContent } from '@/app/(dashboard)/dashboard/_components/DashboardPrepostoContent';
import { DashboardSolicitanteContent } from '@/app/(dashboard)/dashboard/_components/DashboardSolicitanteContent';
import { DashboardTecnicoContent } from '@/app/(dashboard)/dashboard/_components/DashboardTecnicoContent';
import {
  getDashboardAdminData,
  getDashboardPrepostoData,
  getDashboardSolicitanteData,
  getDashboardTecnicoData,
} from '@/app/(dashboard)/dashboard/actions';
import { PageHeader } from '@/components/dashboard/header';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { PageEnter } from '@/components/motion/page-enter';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/dal';

export default async function DashboardPage() {
  const session = await requireSession();

  if (session.role === 'Admin') {
    const data = await getDashboardAdminData();
    if (data) {
      return (
        <PageEnter>
          <DashboardAdminContent data={data} />
        </PageEnter>
      );
    }
  }

  if (session.role === 'Solicitante') {
    const data = await getDashboardSolicitanteData();
    if (data) {
      return (
        <PageEnter>
          <DashboardSolicitanteContent data={data} />
        </PageEnter>
      );
    }
  }

  if (session.role === 'Preposto') {
    const data = await getDashboardPrepostoData();
    if (data) {
      return (
        <PageEnter>
          <DashboardPrepostoContent data={data} />
        </PageEnter>
      );
    }
  }

  if (session.role === 'Técnico') {
    const data = await getDashboardTecnicoData();
    if (data) {
      return (
        <PageEnter>
          <DashboardTecnicoContent data={data} />
        </PageEnter>
      );
    }
  }

  // Fallback para outros perfis
  return (
    <PageEnter>
      <PageHeader title="Dashboard" subtitle="Visão geral dos chamados de manutenção" />

      <Stagger className="grid gap-4 md:grid-cols-4">
        <StaggerItem>
          <KpiCard
            title="Total de Chamados"
            value={12}
            helper="Todos os registros"
            icon={Ticket}
            accentClassName="bg-blue-100/70"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            title="Aguardando Ação"
            value={0}
            helper="Abertos e em validação"
            icon={Clock}
            accentClassName="bg-amber-100/70"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            title="Em Atendimento"
            value={0}
            helper="Sendo executados"
            icon={Wrench}
            accentClassName="bg-purple-100/70"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            title="Atrasos SLA"
            value={0}
            helper="IMR: 0 pontos"
            icon={AlertTriangle}
            accentClassName="bg-red-100/70"
          />
        </StaggerItem>
      </Stagger>

      <Stagger className="mt-6 grid gap-6 lg:grid-cols-2">
        <StaggerItem>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent className="h-65">
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Gráfico (donut)
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chamados por Unidade</CardTitle>
            </CardHeader>
            <CardContent className="h-65">
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Gráfico (barras)
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por Tipo de Serviço</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-md bg-amber-100 text-amber-700">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium">Manutenção Predial</p>
                </div>
                <span className="text-sm font-semibold text-amber-700">11</span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-md bg-blue-100 text-blue-700">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium">Ar-Condicionado</p>
                </div>
                <span className="text-sm font-semibold text-blue-700">1</span>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="flex items-center justify-center">
            <CardContent className="py-10 text-center">
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                ✓
              </div>
              <p className="text-sm font-medium">Aguardando Validação</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nenhum chamado pendente de validação
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>
    </PageEnter>
  );
}
