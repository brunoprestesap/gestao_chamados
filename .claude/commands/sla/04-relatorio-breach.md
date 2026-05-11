# Relatório de Breach por Técnico/Unidade

Prioridade: 4 | Complexidade: Média | Dependências: Nenhuma

## Objetivo

Criar relatório analítico que identifique gargalos recorrentes de SLA por técnico e por unidade, permitindo ações corretivas (redistribuir carga, reforçar equipes, ajustar prioridades). Hoje o breach é registrado no chamado mas não existe visão consolidada para análise de padrões.

## Contexto do Projeto

### Dados de breach disponíveis

- **Chamado model** (`models/Chamado.ts`): sla.responseBreachedAt, sla.resolutionBreachedAt, sla.resolvedAt, sla.priority, sla.responseDueAt, sla.resolutionDueAt
- **Campos de atribuição**: assignedToUserId, unitId, tipoServico
- **Timestamps**: classifiedAt, assignedAt, concludedAt, closedAt, createdAt

### Relatório IMR existente (pattern a seguir)

- **IMR service**: `lib/imr-service.ts` — aggregation com $facet, filtra por closedAt em range, agrupa por tipoServico
- **IMR page**: `app/(dashboard)/relatorios/imr/page.tsx` — date range selector, abas por tipo
- **Pattern**: server component chama computeImrReport() → passa dados para componentes client

### Modelos relevantes

- **User**: `models/user.model.ts` — name, username, role, specialties, maxAssignedTickets
- **Unit**: `models/Unit.ts` — name (departamento/setor)

## Tarefas

### Serviço de Relatório

1. Crie `lib/sla-breach-report.ts`:

   **`computeBreachReport(startDate: Date, endDate: Date): Promise<BreachReport>`**:
   - dbConnect()
   - Aggregation pipeline no ChamadoModel com $facet:

     **breachByTechnician**: agrupa por assignedToUserId
     - totalChamados, responseBreaches, resolutionBreaches
     - avgResolutionDelayMs (média de resolvedAt - resolutionDueAt para breaches com resolvedAt)

     **breachByUnit**: agrupa por unitId
     - totalChamados, responseBreaches, resolutionBreaches, avgResolutionDelayMs

     **breachByPriority**: agrupa por sla.priority
     - total, responseBreaches, resolutionBreaches

     **breachByTipoServico**: agrupa por tipoServico
     - total, responseBreaches, resolutionBreaches

     **breachTimeline**: agrupa por mês ($dateToString format '%Y-%m' de sla.computedAt)
     - total, responseBreaches, resolutionBreaches

   - $match: `sla.computedAt` in [startDate, endDate] AND ($or: responseBreachedAt != null, resolutionBreachedAt != null)
   - Após aggregation, populate nomes de técnicos e unidades via UserModel e UnitModel
   - Calcule `breachRate` para cada técnico/unidade: (breaches / total) \* 100

   **Tipos exportados**:

   ```typescript
   export type BreachByTechnician = {
     technicianId: string;
     technicianName: string;
     totalChamados: number;
     responseBreaches: number;
     resolutionBreaches: number;
     avgDelayMinutes: number | null;
     breachRate: number;
   };
   export type BreachByUnit = {
     unitId: string;
     unitName: string;
     totalChamados: number;
     responseBreaches: number;
     resolutionBreaches: number;
     avgDelayMinutes: number | null;
     breachRate: number;
   };
   export type BreachByPriority = {
     priority: string;
     total: number;
     responseBreaches: number;
     resolutionBreaches: number;
   };
   export type BreachTimeline = {
     month: string;
     total: number;
     responseBreaches: number;
     resolutionBreaches: number;
   };
   export type BreachReport = {
     period: { start: string; end: string };
     totalBreaches: number;
     byTechnician: BreachByTechnician[];
     byUnit: BreachByUnit[];
     byPriority: BreachByPriority[];
     byTipoServico: BreachByPriority[];
     timeline: BreachTimeline[];
   };
   ```

### Página do Relatório

2. Crie `app/(dashboard)/relatorios/breach/page.tsx`:
   - requireManager() (server component ou redirect)
   - Date range selector (default: últimos 3 meses) — reaproveite pattern do IMR
   - Chama `computeBreachReport(startDate, endDate)` server-side
   - Passa dados para componentes client via props

### Componentes

3. Crie `app/(dashboard)/relatorios/breach/_components/BreachKpiCards.tsx`:
   - 4 KPIs: Total Breaches, Response Breaches, Resolution Breaches, Taxa Média (%)
   - Design: KPI Card padrão (rounded-2xl, accent stripe, ícone)

4. Crie `app/(dashboard)/relatorios/breach/_components/BreachByTechnicianTable.tsx`:
   - Tabela ordenada por breachRate desc (pior primeiro)
   - Colunas: Técnico, Total Chamados, Breaches Resposta, Breaches Resolução, Atraso Médio, Taxa (%)
   - Barra visual de taxa (vermelho >30%, amarelo >15%, verde ≤15%)
   - Highlight na linha se taxa > 30%

5. Crie `app/(dashboard)/relatorios/breach/_components/BreachByUnitTable.tsx`:
   - Mesma estrutura que por técnico, agrupada por unidade

6. Crie `app/(dashboard)/relatorios/breach/_components/BreachByPriorityChart.tsx`:
   - Gráfico de barras horizontal: uma barra por prioridade
   - Cada barra dividida: response (sky) + resolution (red)
   - SVG puro

7. Crie `app/(dashboard)/relatorios/breach/_components/BreachTimelineChart.tsx`:
   - Gráfico de linha/área mostrando breaches por mês
   - 2 séries: response (sky) e resolution (red)
   - Identifica tendência (piorando ou melhorando)

### Layout com Abas

8. Use shadcn/ui Tabs:
   - **Resumo**: KPIs + gráfico de prioridade + timeline
   - **Por Técnico**: tabela de técnicos
   - **Por Unidade**: tabela de unidades
   - **Por Tipo de Serviço**: tabela similar

### Navegação

9. Em `components/dashboard/nav.ts`, adicione item:
   - label: "Relatório de Breaches"
   - href: "/relatorios/breach"
   - icon: `TrendingDown` do Lucide
   - roles: ['Admin', 'Preposto']
   - Grupo: "Gestão" (junto com IMR)

### Exportação CSV

10. Adicione botão "Exportar CSV":
    - Gera download com técnicos/unidades com breach rate > 0
    - Colunas: Nome, Total, Response Breach, Resolution Breach, Taxa, Atraso Médio
    - Use Blob + URL.createObjectURL no client

## Métricas Calculadas

| Métrica        | Fórmula                                                        |
| -------------- | -------------------------------------------------------------- |
| Taxa de breach | (responseBreaches + resolutionBreaches) / totalChamados × 100  |
| Atraso médio   | avg(resolvedAt - resolutionDueAt) para breaches com resolvedAt |
| Tendência      | Comparação breach rate mês atual vs anterior                   |

## Regras

- Só considerar chamados com SLA computado (sla.computedAt dentro do range)
- breachRate = 0 para técnicos sem chamados no período (não listar)
- Atraso médio = null se nenhum breach com resolvedAt
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Design: shadcn/ui, rounded-2xl, indigo/blue palette
- Rode `npm run lint` ao final
