# Preferências de Notificação

Prioridade: 2 | Complexidade: Média | Dependências: Recomendado após 01-notificacao-email

## Objetivo

Permitir que cada usuário configure quais eventos deseja receber e por qual canal (in-app, e-mail), reduzindo ruído e dando autonomia. Hoje todos os usuários recebem todas as notificações para seu perfil, sem possibilidade de personalização.

## Contexto do Projeto

### Notificações atuais

- **11 tipos** em `models/Notification.ts` (linhas 3-15)
- **Canais**: in-app (NotificationModel + Socket.IO) — e-mail será adicionado no command 01
- **Sem preferências**: User model (`models/user.model.ts`) não tem campo de preferências
- **Roles**: Solicitante, Técnico, Preposto, Admin — cada role recebe subset de eventos

### Páginas de configuração existentes

- `app/(dashboard)/configuracoes/expediente/page.tsx` — config de horário de expediente
- `app/(dashboard)/configuracoes/feriados/page.tsx` — config de feriados
- Pattern: Server Component com form client, Server Actions para salvar

### Eventos por role (comportamento atual implícito)

- **Solicitante**: ticket:closed, ticket:rejected, ticket:execution_registered, ticket:comment_added, ticket:attachment_added
- **Técnico**: ticket:assigned, ticket:comment_added, ticket:attachment_added
- **Preposto/Admin**: ticket:new, ticket:execution_registered, ticket:closed, sla:warning, sla:breach, ticket:comment_added, ticket:attachment_added

## Tarefas

### Model de Preferências

1. Crie `models/NotificationPreference.ts`:
   - `userId` (ObjectId, ref: User, required, unique — 1 doc por user)
   - `channels`: objeto com configuração por canal:
     ```typescript
     channels: {
       inApp: {
         enabled: { type: Boolean, default: true },
         mutedTypes: [{ type: String, enum: NOTIFICATION_TYPES }],
       },
       email: {
         enabled: { type: Boolean, default: true },
         mutedTypes: [{ type: String, enum: NOTIFICATION_TYPES }],
       },
     }
     ```
   - `quietHoursStart` (String, HH:MM, optional) — início do horário silencioso (sem email)
   - `quietHoursEnd` (String, HH:MM, optional) — fim do horário silencioso
   - Timestamps: true
   - Index: `{ userId: 1 }` unique

   **Lógica**: se um tipo está em `mutedTypes` do canal, não entrega por aquele canal. Se `enabled` é false, não entrega nada por aquele canal.

### Schema Zod

2. Crie `shared/notifications/preference.schemas.ts`:
   - `NotificationPreferenceSchema`:
     - channels.inApp.enabled (boolean)
     - channels.inApp.mutedTypes (array de strings, enum NOTIFICATION_TYPES)
     - channels.email.enabled (boolean)
     - channels.email.mutedTypes (array de strings, enum NOTIFICATION_TYPES)
     - quietHoursStart (string HH:MM, optional)
     - quietHoursEnd (string HH:MM, optional)
   - Exporte type `NotificationPreferenceInput`

### Server Actions

3. Crie `app/(dashboard)/configuracoes/notificacoes/actions.ts`:
   - `getNotificationPreferencesAction()`: retorna preferências do user logado (ou defaults se não existir)
   - `updateNotificationPreferencesAction(data)`: upsert preferências (findOneAndUpdate com upsert)

### Função de Gate

4. Crie `lib/notification-gate.ts`:
   - `shouldDeliver(userId, eventType, channel: 'inApp' | 'email'): Promise<boolean>`:
     - Busque NotificationPreference do user (cache em memória por 5min para performance)
     - Se não existe preferência, retorne true (defaults habilitados)
     - Verifique `channels[channel].enabled`
     - Verifique se `eventType` está em `channels[channel].mutedTypes`
     - Para email: verifique quiet hours (se dentro do período silencioso, retorne false)
     - Retorne true/false
   - Cache: use Map simples com TTL de 5 minutos (evitar query a cada notificação)

### Integração nos pontos de criação

5. Em cada Server Action que cria notificações, antes de criar NotificationModel e enviar email:

   ```typescript
   const shouldInApp = await shouldDeliver(userId, 'ticket:assigned', 'inApp');
   if (shouldInApp) {
     await NotificationModel.create({ ... });
     await emitToRoom(`user:${userId}`, 'ticket:assigned', payload);
   }

   const shouldEmail = await shouldDeliver(userId, 'ticket:assigned', 'email');
   if (shouldEmail) {
     sendNotificationEmail(userId, 'ticket:assigned', payload).catch(() => {});
   }
   ```

   **Atenção**: para notificações a múltiplos destinatários (managers), verificar preferência de cada um individualmente.

### Página de Configuração

6. Crie `app/(dashboard)/configuracoes/notificacoes/page.tsx`:
   - requireSession()
   - Carregue preferências via getNotificationPreferencesAction()
   - Layout: PageHeader + form

