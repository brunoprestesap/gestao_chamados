# Dashboard de SLA em Tempo Real

Prioridade: 3 | Complexidade: Média | Dependências: Nenhuma

## Objetivo

Criar página de dashboard dedicada ao SLA com visão em tempo real de todos os chamados ativos, incluindo countdown visual, gráfico de "saúde" e alertas de proximidade de vencimento. Hoje a informação de SLA está dispersa nos cards individuais — não existe visão consolidada.

## Contexto do Projeto

### Dados de SLA disponíveis

- **Subdocumento SLA no Chamado**: `models/Chamado.ts` (linhas 119-133) — responseDueAt, resolutionDueAt, resolvedAt, responseBreachedAt, resolutionBreachedAt, pausedMinutes, computedAt, priority, businessHoursOnly
- **getSlaResolutionStatus()**: `lib/sla-utils.ts` (linha 138) — retorna 'no_prazo' | 'proximo_vencimento' | 'atrasado'
- **Statuses ativos**: validado, em atendimento, aguardando_solicitante (com SLA computado)
- **Campos de pausa**: slaPausedAt, totalPausedMinutes, sla.pausedMinutes

### APIs existentes

- **GET /api/gestao/chamados**: retorna chamados com filtro (requer manager)
- **GET /api/sla/configs**: retorna configurações SLA ativas
- **Timezone**: `lib/expediente-config.ts` — getBusinessCalendarConfig()

### Componentes de dashboard existentes

- **KPI Card**: `components/dashboard/kpi-card.tsx` — métricas com título, valor, helper text, ícone
- **PageHeader**: `components/dashboard/header.tsx` — título + subtítulo + actions
- **Design system**: rounded-2xl, accent stripes, glass effects, indigo/blue palette

### Navegação

- **Nav items**: `components/dashboard/nav.ts` — itens filtrados por role

## Tarefas

### API Route dedicada

1. Crie `app/api/sla/dashboard/route.ts`:
   - GET: requireManager()
   - Busque chamados ativos com SLA:
     ```
     ChamadoModel.find({
       status: { $in: ['validado', 'em atendimento', 'aguardando_solicitante', 'aguardando_terceiros'] },
       'sla.resolutionDueAt': { $ne: null },
       'sla.resolvedAt': null,
     })
     .select('ticket_number titulo status tipoServico finalPriority assignedToUserId sla slaPausedAt totalPausedMinutes createdAt')
     .lean()
     ```
   - Para cada chamado, calcule no server:
     - `remainingMs`: tempo restante até resolutionDueAt (descontando pausas)
     - `totalMs`: tempo total do SLA
     - `percentUsed`: percentual do SLA consumido
     - `slaStatus`: 'no_prazo' | 'proximo_vencimento' | 'atrasado'
   - Retorne também agregações:
     - `summary`: { total, noPrazo, proximoVencimento, atrasado }
     - `byPriority`: contagem por prioridade e status SLA
     - `byTipoServico`: contagem por tipo de serviço e status SLA
   - Retorno: `{ items: [...], summary: {...}, byPriority: [...], byTipoServico: [...] }`

### Página do Dashboard

2. Crie `app/(dashboard)/sla/dashboard/page.tsx`:
   - requireManager() via server component wrapper ou client-side redirect
   - Polling a cada 60 segundos (useEffect + setInterval)
   - Layout: header + KPIs + gráfico + tabela

### Componentes

3. Crie `app/(dashboard)/sla/dashboard/_components/SlaKpiCards.tsx`:
   - 4 KPI Cards em grid responsivo (1 col mobile, 2 col sm, 4 col lg):
     - **Total Ativos**: número total com SLA ativo (ícone Timer, cor sky)
     - **No Prazo**: quantidade no prazo (ícone CheckCircle, cor emerald)
     - **Próximo Vencimento**: quantidade em risco (ícone AlertTriangle, cor amber)
     - **Atrasados**: quantidade em breach (ícone XCircle, cor red)
   - Cada card com percentual em relação ao total

