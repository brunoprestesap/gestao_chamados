# Status "Aguardando Solicitante" com Pausa de SLA

Prioridade: 5 | Complexidade: Alta | Dependências: Ajuste no cálculo de SLA

## Objetivo

Adicionar status intermediário `aguardando_solicitante` que pausa a contagem do SLA quando o técnico aguarda resposta, presença ou ação do solicitante. Garante justiça na medição de performance do técnico.

## Contexto do Projeto

- **Statuses atuais**: `shared/chamados/chamado.constants.ts` — CHAMADO_STATUSES = ['aberto', 'emvalidacao', 'validado', 'em atendimento', 'fechado', 'concluído', 'encerrado', 'cancelado']
- **History actions**: `shared/chamados/history.constants.ts` — 13 actions definidas
- **Model Chamado**: `models/Chamado.ts` — subdocumento `sla` com responseDueAt, resolutionDueAt, resolvedAt, resolutionBreachedAt
- **SLA utils**: `lib/sla-utils.ts` e `lib/sla-timezone.ts` — cálculo de breach e datas SLA
- **registerExecutionAction**: `app/(dashboard)/chamados-atribuidos/actions.ts` — avalia breach no momento da execução
- **UI badges/ícones por status**: `app/(dashboard)/meus-chamados/_constants.ts`
- **Kanban pages**: `app/(dashboard)/meus-chamados/page.tsx` e `app/(dashboard)/gestao/page.tsx`
- **Detalhe do chamado atribuído**: `app/(dashboard)/chamados-atribuidos/[id]/page.tsx`

## Tarefas

### Constants e Enums

1. Em `shared/chamados/chamado.constants.ts`:
   - Adicione `'aguardando_solicitante'` ao array `CHAMADO_STATUSES` (entre 'em atendimento' e 'concluído')
   - Se houver labels/mappings no arquivo, adicione o correspondente

2. Em `shared/chamados/history.constants.ts`:
   - Adicione actions: `'aguardando_solicitante'` (label: "Aguardando solicitante") e `'retomada_atendimento'` (label: "Atendimento retomado")

### Model Chamado

3. Em `models/Chamado.ts`:
   - Adicione `'aguardando_solicitante'` ao enum de status
   - Adicione campo `slaPausedAt` (Date, optional) — momento em que SLA foi pausado
   - Adicione campo `totalPausedMinutes` (Number, default: 0) — acumulador de tempo pausado
   - No subdocumento `sla`, adicione `pausedMinutes` (Number, default: 0) — espelho para snapshot

### Schemas Zod

4. Crie `shared/chamados/pause.schemas.ts`:
   - `PauseForRequesterSchema`: ticketId (string ObjectId), reason (string, min 10, max 2000)
   - `ResumeFromRequesterSchema`: ticketId (string ObjectId)
   - Exporte types: `PauseForRequesterInput`, `ResumeFromRequesterInput`

### Server Actions

5. Em `app/(dashboard)/chamados-atribuidos/actions.ts`, crie:

   **`pauseForRequesterAction(raw: PauseForRequesterInput)`**:
   - requireSession() — apenas técnico atribuído, Admin ou Preposto
   - Valide status atual === 'em atendimento'
   - Update atômico: status → 'aguardando_solicitante', slaPausedAt = new Date()
   - ChamadoHistory.create: action 'aguardando_solicitante', observacoes = reason
   - emitToRoom: notifique solicitante (`user:<solicitanteId>`) e managers
   - revalidatePath

   **`resumeFromRequesterAction(raw: ResumeFromRequesterInput)`**:
   - requireSession() — técnico atribuído, Admin ou Preposto
   - Valide status atual === 'aguardando_solicitante'
   - Calcule minutos pausados: `Math.round((Date.now() - slaPausedAt.getTime()) / 60000)`
   - Update atômico:
     - status → 'em atendimento'
     - `$inc: { totalPausedMinutes: pausedMinutes }`
     - `$inc: { 'sla.pausedMinutes': pausedMinutes }`
     - `$unset: { slaPausedAt: 1 }`
   - Ajuste `sla.resolutionDueAt`: some `pausedMinutes` minutos à data atual de vencimento (respeitando horário de expediente se businessHoursOnly)
   - ChamadoHistory.create: action 'retomada_atendimento', observacoes com tempo pausado
   - emitToRoom: notifique solicitante e managers
   - revalidatePath

### Ajuste no Cálculo de Breach

6. Em `registerExecutionAction` (`app/(dashboard)/chamados-atribuidos/actions.ts`):
   - Se status atual for 'aguardando_solicitante', primeiro retome (calcule pausa) antes de registrar execução, OU bloqueie e exija retomada primeiro
   - Ao avaliar `resolutionBreachedAt`, desconte `totalPausedMinutes` do tempo decorrido:
     ```
     tempoEfetivo = (resolvedAt - classifiedAt) - totalPausedMinutes
     breached = tempoEfetivo > resolutionTargetMinutes
     ```

7. Se existir cálculo de breach em `lib/sla-utils.ts`, ajuste para receber `pausedMinutes` como parâmetro opcional

### UI — Badges e Cores

8. Em `app/(dashboard)/meus-chamados/_constants.ts`:
   - Adicione entrada para `'aguardando_solicitante'`:
     - Badge: amber/yellow (bg-amber-100 text-amber-800)
     - Ícone: `Clock` ou `Hourglass` do Lucide
     - Accent stripe: amber gradient

### UI — Cards

9. No `ChamadoCard`: o novo status será renderizado automaticamente se os mappings estiverem corretos em _constants.ts. Verifique que o badge e ícone aparecem corretamente.

### UI — Botões de Ação

10. Em `app/(dashboard)/chamados-atribuidos/[id]/page.tsx` (detalhe do chamado para técnico):
    - Se status === 'em atendimento': exiba botão "Aguardando Solicitante" (ícone Clock, variante outline amber)
    - Se status === 'aguardando_solicitante': exiba botão "Retomar Atendimento" (ícone Play, variante default)
    - Cada botão abre dialog com campo de motivo (para pause) ou confirmação (para resume)

11. Crie dialogs:
    - `PauseForRequesterDialog`: textarea para motivo (min 10 chars), botão confirmar
    - `ResumeFromRequesterDialog`: confirmação com exibição do tempo pausado até o momento

### UI — Kanban

12. Em `app/(dashboard)/meus-chamados/page.tsx` e `app/(dashboard)/gestao/page.tsx`:
    - Adicione coluna `aguardando_solicitante` no Kanban (entre 'em atendimento' e 'concluído')
    - Cor da coluna: amber

### Transições Permitidas (validar nas actions)

```
em_atendimento → aguardando_solicitante  (técnico, Admin, Preposto)
aguardando_solicitante → em_atendimento  (técnico, Admin, Preposto)
aguardando_solicitante → cancelado       (Admin, Preposto)
```

Bloquear: `aguardando_solicitante` → `concluído` (deve retomar antes)

## Regras

- O tempo pausado deve ser acumulativo (múltiplas pausas somam)
- A pausa só afeta o SLA de resolução (resolutionDueAt), não o de resposta
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse, nunca throw
- Use update atômico ($set, $inc, $unset) para evitar race conditions
- Rode `npm run lint` ao final
