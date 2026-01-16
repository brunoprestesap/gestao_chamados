import { AlertTriangle, Clock, Ticket, Wrench } from 'lucide-react';

import { PageHeader } from '@/components/dashboard/header';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Visão geral dos chamados de manutenção" />

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Total de Chamados"
          value={12}
          helper="Todos os registros"
          icon={Ticket}
          accentClassName="bg-blue-100/70"
        />
        <KpiCard
          title="Aguardando Ação"
          value={0}
          helper="Abertos e em validação"
          icon={Clock}
          accentClassName="bg-amber-100/70"
        />
        <KpiCard
          title="Em Atendimento"
          value={0}
          helper="Sendo executados"
          icon={Wrench}
          accentClassName="bg-purple-100/70"
        />
        <KpiCard
          title="Atrasos SLA"
          value={0}
          helper="IMR: 0 pontos"
          icon={AlertTriangle}
          accentClassName="bg-red-100/70"
        />
      </section>

      {/* Conteúdo (grids de cards) */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent className="h-65">
            {/* Aqui entra seu donut chart depois */}
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Gráfico (donut)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chamados por Unidade</CardTitle>
          </CardHeader>
          <CardContent className="h-65">
            {/* Aqui entra seu bar chart depois */}
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Gráfico (barras)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por Tipo de Serviço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Lista estilo “pílula” do screenshot */}
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
      </section>
    </>
  );
}