4. Crie `app/(dashboard)/sla/dashboard/_components/SlaHealthChart.tsx`:
   - Gráfico donut/ring: no_prazo (emerald), proximo_vencimento (amber), atrasado (red)
   - SVG puro (sem dependência externa)
   - Centro do donut: "X% saudável" (percentual no prazo)
   - Legenda abaixo com contagens

5. Crie `app/(dashboard)/sla/dashboard/_components/SlaTicketTable.tsx`:
   - Tabela ordenada por urgência (atrasados primeiro, depois próximo vencimento, depois no prazo)
   - Colunas:
     - Número do chamado (link para detalhe)
     - Status (badge colorido)
     - Prioridade (badge)
     - Tipo de serviço
     - Countdown visual: tempo restante formatado ("2h 30min", "15min", "Atrasado 1h 20min")
     - Barra de progresso visual: verde → amarelo → vermelho conforme % consumido
     - Técnico atribuído (nome)
   - Filtros inline: prioridade, tipo de serviço, status SLA
   - Ordenação por coluna (default: urgência)

6. Crie `app/(dashboard)/sla/dashboard/_components/SlaCountdown.tsx`:
   - Componente reutilizável de countdown
   - Props: `dueAt: Date`, `computedAt: Date`, `pausedMinutes: number`, `isPaused: boolean`
   - Atualiza a cada minuto (useEffect + setInterval)
   - Cores: verde (>40%), amarelo (20-40%), vermelho (<20%), pulsante se atrasado
   - Formato: "2d 4h", "3h 15min", "45min", "-1h 20min" (negativo se atrasado)

7. Crie `app/(dashboard)/sla/dashboard/_components/SlaPriorityBreakdown.tsx`:
   - Grid de cards por prioridade (BAIXA, NORMAL, ALTA, EMERGENCIAL)
   - Cada card: contagem total, no prazo, risco, atrasado
   - Mini barra de progresso por prioridade

### Navegação

8. Em `components/dashboard/nav.ts`, adicione item:
   - label: "Dashboard SLA"
   - href: "/sla/dashboard"
   - icon: `Gauge` do Lucide
   - roles: ['Admin', 'Preposto']
   - Grupo: "Gestão"

### Auto-refresh

9. Implemente polling no client:
   - useEffect com setInterval a cada 60 segundos
   - Indicador visual "Atualizado há Xs" no header
   - Botão manual "Atualizar agora"
   - Opcional: integrar com Socket.IO para refresh instantâneo

## Layout Sugerido

```
┌─────────────────────────────────────────────────────┐
│ Dashboard SLA          Atualizado há 30s  [Atualizar]│
├──────────┬──────────┬──────────┬──────────┤          │
│ Total    │ No Prazo │ Risco    │ Atrasado │          │
│  24      │  18 (75%)│  4 (17%) │  2 (8%)  │          │
├──────────┴──────────┼──────────┴──────────┤          │
│ Saúde Geral [donut] │ Por Prioridade      │          │
│   75% saudável      │ EMERGENCIAL: 2/2 OK │          │
│                     │ ALTA: 3/5 (1 risco) │          │
├─────────────────────┴─────────────────────┤          │
│ Chamados com SLA Ativo                    │          │
│ [Filtros: Prioridade | Tipo | Status SLA] │          │
│ ┌─────┬────────┬─────┬───────┬──────────┐ │          │
│ │ #   │ Status │ Pri │ Tempo │ Técnico  │ │          │
│ │ 042 │ Atras. │ ALTA│ -1h20 │ João     │ │          │
│ │ 038 │ Risco  │ NORM│  2h30 │ Maria    │ │          │
│ │ 045 │ OK     │ BAIX│ 3d 2h │ Pedro    │ │          │
│ └─────┴────────┴─────┴───────┴──────────┘ │          │
└─────────────────────────────────────────────────────┘
```

## Regras

- Todos os cálculos de tempo devem respeitar timezone institucional (America/Belem)
- Descontar pausedMinutes e tempo de pausa ativa (slaPausedAt) do cálculo
- businessHoursOnly: se true, countdown só decrementa em horário de expediente
- Polling: 60s no client; nunca bloquear UI durante fetch
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Design: shadcn/ui, rounded-2xl, indigo/blue palette, accent stripes nos cards
- Rode `npm run lint` ao final
