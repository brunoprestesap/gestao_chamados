# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Severino** — Sistema de gerenciamento de chamados (tickets) com controle de SLA, catálogo de serviços, notificações em tempo real e dashboards por perfil de usuário.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5** (strict) + React Compiler habilitado
- **MongoDB** via **Mongoose** (sem Prisma — schemas manuais em `models/`)
- **NextAuth v5** (beta) — Credentials com JWT em cookie HTTP-only
- **Socket.IO** — servidor Express separado (porta 3001) para notificações em tempo real
- **Tailwind CSS v4** + **shadcn/ui** (estilo New York) + **Radix UI** + **Lucide** icons
- **Zustand** (sidebar), **React Hook Form** + **Zod** (formulários/validação)
- **Framer Motion** (animações), **Sonner** (toasts)
- **PM2** para produção (`ecosystem.config.cjs`)

## Comandos

```bash
npm run dev              # Next.js dev (porta 3000)
npm run socket:dev       # Socket.IO dev (porta 3001)
npm run build            # Build Next.js
npm run socket:build     # Build socket-server
npm run lint             # ESLint
npm run lint:fix         # ESLint com auto-fix
npm run format           # Prettier
npm run format:check     # Verifica formatação
pm2 start ecosystem.config.cjs  # Produção (Next + Socket)
```

Não há framework de testes configurado.

## Lint & Formatação

- ESLint 9 (flat config em `eslint.config.mjs`)
- `console.log` proibido — apenas `console.warn`/`console.error`
- `unused-imports/no-unused-imports`: erro
- `simple-import-sort`: imports e exports ordenados alfabeticamente
- `eqeqeq`: sempre `===` (exceto null checks)
- `@typescript-eslint/no-explicit-any`: warning (permitido mas sinalizado)
- Prettier para formatação
- Path alias: `@/*` mapeia para raiz do projeto

## Arquitetura

### Autenticação & Autorização

- Login por `username` (matrícula, lowercase) + senha (min 6 chars), hash com bcryptjs
- JWT em cookie seguro, sessão de 7 dias
- DAL centralizada em `lib/dal.ts` com `verifySession()` usando `React.cache()` para memoização por request
- Guards: `requireSession()`, `requireManager()`, `requireTechnician()`, `requireAdmin()` — redirecionam para `/dashboard` se não autorizado
- 4 roles: **Admin**, **Preposto**, **Solicitante**, **Técnico**
- Workaround de tipo em `auth.ts` (NextAuth v5 beta não exporta `NextAuthConfig` corretamente)

### Server Actions

Pattern padrão (ex: `app/(dashboard)/meus-chamados/actions.ts`):

1. `requireSession()` — verifica auth
2. `dbConnect()` — garante conexão
3. Validação com Zod `safeParse()`
4. Operação no MongoDB (Mongoose)
5. `ChamadoHistoryModel.create()` — trilha de auditoria
6. `emitToRoom()` — notificação fire-and-forget
7. `revalidatePath()` — invalida cache ISR
8. Retorno: `{ ok: true }` ou `{ ok: false; error: '...' }` (nunca throw)

### Notificações em Tempo Real

- `lib/realtime-emit.ts` → `emitToRoom()` faz POST para socket-server com timeout de 1200ms
- **Fire-and-forget**: falhas no socket não quebram lógica de negócio
- Socket-server valida sessão via callback para `GET /api/session/verify` (stateless)
- Rooms: `user:<userId>` (individual) e `managers` (Preposto + Admin)
- Eventos permitidos: `ticket:assigned`, `ticket:new`, `ticket:execution_registered`, `ticket:closed`
- Comunicação interna autenticada por header `x-internal-secret` (`SOCKET_INTERNAL_SECRET`)
- Fallback para MongoDB (model Notification) se socket offline

### SLA

- 4 prioridades: BAIXA, NORMAL, ALTA, EMERGENCIAL
- **Snapshot imutável**: configuração SLA capturada no momento da classificação do chamado (mudanças futuras não afetam tickets existentes)
- Cálculo respeita horário de expediente, feriados e timezone (`lib/sla-timezone.ts`)
- Flag `businessHoursOnly` determina se cálculo respeita expediente ou roda 24x7
- Status de exibição: `atrasado` (breach), `proximo_vencimento` (≤20% restante), `no_prazo`
- Config padrão: America/Belem, 08:00–18:00, Seg–Sex (`lib/expediente-config.ts`)

### Ciclo de Vida do Chamado

`aberto` → `validado` → `em_atendimento` → `concluído` → `encerrado` (ou `cancelado`)

- Classificação (Preposto/Admin): define prioridade final, dispara snapshot SLA
- Atribuição: vincula técnico, emite `ticket:assigned`
- Execução: técnico registra atendimento, emite `ticket:execution_registered`
- Fechamento: emite `ticket:closed`, habilita avaliação pelo solicitante (1–5 + comentário, imutável)
- Toda ação gera registro em `ChamadoHistoryModel` (auditoria)

### Modelos Mongoose

- **Chamado** — Ticket com ciclo completo + campos SLA (`responseDueAt`, `resolutionDueAt`)
- **User** — Roles, especialidades (técnicos via `specialties` → `ServiceSubType`), `maxAssignedTickets` (default 5)
- **ChamadoHistory** — Auditoria de todas as ações
- **SlaConfig** — Configuração SLA por prioridade
- **ServiceCatalog/ServiceType/ServiceSubType** — Catálogo hierárquico de serviços
- **Notification** — Notificações persistentes (fallback do Socket.IO)
- **Unit** — Unidades/departamentos
- **Holiday/BusinessCalendar** — Feriados e horário de expediente

### Validação

- Schemas Zod em `shared/<domain>/*.schemas.ts` (co-localizados por domínio)
- `safeParse()` em todos os handlers — nunca throw em validação
- Tipos compartilhados entre server/client via `shared/`

## Variáveis de Ambiente

### App (`/.env.local`)
- `MONGODB_URI`, `AUTH_SECRET`, `AUTH_COOKIE_NAME`
- `SOCKET_INTERNAL_SECRET`, `SOCKET_EMIT_URL` — comunicação Next→Socket
- `NEXT_PUBLIC_SOCKET_URL` — URL pública do socket para o browser
- `BOOTSTRAP_TOKEN` — protege endpoint `/api/bootstrap`

### Socket Server (`socket-server/.env`)
- `SOCKET_PORT`, `SOCKET_CORS_ORIGIN`, `APP_URL`
- `SOCKET_INTERNAL_SECRET` (deve coincidir com app principal)
- `SOCKET_TRUSTED_PROXIES` — trustar IPs privados (Docker/proxy)

## Referência Rápida para Tarefas Comuns

| Tarefa | Arquivos-chave |
|--------|---------------|
| Novo evento Socket.IO | `shared/socket.ts`, `socket-server/src/index.ts`, `lib/realtime-emit.ts` |
| Novo status de chamado | `shared/chamados/chamado.constants.ts`, `models/Chamado.ts` |
| Novo role gate | `lib/dal.ts` (adicionar `requireXxx()`) |
| Nova prioridade SLA | `models/Chamado.ts`, `shared/sla/sla-config.schemas.ts`, `lib/sla-utils.ts` |
| Novo schema de validação | `shared/<domain>/*.schemas.ts` com Zod |
| Config de expediente | `lib/expediente-config.ts` + API `/config/expediente` |

## Deploy

- **PM2**: `ecosystem.config.cjs` sobe Next (3000) e Socket (3001)
- **Docker**: documentado em `DOCKER_PRODUCAO.md`
- Socket-server precisa de host Node separado se deploy no Vercel
