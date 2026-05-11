# Pausas de SLA — Dependência de Terceiros

Prioridade: 2 | Complexidade: Média | Dependências: Nenhuma (estende mecanismo existente de pausa)

## Objetivo

Permitir que técnicos e gestores pausem o SLA quando o chamado depende de terceiros (fornecedor externo, peça em estoque, aprovação de orçamento), com motivo categorizado e rastreabilidade completa. Hoje só existe pausa "Aguardando Solicitante" — não há pausa para dependências externas.

## Contexto do Projeto

### Mecanismo de pausa existente

- **Status `aguardando_solicitante`**: `shared/chamados/chamado.constants.ts` — pausa SLA quando técnico aguarda resposta do solicitante
- **pauseForRequesterAction()**: `app/(dashboard)/chamados-atribuidos/actions.ts` — muda status para aguardando_solicitante, seta `slaPausedAt`
- **resumeFromRequesterAction()**: `app/(dashboard)/chamados-atribuidos/actions.ts` — calcula pausedMinutes, ajusta `sla.resolutionDueAt`, incrementa `totalPausedMinutes` e `sla.pausedMinutes`
- **Campos no Chamado**: `slaPausedAt` (Date), `totalPausedMinutes` (Number), `sla.pausedMinutes` (Number)

### Limitação atual

- Apenas 1 motivo de pausa (aguardando solicitante)
- Não distingue se a pausa é por dependência externa, falta de material, etc.
- Relatórios não conseguem categorizar causas de atraso

## Tarefas

### Constants e Enums

1. Crie `shared/chamados/pause-reason.constants.ts`:

   ```typescript
   export const PAUSE_REASONS = [
     'aguardando_solicitante',
     'aguardando_fornecedor',
     'aguardando_peca',
     'aguardando_aprovacao',
     'aguardando_acesso',
     'outro',
   ] as const;
   export type PauseReason = (typeof PAUSE_REASONS)[number];

   export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
     aguardando_solicitante: 'Aguardando Solicitante',
     aguardando_fornecedor: 'Aguardando Fornecedor',
     aguardando_peca: 'Aguardando Peça/Material',
     aguardando_aprovacao: 'Aguardando Aprovação',
     aguardando_acesso: 'Aguardando Acesso ao Local',
     outro: 'Outro Motivo',
   };
   ```

2. Em `shared/chamados/history.constants.ts`, adicione actions:
   - `'pausa_terceiros'` (label: "Pausa — Aguardando Terceiros")
   - `'retomada_terceiros'` (label: "Retomada — Terceiros Resolvido")

### Model Chamado — Campos adicionais

3. Em `models/Chamado.ts`, adicione:
   - `pauseReason` (String, enum: PAUSE_REASONS, required: false) — motivo da pausa atual
   - `pauseDetails` (String, default: '', trim: true) — detalhes quando motivo='outro' ou informações do fornecedor

### Modelo de Histórico de Pausas

4. Crie `models/PauseLog.ts` para rastreabilidade detalhada:
   - `chamadoId` (ObjectId, ref: Chamado, required, indexed)
   - `reason` (String, enum: PAUSE_REASONS, required)
   - `details` (String, trim: true)
   - `pausedAt` (Date, required)
   - `resumedAt` (Date, optional — null se ainda pausado)
   - `pausedMinutes` (Number, optional — calculado ao resumir)
   - `pausedByUserId` (ObjectId, ref: User, required)
   - `resumedByUserId` (ObjectId, ref: User, optional)
   - Timestamps: true
   - Index: `{ chamadoId: 1, pausedAt: -1 }`

### Schemas Zod

5. Atualize `shared/chamados/pause.schemas.ts`:
   - Crie `PauseTicketSchema`:
     - `ticketId` (string ObjectId)
     - `reason` (enum PAUSE_REASONS)
     - `details` (string, optional, max 1000 — obrigatório se reason='outro')
   - Crie `ResumeTicketSchema`:
     - `ticketId` (string ObjectId)
   - Mantenha os schemas antigos para compatibilidade ou migre as actions existentes

