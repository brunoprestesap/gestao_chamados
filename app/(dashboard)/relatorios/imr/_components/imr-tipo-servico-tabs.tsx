'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { IndicadoresAtivos } from '@/lib/ativos/indicadores';
import type { ImrResultPorTipo, ImrResumoGeral } from '@/lib/imr-service';

import { ImrAtivos } from './imr-ativos';
import {
  SectionAvaliacao,
  SectionPenalidades,
  SectionQuadroResumo,
  SectionSla,
  SectionSlaPorPrioridade,
  SectionTempoMedio,
  SectionTempoMedioComBreakdown,
  SectionVolume,
} from './imr-sections';

export function ImrTipoServicoTabs({
  resumoGeral,
  porTipoServico,
  ativos,
}: {
  resumoGeral: ImrResumoGeral;
  porTipoServico: ImrResultPorTipo[];
  /** Indicadores de equipamento (spec 0014); `null` quando a leitura falhou. */
  ativos: IndicadoresAtivos | null;
}) {
  return (
    <Tabs defaultValue="resumo-geral">
      <TabsList>
        <TabsTrigger value="resumo-geral">Resumo Geral</TabsTrigger>
        {porTipoServico.map((tipo) => (
          <TabsTrigger key={tipo.tipoServico} value={tipo.tipoServico}>
            {tipo.tipoServico}
          </TabsTrigger>
        ))}
        <TabsTrigger value="ativos">Ativos</TabsTrigger>
      </TabsList>

      <TabsContent value="resumo-geral" className="space-y-6">
        <SectionQuadroResumo
          totalChamados={resumoGeral.totalChamados}
          sla={resumoGeral.sla}
          avaliacao={resumoGeral.avaliacao}
          chamadosForaSla={resumoGeral.chamadosForaSla}
        />
        <SectionVolume
          volumePorTipo={resumoGeral.volumePorTipo}
          totalChamados={resumoGeral.totalChamados}
        />
        <SectionSla sla={resumoGeral.sla} />
        <SectionSlaPorPrioridade slaPorPrioridade={resumoGeral.slaPorPrioridade} />
        <SectionTempoMedioComBreakdown
          tempoMedioMs={resumoGeral.tempoMedioMs}
          tempoMedioPorTipo={resumoGeral.tempoMedioPorTipo}
        />
        <SectionAvaliacao avaliacao={resumoGeral.avaliacao} />
        <SectionPenalidades penalidades={resumoGeral.penalidades} />
      </TabsContent>

      {porTipoServico.map((tipo) => (
        <TabsContent key={tipo.tipoServico} value={tipo.tipoServico} className="space-y-6">
          <SectionQuadroResumo
            totalChamados={tipo.totalChamados}
            sla={tipo.sla}
            avaliacao={tipo.avaliacao}
            chamadosForaSla={tipo.chamadosForaSla}
          />
          <SectionSla sla={tipo.sla} />
          <SectionSlaPorPrioridade slaPorPrioridade={tipo.slaPorPrioridade} />
          <SectionTempoMedio tempoMedioMs={tipo.tempoMedioMs} />
          <SectionAvaliacao avaliacao={tipo.avaliacao} />
          <SectionPenalidades penalidades={tipo.penalidades} />
        </TabsContent>
      ))}

      <TabsContent value="ativos" className="space-y-6">
        <ImrAtivos ativos={ativos} />
      </TabsContent>
    </Tabs>
  );
}
