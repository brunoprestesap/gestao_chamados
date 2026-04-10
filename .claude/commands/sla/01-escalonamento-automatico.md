# Escalonamento Automático de SLA

Prioridade: 1 (alto impacto) | Complexidade: Alta | Dependências: Cron job ou API periódica

## Objetivo

Notificar automaticamente gestores quando o SLA de um chamado atinge 80% do prazo (alerta de proximidade) e notificar nível superior (Admin/diretor) quando ocorre breach (estouro). Hoje o breach só é detectado no momento da execução — não há monitoramento proativo.

## Contexto do Projeto

### Cálculo de SLA existente
- **computeSlaDueDatesFromConfig()**: `lib/sla-utils.ts` (linha 65) — calcula responseDueAt e resolutionDueAt no momento da classificação
- **evaluateResolutionBreach()**: `lib/sla-utils.ts` (linha 116) — detecta breach pontualmente (chamado no registerExecutionAction)
- **getSlaResolutionStatus()**: `lib/sla-utils.ts` (linha 138) — retorna 'no_prazo' | 'proximo_vencimento' | 'atrasado' (usado apenas em UI)
- **Subdocumento SLA no Chamado**: `models/Chamado.ts` (linhas 119-133) — responseDueAt, resolutionDueAt, responseBreachedAt, resolutionBreachedAt, pausedMinutes

### Notificações existentes
- **NotificationModel**: `models/Notification.ts` — 9 tipos (nenhum de SLA/breach)
- **emitToRoom()**: `lib/realtime-emit.ts` — fire-and-forget para socket rooms (`user:<id>`, `managers`)
- **Socket events**: `shared/socket.ts` — ServerToClientEvents com payloads tipados
- **socket-server**: `socket-server/src/index.ts` — ALLOWED_EVENTS whitelist, rooms auto-join

### Statuses ativos para monitoramento
- Chamados com SLA computado e não encerrados: status in ['validado', 'em atendimento', 'aguardando_solicitante']
- `ACTIVE_STATUSES` em `app/(dashboard)/gestao/actions.ts` (linha 47): ['emvalidacao', 'validado', 'em atendimento']

### Business hours
- **getBusinessCalendarConfig()**: `lib/expediente-config.ts` — timezone, workdayStart, workdayEnd, weekdays
- **Holidays**: `lib/holidays.ts` — getActiveHolidaysForRange()
- **Timezone**: `lib/sla-timezone.ts` — addBusinessMinutesWithConfig(), isWithinBusinessHours()

## Tarefas

### Modelo de Escalonamento

1. Crie `models/SlaEscalation.ts`:
   - `chamadoId` (ObjectId, ref: Chamado, required, indexed)
   - `type` (enum: `'warning_80'` | `'breach_response'` | `'breach_resolution'`)
   - `level` (enum: `'manager'` | `'admin'`)
   - `notifiedAt` (Date, required)
   - `notifiedUserIds` ([ObjectId], ref: User)
   - Timestamps: true
   - Index: `{ chamadoId: 1, type: 1 }` (unique — evita notificação duplicada)

### Notification types e Socket events

2. Em `models/Notification.ts`, adicione ao NOTIFICATION_TYPES:
   - `'sla:warning'` — SLA próximo do vencimento (80%)
   - `'sla:breach'` — SLA estourou

3. Em `shared/socket.ts`, adicione:
   ```typescript
   export interface SlaWarningPayload {
     ticketId: string;
     ticketNumber?: string;
     title?: string;
     priority: string;
     type: 'response' | 'resolution';
     dueAt: string;
     remainingPercent: number;
     at: string;
   }

   export interface SlaBreachPayload {
     ticketId: string;
     ticketNumber?: string;
     title?: string;
     priority: string;
     type: 'response' | 'resolution';
     dueAt: string;
     breachedAt: string;
     at: string;
   }
   ```
   Adicione em ServerToClientEvents: `'sla:warning'` e `'sla:breach'`

4. Em `lib/realtime-emit.ts`, adicione `'sla:warning'` e `'sla:breach'` ao AllowedEmitEvents e os payloads na union

5. Em `socket-server/src/index.ts`, adicione `'sla:warning'` e `'sla:breach'` ao ALLOWED_EVENTS

