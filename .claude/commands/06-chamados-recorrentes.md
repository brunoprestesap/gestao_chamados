# Chamados Recorrentes (Manutenção Preventiva)

Prioridade: 6 | Complexidade: Alta | Dependências: Cron job externo ou node-cron

## Objetivo

Permitir agendamento automático de chamados recorrentes para manutenções preventivas (ex: revisão mensal de ar-condicionado, inspeção trimestral de elevador), eliminando a necessidade de criação manual repetitiva.

## Contexto do Projeto

- **createTicketAction**: `app/(dashboard)/meus-chamados/actions.ts` — lógica de criação de chamado
- **generateTicketNumber**: `lib/chamado-utils.ts` — gera CHM-YYYY-NNNNN
- **Tipos de serviço**: `shared/chamados/new-ticket.schemas.ts` — TIPO_SERVICO_OPTIONS
- **Nav do dashboard**: `components/dashboard/nav.ts` — itens de menu filtrados por role
- **Roles com acesso**: Admin e Preposto (gestão)
- **PM2**: `ecosystem.config.cjs` — produção sem Docker
- **Docker**: `docker-compose.yml` — produção com Docker
- **Design system**: shadcn/ui, Tailwind v4, rounded-2xl, indigo/blue palette

## Tarefas

### Model

1. Crie `models/RecurringTicket.ts`:

   **Campos do template (espelho do chamado):**
   - `name` (String, required) — nome descritivo do agendamento (ex: "Revisão mensal AC - Bloco A")
   - `titulo` (String, required) — título que será usado no chamado gerado
   - `descricao` (String, required)
   - `unitId` (ObjectId, ref: Unit, required)
   - `tipoServico` (enum TIPO_SERVICO_OPTIONS, required)
   - `naturezaAtendimento` (String, required)
   - `grauUrgencia` (String, default: 'Normal')
   - `subtypeId` (ObjectId, ref: ServiceSubType, optional)
   - `catalogServiceId` (ObjectId, ref: ServiceCatalog, optional)

   **Campos de recorrência:**
   - `recurrenceType` (enum: `'weekly'` | `'monthly'` | `'custom'`)
   - `dayOfWeek` (Number 0-6, required se weekly) — 0=Domingo
   - `dayOfMonth` (Number 1-28, required se monthly) — até 28 para evitar problemas com meses curtos
   - `intervalDays` (Number, required se custom) — ex: 90 para trimestral
   - `nextRunAt` (Date, required, indexed)
   - `lastRunAt` (Date, optional)
   - `totalGenerated` (Number, default: 0)

   **Campos de controle:**
   - `isActive` (Boolean, default: true)
   - `createdByUserId` (ObjectId, ref: User, required)
   - `solicitanteId` (ObjectId, ref: User, required) — quem será o solicitante do chamado gerado
   - Timestamps: true
   - Indexes: `{ nextRunAt: 1, isActive: 1 }`, `{ createdByUserId: 1 }`

### Schema Zod

2. Crie `shared/chamados/recurring-ticket.schemas.ts`:
   - `CreateRecurringTicketSchema`: validação completa com refinements (dayOfWeek required se weekly, etc.)
   - `UpdateRecurringTicketSchema`: partial do create + id
   - `RecurringTicketListItemSchema`: para tipagem da listagem
   - Exporte types

### Server Actions

3. Crie `app/(dashboard)/gestao/recurring/actions.ts`:

   **`createRecurringTemplateAction(data)`**:
   - requireManager()
   - Calcule `nextRunAt` baseado na recurrence configurada
   - Salve no MongoDB
   - Return { ok: true, data: template }

   **`updateRecurringTemplateAction(data)`**:
   - requireManager()
   - Recalcule `nextRunAt` se recurrence mudou
   - Return { ok: true }

   **`toggleRecurringTemplateAction(templateId)`**:
   - requireManager()
   - Toggle isActive
   - Se ativando, recalcule nextRunAt para o próximo slot futuro
   - Return { ok: true }

   **`deleteRecurringTemplateAction(templateId)`**:
   - requireManager()
   - Delete hard (ou soft via isActive=false + deletedAt)
   - Return { ok: true }

### Job de Processamento

4. Crie `lib/recurring-job.ts`:

   **`processRecurringTickets()`**:
   - dbConnect()
   - Busque templates: `{ nextRunAt: { $lte: new Date() }, isActive: true }`
   - Para cada template:
     - Gere ticket_number via `generateTicketNumber()`
     - Crie Chamado com status 'aberto', solicitanteId do template, campo `originTemplateId` apontando para o RecurringTicket
     - Crie ChamadoHistory com action 'abertura', observacoes: "Chamado gerado automaticamente por agendamento: {name}"
     - emitToRoom: notifique managers (ticket:new)
     - Calcule e atualize nextRunAt para o próximo slot
     - Incremente totalGenerated
     - Atualize lastRunAt
   - Use transação ou try/catch individual para não travar se um template falhar
   - Retorne relatório: { processed, created, errors }

### API Route para Cron

5. Crie `app/api/cron/recurring-tickets/route.ts`:
   - POST: protegida por header `x-cron-secret` comparado com env `CRON_SECRET`
   - Chama `processRecurringTickets()`
   - Retorna relatório
   - Adicione `CRON_SECRET` ao `.env.example`

### Model Chamado — Campo de Rastreabilidade

6. Em `models/Chamado.ts`:
   - Adicione campo opcional `originTemplateId` (ObjectId, ref: RecurringTicket)
   - Não é required — chamados manuais continuam sem esse campo

### Navegação

7. Em `components/dashboard/nav.ts`:
   - Adicione item no grupo "Gestão":
     - label: "Chamados Recorrentes"
     - href: "/gestao/recurring"
     - icon: `CalendarClock` (Lucide)
     - roles: ['Admin', 'Preposto']

### Página de Gestão

8. Crie `app/(dashboard)/gestao/recurring/page.tsx`:
   - requireManager()
   - Tabela com colunas: Nome, Tipo Serviço, Recorrência (texto legível), Próxima Execução, Último Gerado, Total Gerado, Status (ativo/inativo), Ações
   - Filtros: tipo de serviço, status ativo/inativo
   - Botão "Novo Agendamento" → abre dialog
   - Ações por linha: Editar, Ativar/Desativar (toggle), Deletar

### Dialog de Criação/Edição

9. Crie `app/(dashboard)/gestao/recurring/_components/RecurringTicketDialog.tsx`:
   - Dois blocos:
     1. **Agendamento**: nome, recorrenceType (tabs ou radio), campos condicionais (dayOfWeek, dayOfMonth, intervalDays), solicitante (select de users)
     2. **Template do Chamado**: reaproveite os campos do NewTicketDialog (unit, tipoServico, descricao, natureza, subtypeId, etc.)
   - Preview: "Próxima geração: {data calculada}"
   - Validação completa via Zod

### Configuração do Cron

10. Documente no CLAUDE.md ou README como configurar o cron:
    - **Docker**: adicione ao `docker-compose.yml` um serviço simples ou use healthcheck + script
    - **PM2**: adicione entry no `ecosystem.config.cjs` com cron_restart
    - **Cron do sistema**: `*/30 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/recurring-tickets`

## Regras

- Chamados gerados devem ser indistinguíveis dos manuais no fluxo (passam por classificação, atribuição, etc.)
- O campo `originTemplateId` é apenas para rastreabilidade
- Use `dayOfMonth` até 28 para evitar problemas com fevereiro
- Cálculo de `nextRunAt` deve considerar timezone do projeto (America/Belem)
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Use safeParse, nunca throw
- Rode `npm run lint` ao final
