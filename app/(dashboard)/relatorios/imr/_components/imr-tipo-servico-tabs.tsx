'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ImrResultPorTipo,ImrResumoGeral } from '@/lib/imr-service';

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
}: {
  resumoGeral: ImrResumoGeral;
  porTipoServico: ImrResultPorTipo[];
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
    </Tabs>
  );
}
