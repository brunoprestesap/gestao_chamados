# Comentários / Timeline de Comunicação

Prioridade: 3 | Complexidade: Média | Dependências: Nenhuma

## Objetivo

Criar sistema de comentários nos chamados para comunicação direta entre solicitante, técnico e gestores, com suporte a comentários internos (visíveis apenas para técnicos e gestores).

## Contexto do Projeto

- **ChamadoHistory**: `models/ChamadoHistory.ts` — auditoria de ações (NÃO reutilizar para comentários)
- **history.constants.ts**: `shared/chamados/history.constants.ts` — já define action `'comentario'` mas sem implementação
- **Página de detalhe**: `app/(dashboard)/meus-chamados/[id]/page.tsx` — exibe HistoryTimeline
- **HistoryTimeline**: `app/(dashboard)/meus-chamados/[id]/_components/HistoryTimeline.tsx`
- **Socket.IO events**: `shared/socket.ts` — eventos permitidos
- **emitToRoom**: `lib/realtime-emit.ts` — fire-and-forget para notificações
- **Pattern de Server Action**: requireSession → dbConnect → Zod safeParse → MongoDB → ChamadoHistory.create → emitToRoom → revalidatePath → return {ok}

## Tarefas

### Model

1. Crie `models/ChamadoComment.ts`:
   - `chamadoId` (ObjectId, ref: Chamado, required, indexed)
   - `userId` (ObjectId, ref: User, required)
   - `content` (String, required, trim)
   - `visibility` (enum: `'publico'` | `'interno'`, default: `'publico'`)
   - `editedAt` (Date, optional) — se permitir edição futura
   - Timestamps: true
   - Indexes: `{ chamadoId: 1, createdAt: 1 }`, `{ chamadoId: 1, visibility: 1 }`
   - Virtual populate do User (name, username)

### Schema Zod

2. Crie `shared/chamados/comment.schemas.ts`:
   - `AddCommentSchema`: chamadoId (string ObjectId), content (min 1, max 5000), visibility ('publico' | 'interno')
   - `CommentListItemSchema`: para tipagem do retorno
   - Exporte types inferred: `AddCommentInput`, `CommentListItem`

### Server Action

3. Crie `addCommentAction` em `app/(dashboard)/meus-chamados/actions.ts`:
   - requireSession()
   - dbConnect()
   - safeParse com AddCommentSchema
   - **Regras de acesso**: apenas podem comentar:
     - Solicitante do chamado (`chamado.solicitanteId`)
     - Técnico atribuído (`chamado.assignedToUserId`)
     - Admin ou Preposto (qualquer chamado)
   - **Regra de visibilidade**: comentários `'interno'` só podem ser criados por Técnico, Admin ou Preposto. Solicitante sempre cria `'publico'`
   - Salve no ChamadoComment
   - Crie entrada no ChamadoHistory com action `'comentario'` e observacoes com preview do conteúdo (primeiros 100 chars)
   - emitToRoom: evento `'ticket:comment_added'` para room do solicitante e do técnico atribuído
   - revalidatePath para a página de detalhe
   - Return: `{ ok: true }` ou `{ ok: false, error: '...' }`

### API de Listagem

4. Crie `app/api/chamados/[id]/comments/route.ts`:
   - GET: requireSession(), dbConnect()
   - Valide que o user tem acesso ao chamado (solicitante, técnico atribuído, Admin ou Preposto)
   - Busque ChamadoComment por chamadoId, ordenado por createdAt ASC
   - **Filtre visibilidade**: se user.role === 'Solicitante', retorne apenas visibility === 'publico'
   - Populate userId com name e username
   - Return JSON array

### Socket.IO Event

5. Em `shared/socket.ts`, adicione `'ticket:comment_added'` à lista de eventos permitidos

### Componente CommentThread

6. Crie `app/(dashboard)/meus-chamados/[id]/_components/CommentThread.tsx`:
   - Client component (`'use client'`)
   - Fetch comentários via GET `/api/chamados/[id]/comments` no mount (useSWR ou useEffect+fetch)
   - Lista de comentários em ordem cronológica (mais antigo primeiro)
   - Cada comentário: avatar/iniciais do autor, nome, timestamp relativo, conteúdo
   - Comentários `'interno'` com badge visual "Interno" (cor amber/yellow) e fundo levemente diferenciado
   - Formulário de novo comentário no rodapé:
     - Textarea com placeholder "Adicione um comentário..."
     - Toggle de visibilidade (checkbox ou switch): "Comentário interno" — visível apenas se user não for Solicitante
     - Botão "Enviar" (gradiente indigo/blue padrão do projeto)
     - Desabilitar submit se content vazio
   - Após submit: chamar addCommentAction, limpar form, refetch lista
   - Design: shadcn/ui Card, rounded-2xl, border-border/50

### Integração na Página de Detalhe

7. Em `app/(dashboard)/meus-chamados/[id]/page.tsx`:
   - Importe e renderize `CommentThread` abaixo do `HistoryTimeline`
   - Passe `chamadoId` e dados de permissão (role do user, se é solicitante/técnico)

8. Também integre em `app/(dashboard)/chamados-atribuidos/[id]/page.tsx` (visão do técnico)

9. Também integre em qualquer página de detalhe acessível por gestores

## Regras

- NÃO reutilize ChamadoHistory como store de comentários — crie model separado (histórico é auditoria, comentário é comunicação)
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse em validações, nunca throw
- Design: shadcn/ui, rounded-2xl, border-border/50, indigo/blue palette
- Rode `npm run lint` ao final