### Novo Status

6. Em `shared/chamados/chamado.constants.ts`:
   - Adicione `'aguardando_terceiros'` ao CHAMADO_STATUSES
   - Label: "Aguardando Terceiros"

7. Em `app/(dashboard)/meus-chamados/_constants.ts`:
   - STATUS_ICONS: `Package` ou `Truck` do Lucide
   - STATUS_ACCENT: `border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20`
   - STATUS_BADGE: `bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800`

### Server Actions

8. Refatore/crie actions em `app/(dashboard)/chamados-atribuidos/actions.ts`:

   **`pauseTicketAction(raw: PauseTicketInput)`**:
   - requireSession() — técnico atribuído, Admin ou Preposto
   - Valide status === 'em atendimento'
   - Se reason === 'aguardando_solicitante': status → `aguardando_solicitante`
   - Se reason !== 'aguardando_solicitante': status → `aguardando_terceiros`
   - Sete `slaPausedAt = now`, `pauseReason`, `pauseDetails`
   - Crie PauseLog com pausedAt, reason, details
   - ChamadoHistory.create com action adequada ('aguardando_solicitante' ou 'pausa_terceiros')
   - emitToRoom: notifique managers
   - revalidatePath

   **`resumeTicketAction(raw: ResumeTicketInput)`**:
   - requireSession() — técnico atribuído, Admin ou Preposto
   - Valide status in ['aguardando_solicitante', 'aguardando_terceiros']
   - Calcule pausedMinutes, ajuste resolutionDueAt (lógica existente)
   - Atualize PauseLog mais recente com resumedAt e pausedMinutes
   - Limpe `slaPausedAt`, `pauseReason`, `pauseDetails`
   - Retorne status para 'em atendimento'
   - ChamadoHistory.create ('retomada_atendimento' ou 'retomada_terceiros')
   - emitToRoom
   - revalidatePath

### UI — Dialog de Pausa Aprimorado

9. Crie ou refatore `app/(dashboard)/chamados-atribuidos/_components/PauseTicketDialog.tsx`:
   - Select/Radio para escolher o motivo (PAUSE_REASONS com labels)
   - Textarea para detalhes (obrigatório se motivo='outro', opcional para outros)
   - Preview: "O SLA será pausado até que o atendimento seja retomado"
   - Botão: "Pausar Atendimento"

10. No dialog de retomada, exiba:
    - Motivo da pausa original
    - Tempo total pausado até o momento
    - Botão: "Retomar Atendimento"

### UI — Indicadores na Página de Detalhe

11. Em `app/(dashboard)/meus-chamados/[id]/page.tsx` e `app/(dashboard)/chamados-atribuidos/[id]/page.tsx`:
    - Quando chamado está pausado, exiba badge com motivo da pausa e label legível
    - Exiba histórico de pausas (via PauseLog) — mini timeline: "Pausado por X (motivo) → Retomado por Y (Xmin pausados)"

### Kanban

12. Em `app/(dashboard)/gestao/page.tsx`:
    - Adicione coluna `aguardando_terceiros` no Kanban (se COLUMN_CONFIG existir, adicione entrada com cores orange)

## Transições de Status

```
em_atendimento → aguardando_solicitante  (reason: aguardando_solicitante)
em_atendimento → aguardando_terceiros    (reason: outros motivos)
aguardando_solicitante → em_atendimento  (retomada)
aguardando_terceiros → em_atendimento    (retomada)
aguardando_terceiros → cancelado         (Admin/Preposto)
```

## Regras

- A pausa congela o SLA de resolução (não o de resposta — resposta já deve ter ocorrido)
- Múltiplas pausas são acumulativas (totalPausedMinutes incrementa)
- O PauseLog permite relatório futuro de "tempo parado por motivo"
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse, nunca throw
- Rode `npm run lint` ao final
