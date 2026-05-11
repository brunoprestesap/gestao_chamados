# Digest Diário — Resumo Matinal por E-mail

Prioridade: 4 | Complexidade: Média | Dependências: 01-notificacao-email (Nodemailer configurado)

## Objetivo

Enviar um resumo matinal por e-mail com visão consolidada dos chamados pendentes, atrasados e próximos do vencimento para cada usuário, permitindo planejamento do dia. Especialmente útil para gestores (Preposto/Admin) e técnicos que começam o expediente.

## Contexto do Projeto

### Infraestrutura necessária (do command 01)

- **Nodemailer**: `lib/email/transporter.ts` — SMTP transporter configurado
- **Templates**: `lib/email/templates.ts` — renderização de HTML para email
- **sendNotificationEmail**: `lib/email/send-notification-email.ts` — envio fire-and-forget
- **Env vars SMTP**: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

### Dados disponíveis

- **Chamado model** (`models/Chamado.ts`): status, assignedToUserId, solicitanteId, sla.resolutionDueAt, sla.responseDueAt, sla.resolvedAt, sla.resolutionBreachedAt, finalPriority, tipoServico
- **SLA utils** (`lib/sla-utils.ts`): getSlaResolutionStatus() — 'no_prazo' | 'proximo_vencimento' | 'atrasado'
- **User model** (`models/user.model.ts`): email, name, role
- **Business hours**: `lib/expediente-config.ts` — timezone America/Belem, workdayStart 08:00

### Cron existente

- **Pattern**: API route protegida por `x-cron-secret` header
- **Exemplo**: `app/api/cron/recurring-tickets/route.ts`, `app/api/cron/sla-monitor/route.ts`
- **CRON_SECRET**: já definido no `.env.example`

## Tarefas

### Serviço de Digest

1. Crie `lib/email/digest-service.ts`:

   **`generateDigestForUser(userId, role, now)`** — gera conteúdo do digest para um usuário:

   **Para Técnico**:
   - Chamados atribuídos (assignedToUserId = userId) com status ativo
   - Agrupar por SLA status: atrasados, próximos do vencimento, no prazo
   - Incluir: ticket_number, titulo, prioridade, prazo de resolução, tempo restante

   **Para Preposto/Admin**:
   - Todos os chamados com status ativo (validado, em atendimento, aguardando_solicitante)
   - KPIs resumidos: total ativos, atrasados, próximos do vencimento, sem atribuição
   - Top 5 chamados mais urgentes (atrasados ou próximos do vencimento)
   - Chamados aguardando classificação (status 'aberto') — pendências

   **Para Solicitante**:
   - Seus chamados abertos/em atendimento
   - Status atualizado de cada um
   - Chamados encerrados pendentes de avaliação

   Retorne objeto tipado:

   ```typescript
   export type DigestData = {
     userName: string;
     role: string;
     date: string;
     summary: {
       totalAtivos: number;
       atrasados: number;
       proximoVencimento: number;
       noPrazo: number;
       pendentesClassificacao?: number;
       pendentesAvaliacao?: number;
     };
     urgentTickets: DigestTicketItem[];
     myTickets: DigestTicketItem[];
   };

   export type DigestTicketItem = {
     ticketNumber: string;
     titulo: string;
     status: string;
     priority: string;
     slaStatus: 'no_prazo' | 'proximo_vencimento' | 'atrasado' | null;
     resolutionDueAt: string | null;
     remainingText: string | null;
     url: string;
   };
   ```

2. **`processDigestEmails()`** — orquestra o envio para todos os usuários:
   - Busque todos os users ativos com email preenchido
   - Se preferências implementadas (command 02): filtre users que não silenciaram digest
   - Para cada user, gere digest e envie email
   - Use concurrência limitada (ex: 5 emails simultâneos) para não sobrecarregar SMTP
   - Retorne relatório: `{ total, sent, skipped, failed }`

### Template de E-mail do Digest