7. Crie `app/(dashboard)/configuracoes/notificacoes/_components/NotificationPreferencesForm.tsx`:
   - Client component com React Hook Form + Zod resolver
   - **Seção "Canais"**:
     - Switch "Notificações in-app" (habilitado/desabilitado)
     - Switch "Notificações por e-mail" (habilitado/desabilitado) — só exibir se SMTP configurado
   - **Seção "Eventos"** — tabela/grid:
     - Linhas: cada tipo de notificação com label legível
     - Colunas: In-app (checkbox), E-mail (checkbox)
     - Filtrar tipos por role do usuário (solicitante não vê ticket:new)
     - Desabilitar checkboxes se o canal estiver desabilitado globalmente
   - **Seção "Horário Silencioso"** (opcional):
     - Inputs de hora início/fim (ex: 22:00 → 07:00)
     - Descrição: "Notificações por e-mail serão retidas durante este período"
   - Botão "Salvar Preferências"
   - Toast de confirmação (Sonner)

### Labels legíveis por tipo

8. Crie `shared/notifications/notification-type-labels.ts`:
   ```typescript
   export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
     'ticket:assigned': 'Chamado atribuído a mim',
     'ticket:new': 'Novo chamado aberto',
     'ticket:execution_registered': 'Serviço registrado no chamado',
     'ticket:closed': 'Chamado encerrado',
     'ticket:rejected': 'Chamado recusado',
     'ticket:comment_added': 'Novo comentário no chamado',
     'ticket:attachment_added': 'Novo anexo no chamado',
     'ticket:paused': 'Chamado pausado',
     'ticket:resumed': 'Chamado retomado',
     'sla:warning': 'SLA próximo do vencimento',
     'sla:breach': 'SLA estourou',
   };
   ```

### Tipos relevantes por role

9. Crie `shared/notifications/notification-type-by-role.ts`:
   ```typescript
   export const NOTIFICATION_TYPES_BY_ROLE: Record<string, string[]> = {
     Solicitante: [
       'ticket:closed',
       'ticket:rejected',
       'ticket:execution_registered',
       'ticket:comment_added',
       'ticket:attachment_added',
     ],
     Técnico: ['ticket:assigned', 'ticket:comment_added', 'ticket:attachment_added'],
     Preposto: [
       'ticket:new',
       'ticket:execution_registered',
       'ticket:closed',
       'ticket:comment_added',
       'ticket:attachment_added',
       'sla:warning',
       'sla:breach',
     ],
     Admin: [
       'ticket:new',
       'ticket:execution_registered',
       'ticket:closed',
       'ticket:comment_added',
       'ticket:attachment_added',
       'sla:warning',
       'sla:breach',
     ],
   };
   ```

### Navegação

10. Em `components/dashboard/nav.ts`, adicione item:
    - label: "Notificações"
    - href: "/configuracoes/notificacoes"
    - icon: `BellRing` do Lucide
    - roles: ['Admin', 'Preposto', 'Técnico', 'Solicitante'] (todos)
    - Grupo: "Configurações" ou como item no dropdown do perfil/avatar

## Layout Sugerido

```
┌────────────────────────────────────────────────────┐
│ Preferências de Notificação                        │
├────────────────────────────────────────────────────┤
│ Canais                                             │
│ ┌──────────────────────┬──────┐                    │
│ │ Notificações in-app  │ [ON] │                    │
│ │ Notificações e-mail  │ [ON] │                    │
│ └──────────────────────┴──────┘                    │
│                                                    │
│ Eventos                                            │
│ ┌───────────────────────────┬───────┬───────┐      │
│ │ Evento                    │In-app │E-mail │      │
│ ├───────────────────────────┼───────┼───────┤      │
│ │ Chamado atribuído a mim   │  [x]  │  [x]  │      │
│ │ Novo comentário           │  [x]  │  [ ]  │      │
│ │ Novo anexo                │  [x]  │  [ ]  │      │
│ │ SLA próximo vencimento    │  [x]  │  [x]  │      │
│ │ SLA estourou              │  [x]  │  [x]  │      │
│ └───────────────────────────┴───────┴───────┘      │
│                                                    │
│ Horário Silencioso (e-mail)                        │
│ De: [22:00] Até: [07:00]                           │
│                                                    │
│                        [Salvar Preferências]       │
└────────────────────────────────────────────────────┘
```

## Regras

- Defaults: todos os canais habilitados, nenhum tipo silenciado (comportamento atual preservado)
- Cache de preferências: 5 minutos em memória (evitar query por notificação)
- Preferências não existentes = tudo habilitado (não criar doc até primeiro save)
- sla:warning e sla:breach NÃO devem poder ser silenciados por Admin (segurança — sempre recebe)
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse, nunca throw
- Design: shadcn/ui, rounded-2xl, indigo/blue palette
- Rode `npm run lint` ao final
