'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BreachReport } from '@/lib/sla-breach-report';

import { BreachByPriorityChart } from './BreachByPriorityChart';
import { BreachByTechnicianTable } from './BreachByTechnicianTable';
import { BreachByUnitTable } from './BreachByUnitTable';
import { BreachKpiCards } from './BreachKpiCards';
import { BreachTimelineChart } from './BreachTimelineChart';

export function BreachTabs({ report }: { report: BreachReport }) {
  return (
    <Tabs defaultValue="resumo" className="space-y-6">
      <TabsList>
        <TabsTrigger value="resumo">Resumo</TabsTrigger>
        <TabsTrigger value="tecnico">Por Técnico</TabsTrigger>
        <TabsTrigger value="unidade">Por Unidade</TabsTrigger>
        <TabsTrigger value="tipo">Por Tipo de Serviço</TabsTrigger>
      </TabsList>

      {/* Resumo */}
      <TabsContent value="resumo" className="space-y-6">
        <BreachKpiCards
          totalBreachedChamados={report.totalBreachedChamados}
          totalResponseBreaches={report.totalResponseBreaches}
          totalResolutionBreaches={report.totalResolutionBreaches}
          avgBreachRate={report.avgBreachRate}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Breaches por Prioridade</CardTitle>
              <p className="text-xs text-muted-foreground">
                Distribuição dos estouros de SLA por nível de prioridade
              </p>
            </CardHeader>
            <CardContent>
              <BreachByPriorityChart data={report.byPriority} label="Prioridade" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Evolução Temporal</CardTitle>
              <p className="text-xs text-muted-foreground">
                Tendência de breaches ao longo dos meses
              </p>
            </CardHeader>
            <CardContent>
              <BreachTimelineChart data={report.timeline} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Por Técnico */}
      <TabsContent value="tecnico">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Breaches por Técnico</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ranking de técnicos por taxa de breach — identifica gargalos de capacidade
            </p>
          </CardHeader>
          <CardContent>
            <BreachByTechnicianTable data={report.byTechnician} />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Por Unidade */}
      <TabsContent value="unidade">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Breaches por Unidade</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ranking de unidades/setores por taxa de breach — identifica locais problemáticos
            </p>
          </CardHeader>
          <CardContent>
            <BreachByUnitTable data={report.byUnit} />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Por Tipo de Serviço */}
      <TabsContent value="tipo">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Breaches por Tipo de Serviço</CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribuição dos estouros por categoria de atendimento
            </p>
          </CardHeader>
          <CardContent>
            <BreachByPriorityChart data={report.byTipoServico} label="Tipo de Serviço" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
