# Padrões recorrentes observados no projeto Sigma

## Padrões BONS

- Server Actions seguem o pattern correto: requireSession → dbConnect → safeParse → DB → History → emit → revalidatePath → return {ok:true/false}
- `emitToRoom()` é sempre fire-and-forget (sem await no sentido de que falha não quebra fluxo)
- `updateOne` com atomic filter (inclui status na query) para evitar race conditions
- `insertMany` para notificações em bulk para managers (mais eficiente que loop de `create`)
- Zod schemas em `shared/<domain>/` com `safeParse` (nunca throw)

## Padrões RUINS / Anti-patterns encontrados

### N+1 no cliente (MaterialObservationsList)
- `components/chamado/MaterialObservationsList.tsx`: componente `UserName` faz fetch individual
  para cada observação na montagem. Com N observações = N requests ao `/api/users/:id`.
  **Fix**: passar `createdByName` no DTO ou buscar todos os userIds de uma vez.

### Código duplicado: normalização de materialObservations
- Exatamente o mesmo bloco `Array.isArray(c.materialObservations) ? ...map()` triplicado em:
  - `app/api/chamados-atribuidos/[id]/route.ts:68-75`
  - `app/api/meus-chamados/[id]/route.ts:96-103`
  - `app/api/gestao/chamados/route.ts:81-88`
- **Fix**: extrair `normalizeMaterialObservations()` em `lib/dto-normalizers.ts` ou equivalente.

### `delete mongoose.models.*` em todo model
- Pattern anti-hot-reload presente em todos os models (Chamado, Notification, etc.)
- Causa re-criação do model a cada request em dev, pode causar memory leaks em prod.
- Padrão correto: `mongoose.models.Chamado || mongoose.model('Chamado', ChamadoSchema)`

### Atomic filter incompleto em addMaterialObservationAction
- `actions.ts:576`: atomic filter `{ _id: ticketId, status: 'em atendimento' }` não inclui
  `assignedToUserId` para técnicos, diferente do padrão dos outros updateOne na mesma action.

### console.error em pages client-side
- `chamados-atribuidos/[id]/page.tsx:128`: `console.error('Erro ao buscar chamado:', error)` - proibido pelo lint.

### HistoryTimeline: N+1 pré-existente (não introduzido pela feature)
- `HistoryTimeline.tsx:60-74`: faz Promise.all de N fetches `/api/users/:id` para cada
  userId único no histórico. Padrão similar ao MaterialObservationsList.

## Convenções de tipo DTO

- DTOs locais em `page.tsx` ou `_components/` (não exportados de `shared/`)
- `MaterialObservationDTO` definido em `components/chamado/MaterialObservationsList.tsx` — único source of truth para o tipo do array no client
- Tipo em `ChamadoCard.tsx` repete os campos inline em vez de importar `MaterialObservationDTO`