### Serviço de Monitoramento

6. Crie `lib/sla-monitor.ts`:

   **`checkSlaEscalations()`**:
   - dbConnect()
   - Busque chamados com SLA computado e status ativo:
     ```
     ChamadoModel.find({
       status: { $in: ['validado', 'em atendimento', 'aguardando_solicitante'] },
       'sla.resolutionDueAt': { $ne: null },
       'sla.resolvedAt': null,
     }).lean()
     ```
   - Para cada chamado, calcule:
     - `totalMs = resolutionDueAt - computedAt`
     - `elapsedMs = now - computedAt - (pausedMinutes * 60000)`
     - `remainingPercent = Math.max(0, (1 - elapsedMs / totalMs) * 100)`
   - **Regra 80% (warning)**:
     - Se `remainingPercent <= 20` e não existe SlaEscalation(chamadoId, 'warning_80'):
       - Crie SlaEscalation com type='warning_80', level='manager'
       - Crie Notification para todos Preposto/Admin com type='sla:warning'
       - emitToRoom('managers', 'sla:warning', payload)
   - **Regra breach (response)**:
     - Se `now > responseDueAt` e `sla.responseBreachedAt` é null e `sla.responseStartedAt` é null:
       - Se não existe SlaEscalation(chamadoId, 'breach_response'):
         - Crie SlaEscalation com type='breach_response', level='admin'
         - Crie Notification para Admin com type='sla:breach'
         - emitToRoom('managers', 'sla:breach', payload)
         - Marque `sla.responseBreachedAt = now` no chamado
   - **Regra breach (resolution)**:
     - Se `now > resolutionDueAt` e `sla.resolutionBreachedAt` é null:
       - Se não existe SlaEscalation(chamadoId, 'breach_resolution'):
         - Crie SlaEscalation com type='breach_resolution', level='admin'
         - Crie Notification para Admin com type='sla:breach'
         - emitToRoom('managers', 'sla:breach', payload)
         - Marque `sla.resolutionBreachedAt = now` no chamado
   - Retorne relatório: `{ checked, warnings, breaches }`

   **Para chamados `aguardando_solicitante`**: desconte `totalPausedMinutes` do tempo decorrido. Se `slaPausedAt` está set (pausa ativa), desconte também o tempo desde slaPausedAt até now.

### API Route para Cron

7. Crie `app/api/cron/sla-monitor/route.ts`:
   - POST: protegida por header `x-cron-secret` (env `CRON_SECRET`)
   - Chama `checkSlaEscalations()`
   - Retorna relatório JSON
   - Sugestão de intervalo: a cada 15 minutos

### Configuração do Cron

8. Documente a configuração:
   - **Docker**: `*/15 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/sla-monitor`
   - Adicione `CRON_SECRET` ao `.env.example` se não existir

### UI — Indicador visual no ChamadoCard

9. No `ChamadoCard`, quando SLA status for 'proximo_vencimento', adicione tooltip com tempo restante estimado (ex: "Vence em ~2h"). A lógica já existe em `getSlaDisplayStatus()` — adicione formatação do tempo restante.

### UI — Notificação no sino

10. No componente de notificações (sino no header), as notificações de tipo `sla:warning` e `sla:breach` devem exibir:
    - warning: ícone amber, texto "SLA do chamado CHM-XXXX próximo do vencimento"
    - breach: ícone vermelho, texto "SLA do chamado CHM-XXXX estourou"

## Regras de Escalonamento

| Condição | Nível | Notifica | Evento |
|---|---|---|---|
| ≤20% tempo restante | manager | Preposto + Admin | sla:warning |
| Response breach (responseDueAt ultrapassado sem resposta) | admin | Admin | sla:breach |
| Resolution breach (resolutionDueAt ultrapassado sem resolução) | admin | Admin | sla:breach |

## Regras Técnicas

- O job deve ser idempotente — usar SlaEscalation como registro de "já notificado"
- Respeitar `pausedMinutes` e `slaPausedAt` no cálculo do tempo restante
- Não notificar para chamados com status terminal (encerrado, cancelado, recusado)
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse onde aplicável, nunca throw
- Rode `npm run lint` ao final
