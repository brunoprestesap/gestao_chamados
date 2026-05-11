# Notificação por E-mail — Fallback Offline

Prioridade: 1 (alto impacto) | Complexidade: Alta | Dependências: Nodemailer + SMTP config

## Objetivo

Enviar notificações por e-mail quando o usuário não está online (socket desconectado), garantindo que eventos críticos não sejam perdidos. Hoje todas as notificações dependem do socket — se o usuário não está conectado, só vê ao abrir a aplicação.

## Contexto do Projeto

### Notificações atuais

- **11 tipos** definidos em `models/Notification.ts` (linhas 3-15): ticket:assigned, ticket:new, ticket:execution_registered, ticket:closed, ticket:comment_added, ticket:attachment_added, ticket:paused, ticket:resumed, ticket:rejected, sla:warning, sla:breach
- **Criação**: Server Actions criam `NotificationModel` + `emitToRoom()` (fire-and-forget)
- **Persistência**: NotificationModel salva em MongoDB sempre (fallback offline parcial — lido ao abrir app)
- **UI**: NotificationsBell em `components/realtime/NotificationsBell.tsx` — popover com 20 últimas, mark as read

### User model

- **email**: `models/user.model.ts` (linha 13) — campo existe, optional, lowercase, trimmed — **não usado para notificações hoje**
- **Sem preferências**: não há campo de preferências de notificação no User model

### Socket server

- **Rooms**: `user:<userId>` (individual) e `managers` (Preposto + Admin)
- **Auth**: `socket-server/src/auth.ts` — verifyHandshakeSession() via GET /api/session/verify
- **Conexão**: `components/realtime/RealtimeProvider.tsx` — reconexão automática com 10 tentativas

### Env vars existentes

- `.env.example`: MONGODB_URI, AUTH_SECRET, SOCKET_INTERNAL_SECRET, SOCKET_EMIT_URL, CRON_SECRET
- **Sem variáveis SMTP/email**

## Tarefas

### Infraestrutura de E-mail

1. Instale o Nodemailer:

   ```bash
   npm install nodemailer
   npm install -D @types/nodemailer
   ```

2. Crie `lib/email/transporter.ts`:
   - Configure transporter Nodemailer usando env vars:

     ```typescript
     import nodemailer from 'nodemailer';

     const transporter = nodemailer.createTransport({
       host: process.env.SMTP_HOST,
       port: Number(process.env.SMTP_PORT ?? 587),
       secure: process.env.SMTP_SECURE === 'true',
       auth: {
         user: process.env.SMTP_USER,
         pass: process.env.SMTP_PASS,
       },
     });

     export const FROM_ADDRESS = process.env.SMTP_FROM ?? 'sigma@ap.trf1.gov.br';
     export { transporter };
     ```

   - Adicione ao `.env.example`:
     ```
     SMTP_HOST=smtp.exemplo.com
     SMTP_PORT=587
     SMTP_SECURE=false
     SMTP_USER=
     SMTP_PASS=
     SMTP_FROM=sigma@ap.trf1.gov.br
     ```

3. Crie `lib/email/templates.ts`:
   - Função `renderNotificationEmail(type, payload, recipientName)` que retorna `{ subject, html }`
   - Templates HTML inline (não usar dependência de template engine):
     - Header: logo + nome do sistema (Sigma)
     - Body: mensagem contextual por tipo de notificação
     - Footer: link para a aplicação + "Não responda este e-mail"
   - Templates por tipo:
     - `ticket:assigned` → "Você recebeu um novo chamado: {ticketNumber}"
     - `ticket:new` → "Novo chamado aberto: {ticketNumber}"
     - `ticket:execution_registered` → "Chamado {ticketNumber} teve serviço registrado"
     - `ticket:closed` → "Chamado {ticketNumber} foi encerrado"
     - `ticket:rejected` → "Chamado {ticketNumber} foi recusado"
     - `sla:warning` → "ALERTA: SLA do chamado {ticketNumber} próximo do vencimento"
     - `sla:breach` → "URGENTE: SLA do chamado {ticketNumber} estourou"
     - `ticket:comment_added` → "Novo comentário no chamado {ticketNumber}"
     - Default → "Notificação sobre o chamado {ticketNumber}"
   - Cada template com botão "Ver Chamado" apontando para URL da aplicação

4. Crie `lib/email/send-notification-email.ts`:
   - `sendNotificationEmail(userId, type, payload)`:
     - Busque user por ID → obtenha email
     - Se email não preenchido, retorne silenciosamente (sem erro)
     - Renderize template
     - `transporter.sendMail({ from, to, subject, html })`
     - Fire-and-forget: erros apenas logados via console.warn, nunca throw
     - Retorne boolean (sucesso/falha)

### Lógica de Fallback (socket offline)

5. Crie `lib/email/should-send-email.ts`:
   - `shouldSendEmail(userId, eventType)`:
     - Verifique se o user tem email preenchido
     - Verifique se o socket do user está conectado (opções):
       - **Opção A** (simples): sempre enviar e-mail — deixe o usuário filtrar via preferências (implementado no command 02)
       - **Opção B** (com check de conexão): pergunte ao socket-server se `user:<userId>` tem sockets ativos
     - Para **Opção B**, crie endpoint no socket-server:
       ```
       GET /room-status/:room → { connected: boolean, socketCount: number }
       ```
   - **Recomendação**: comece com Opção A (sempre enviar). É mais simples e confiável. O command 02 (preferências) permitirá ao usuário desativar e-mails.

### Integração nos pontos de criação

6. Em cada Server Action que cria NotificationModel, adicione chamada fire-and-forget:
   - `app/(dashboard)/meus-chamados/actions.ts` — createTicketAction (ticket:new)
   - `app/(dashboard)/gestao/actions.ts` — assignTicketAction (ticket:assigned), closeTicketAction (ticket:closed), rejectTicketAction (ticket:rejected)
   - `app/(dashboard)/chamados-atribuidos/actions.ts` — registerExecutionAction (ticket:execution_registered)
   - `lib/sla-monitor.ts` — checkSlaEscalations (sla:warning, sla:breach)

   Pattern em cada ação, APÓS o NotificationModel.create:

   ```typescript
   sendNotificationEmail(userId, 'ticket:assigned', payload).catch(() => {});
   ```

   Para notificações enviadas a múltiplos destinatários (managers), itere:

   ```typescript
   for (const managerId of managerIds) {
     sendNotificationEmail(managerId, 'ticket:new', payload).catch(() => {});
   }
   ```

### Docker

7. Em `docker-compose.yml`, repasse as variáveis SMTP para o container next-app:
   ```yaml
   environment:
     - SMTP_HOST
     - SMTP_PORT
     - SMTP_SECURE
     - SMTP_USER
     - SMTP_PASS
     - SMTP_FROM
   ```

## Regras

- E-mail é fire-and-forget: falha NUNCA bloqueia a operação principal
- Se SMTP_HOST não configurado, pule envio silenciosamente (log warning uma vez no startup)
- Se user não tem email, pule silenciosamente
- Rate limiting: máximo 10 emails por minuto por destinatário (evitar spam em cascata de SLA breach)
- HTML dos templates deve ser inline CSS (compatibilidade com clientes de email corporativos)
- Não inclua dados sensíveis no corpo do email (senha, tokens)
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Rode `npm run lint` ao final