3. Crie `lib/email/templates/digest-template.ts`:
   - `renderDigestEmail(data: DigestData): { subject, html }`
   - Subject: "Sigma — Resumo diário ({date}) — {atrasados} atrasado(s)"
   - HTML com inline CSS:
     - Header: "Bom dia, {userName}! Aqui está seu resumo diário."
     - **Bloco KPI**: cards coloridos com total ativos, atrasados (vermelho), risco (amarelo), no prazo (verde)
     - **Tabela "Chamados Urgentes"** (se houver atrasados/risco):
       - Colunas: #, Título, Prioridade, Status SLA, Prazo
       - Linhas com background colorido por SLA status
     - **Tabela "Meus Chamados"** (para técnicos):
       - Chamados atribuídos ao técnico
     - **Seção "Pendências"** (para gestores):
       - X chamados aguardando classificação
       - X chamados aguardando atribuição
     - Footer: link "Acessar Sigma" + "Gerencie suas preferências de notificação em Configurações"
   - Design: cores do projeto (indigo/blue), responsivo para email clients

### API Route para Cron

4. Crie `app/api/cron/digest/route.ts`:
   - POST: protegida por header `x-cron-secret` (env `CRON_SECRET`)
   - Chama `processDigestEmails()`
   - Retorna relatório JSON
   - **Horário sugerido**: 07:30 no timezone institucional (antes do expediente 08:00)
   - Cron: `30 7 * * 1-5` (seg-sex, 07:30) — ajustar timezone no cron se necessário

### Preferências (integração com command 02)

5. Se `models/NotificationPreference.ts` existir:
   - Adicione tipo `'digest:daily'` ao NOTIFICATION_TYPES se necessário, ou trate como configuração separada
   - No NotificationPreference, adicione campo:
     ```typescript
     digest: {
       enabled: { type: Boolean, default: true },
       frequency: { type: String, enum: ['daily', 'none'], default: 'daily' },
     }
     ```
   - Verifique preferência antes de gerar/enviar digest
   - Na página de preferências, adicione toggle "Receber resumo diário por e-mail"

6. Se preferências não implementadas: envie para todos com email preenchido.

### Lógica de Skip

7. Não envie digest se:
   - User não tem email
   - User está inativo (isActive: false)
   - Não há chamados relevantes para o user (digest vazio — skip silenciosamente)
   - Dia não útil (verificar via getBusinessCalendarConfig weekdays)
   - Preferências desabilitaram digest

## Configuração do Cron

```bash
# Enviar digest seg-sex às 07:30 (America/Belem = UTC-3)
# UTC: 10:30
30 10 * * 1-5 curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/digest
```

## Layout do E-mail (Digest)

```
┌──────────────────────────────────────────┐
│          SIGMA — Resumo Diário           │
│          11 de abril de 2026             │
├──────────────────────────────────────────┤
│ Bom dia, João!                           │
│                                          │
│ ┌────────┬────────┬────────┬────────┐    │
│ │ Ativos │Atrasado│ Risco  │No Prazo│    │
│ │   12   │   2    │   3    │   7    │    │
│ └────────┴────────┴────────┴────────┘    │
│                                          │
│ Chamados Urgentes                        │
│ ┌──────┬──────────────┬──────┬───────┐   │
│ │ #042 │ AC Bloco A   │ ALTA │-1h20  │   │
│ │ #038 │ Elev. Torre  │ NORM │ 2h30  │   │
│ └──────┴──────────────┴──────┴───────┘   │
│                                          │
│ Pendências                               │
│ - 3 chamados aguardando classificação    │
│ - 1 chamado aguardando atribuição        │
│                                          │
│         [ Acessar Sigma ]                │
│                                          │
│ Gerencie suas notificações em            │
│ Configurações > Notificações             │
└──────────────────────────────────────────┘
```

## Regras

- Envio apenas em dias úteis (respeitar weekdays do BusinessCalendar)
- Não enviar digest vazio (sem chamados relevantes)
- Concorrência: máximo 5 emails simultâneos (p-limit ou semaphore simples)
- Fire-and-forget: falha de um email não bloqueia os demais
- Se SMTP não configurado, retorne relatório com skipped = total
- Tempo restante no digest: cálculo snapshot (momento do envio), não real-time
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Rode `npm run lint` ao final
