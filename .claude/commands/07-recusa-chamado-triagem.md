# Recusa de Chamado na Triagem/Validação

Prioridade: 7 (solicitação stakeholder Maurício) | Complexidade: Média | Dependências: Nenhuma

## Objetivo

Permitir que Admin/Preposto recuse um chamado com status "aberto" durante a triagem, com justificativa obrigatória e orientação opcional ao solicitante. O chamado recusado recebe status terminal `recusado` (distinto de `cancelado`).

## Contexto do Projeto

- **classificarChamadoAction**: `app/(dashboard)/gestao/actions.ts` — hoje só permite aberto → validado
- **ClassificarChamadoDialog**: `app/(dashboard)/gestao/_components/ClassificarChamadoDialog.tsx`
- **gestao/page.tsx**: Kanban com botão "Classificar" para status 'aberto'
- **chamado.constants.ts**: `shared/chamados/chamado.constants.ts` — CHAMADO_STATUSES
- **history.constants.ts**: `shared/chamados/history.constants.ts` — HISTORY_ACTIONS
- **ChamadoCard**: `app/(dashboard)/meus-chamados/_components/ChamadoCard.tsx`
- **\_constants.ts**: `app/(dashboard)/meus-chamados/_constants.ts` — STATUS_ICONS, STATUS_ACCENT, STATUS_BADGE
- **Detalhe**: `app/(dashboard)/meus-chamados/[id]/page.tsx`
- **Model Chamado**: `models/Chamado.ts`
- **Socket**: `shared/socket.ts`, `lib/realtime-emit.ts`
- **Notification**: `models/Notification.ts`
- **Pattern de Server Action**: requireManager → safeParse → dbConnect → findById → updateOne → ChamadoHistory.create → NotificationModel.create → emitToRoom → revalidatePath → return {ok}

## Arquivos a Criar (2)

1. `shared/chamados/rejection.schemas.ts` — RejectTicketSchema Zod (chamadoId, rejectionReason min 10 max 1000, rejectionGuidance optional max 1000)
2. `app/(dashboard)/gestao/_components/RecusarChamadoDialog.tsx` — Dialog com justificativa obrigatória + orientação opcional + banner irreversibilidade + botão destructive

## Arquivos a Modificar (10)

1. `shared/chamados/chamado.constants.ts` — Adicionar `'recusado'` ao CHAMADO_STATUSES + label "Recusado"
2. `shared/chamados/history.constants.ts` — Adicionar `'recusa'` ao CHAMADO_HISTORY_ACTIONS + label "Recusa do Chamado"
3. `models/Chamado.ts` — Campos: rejectedAt (Date), rejectedByUserId (ObjectId ref User), rejectionReason (String), rejectionGuidance (String)
4. `models/Notification.ts` — Adicionar `'ticket:rejected'` ao NOTIFICATION_TYPES
5. `shared/socket.ts` — Interface TicketRejectedPayload + evento `'ticket:rejected'` em ServerToClientEvents
6. `lib/realtime-emit.ts` — Adicionar `'ticket:rejected'` ao AllowedEmitEvents + TicketRejectedPayload na union de payload
7. `app/(dashboard)/gestao/actions.ts` — Import RejectTicketSchema + tipo RejectTicketResult + export async function rejectTicketAction
8. `app/(dashboard)/meus-chamados/_components/ChamadoCard.tsx` — Prop `onRecusar`, handler, botão Ban rose/outline ao lado de Classificar
9. `app/(dashboard)/meus-chamados/_constants.ts` — STATUS_ICONS[recusado]=Ban, STATUS_ACCENT[recusado]=rose, STATUS_BADGE[recusado]=rose
10. `app/(dashboard)/gestao/page.tsx` — Import RecusarChamadoDialog, state recusarDialogOpen, handleRecusar, handleRecusarDialogClose, passar onRecusar para 'aberto', render dialog
11. `app/(dashboard)/meus-chamados/[id]/page.tsx` — Tipo ChamadoDetailDTO com campos rejection, bloco visual rose com justificativa/orientação quando status=recusado, excluir recusado de showOwnerCancel e canUpload

## Detalhes da Server Action (rejectTicketAction)

```
1. requireManager()
2. RejectTicketSchema.safeParse(raw) — rejectionReason obrigatório min 10
3. dbConnect()
4. findById(chamadoId) → status deve ser 'aberto'
5. updateOne: status='recusado', rejectedAt, rejectedByUserId, rejectionReason, rejectionGuidance
6. ChamadoHistoryModel.create: action='recusa', statusAnterior='aberto', statusNovo='recusado', observacoes com justificativa
7. NotificationModel.create: type='ticket:rejected', para solicitanteId
8. emitToRoom(`user:${solicitanteId}`, 'ticket:rejected', payload)
9. revalidatePath('/gestao') + revalidatePath('/meus-chamados/${chamadoId}')
10. return { ok: true }
```

## Detalhes do Dialog (RecusarChamadoDialog)

- Segue pattern do ClassificarChamadoDialog (mesma estrutura de props, form, submit)
- Header: ícone Ban rose + "Recusar Chamado"
- Info block: ticket_number, titulo
- Banner amber: "Esta ação é irreversível..."
- Campo 1: Justificativa da Recusa (textarea, required, min 10, contador X/1000)
- Campo 2: Orientação ao Solicitante (textarea, optional)
- Footer: Cancelar (outline) + Recusar Chamado (destructive + ícone Ban)
- Usa zodResolver com RejectTicketSchema.omit({ chamadoId: true })

## Transição de Status

```
aberto → recusado (Admin/Preposto, via rejectTicketAction)
```

- `recusado` é terminal (não reabre)
- Solicitante deve abrir novo chamado seguindo a orientação
- Cor visual: rose (diferencia de cancelado=red)

## Verificação

1. `npm run lint` — zero erros
2. `npm run build` — build bem-sucedido
3. Teste manual:
   - Kanban gestão: coluna "Aberto" mostra botão "Recusar" ao lado de "Classificar"
   - Clicar "Recusar" → dialog abre → preencher justificativa → submit
   - Chamado muda para "Recusado" no Kanban
   - Página de detalhe (solicitante) exibe bloco rose com justificativa e orientação
   - Histórico mostra "Recusa do Chamado"

## Regras

- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse, nunca throw
- Return pattern: { ok: true } ou { ok: false, error: '...' }
- Design: shadcn/ui, rounded-2xl, rose para recusa, indigo/blue para resto
- Rode `npm run lint` ao final
