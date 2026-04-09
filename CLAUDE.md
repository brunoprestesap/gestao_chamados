# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Sigma — Sistema Integrado de Manutenção** — Sistema de gerenciamento de chamados (tickets) com controle de SLA, catálogo de serviços, notificações em tempo real e dashboards por perfil de usuário.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5** (strict) + React Compiler habilitado
- **MongoDB** via **Mongoose** (sem Prisma — schemas manuais em `models/`)
- **NextAuth v5** (beta) — Credentials com JWT em cookie HTTP-only + **LDAP/AD** opcional
- **ldapts** — cliente LDAP/AD Promise-based para autenticação corporativa
- **Socket.IO** — servidor Express separado (porta 3001) para notificações em tempo real
- **Tailwind CSS v4** + **shadcn/ui** (estilo New York) + **Radix UI** + **Lucide** icons
- **Zustand** (sidebar), **React Hook Form** + **Zod** (formulários/validação)
- **Framer Motion** (animações), **Sonner** (toasts)
- **Design System**: paleta indigo/blue com sidebar escura, cards `rounded-2xl`, efeitos glass (backdrop-blur) e micro-interações (hover lift + scale)
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

- Login por `username` (matrícula, lowercase) + senha, via **LDAP/AD** (prioritário) ou **senha local** (bcryptjs)
- JWT em cookie seguro, sessão de 7 dias
- Login via **Server Action** (`app/(auth)/login/actions.ts`) que chama `signIn` server-side (não usa `signIn` do `next-auth/react`)
- DAL centralizada em `lib/dal.ts` com `verifySession()` usando `React.cache()` para memoização por request
- Guards: `requireSession()`, `requireManager()`, `requireTechnician()`, `requireAdmin()` — redirecionam para `/dashboard` se não autorizado
- 4 roles: **Admin**, **Preposto**, **Solicitante**, **Técnico**
- Workaround de tipo em `auth.ts` (NextAuth v5 beta não exporta `NextAuthConfig` corretamente)

#### LDAP/AD (opcional)

- Configuração em variáveis de ambiente (`LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`)
- Se variáveis LDAP ausentes → apenas autenticação local (comportamento original)
- Cliente LDAP em `lib/ldap.ts` usando pacote `ldapts` (Promise-based, TypeScript nativo)
- Busca por `sAMAccountName` (configurável via `LDAP_USER_SEARCH_FILTER`)
- Two-phase bind: conta de serviço busca DN do usuário → bind com credenciais do usuário
- Timeout de 5s, proteção contra LDAP injection no filtro de busca

#### Fluxo de autenticação (`auth.ts` → `authorize`)

1. Busca usuário no MongoDB por `username`
2. Se LDAP configurado → `authenticateWithLdap(username, password)`
   - `success` → autenticado
   - `invalid_credentials` + tem `passwordHash` → fallback para senha local (colisão de username AD vs app)
   - `invalid_credentials` + sem `passwordHash` → negar (usuário LDAP-only)
   - `not_found` ou `error` → fallback para senha local
3. Se LDAP não configurado ou fallback → `bcrypt.compare()` contra `passwordHash`

#### Auto-provisionamento LDAP

- Primeiro login via LDAP de usuário inexistente no MongoDB → cria automaticamente
- Atributos importados do AD: `displayName` → `name`, `mail` → `email`, `department` → `unitId` (busca Unit por nome)
- Role padrão: `Solicitante`
- `passwordHash` fica vazio (campo opcional no model User — permite usuários LDAP-only)

#### Logs de debug

- `LDAP_DEBUG=true` ativa logs detalhados (`[LDAP:debug]` e `[Auth:debug]`) via `console.warn`
- Útil para diagnosticar: bind de serviço, busca de DN, validação de senha, provisionamento
- Em produção: `docker logs severino-next-app-1 -f --tail 50`

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
- **User** — Roles, especialidades (técnicos via `specialties` → `ServiceSubType`), `maxAssignedTickets` (default 5), `passwordHash` opcional (permite usuários LDAP-only)
- **ChamadoHistory** — Auditoria de todas as ações
- **SlaConfig** — Configuração SLA por prioridade
- **ServiceCatalog/ServiceType/ServiceSubType** — Catálogo hierárquico de serviços (tipos: Manutenção Predial, Ar-Condicionado, Elevador)
- **Notification** — Notificações persistentes (fallback do Socket.IO)
- **Unit** — Unidades/departamentos
- **Holiday/BusinessCalendar** — Feriados e horário de expediente

### Relatório IMR (Índice de Medição de Resultados)

- Rota: `/relatorios/imr` — acesso restrito a Admin (`requireAdmin()`)
- Serviço: `lib/imr-service.ts` → `computeImrReport()` — **uma única aggregation** MongoDB com `$facet` unificado
- Todos os facets agrupam por `tipoServico`, permitindo derivar o resumo geral (soma em JS) e os resultados por tipo (filtro por `_id`) sem queries adicionais
- Tipos de serviço: definidos em `TIPO_SERVICO_OPTIONS` (`shared/chamados/new-ticket.schemas.ts`)
- Indicadores: volume, SLA (cumprimento + por prioridade), tempo médio de atendimento, avaliação dos usuários, penalidades (base para glosa)
- UI com abas (shadcn/ui Tabs): **Resumo Geral** | **Manutenção Predial** | **Ar-Condicionado**
- Componentes de seção reutilizáveis em `app/(dashboard)/relatorios/imr/_components/imr-sections.tsx`
- Componente de abas (client) em `app/(dashboard)/relatorios/imr/_components/imr-tipo-servico-tabs.tsx`
- Tipos públicos exportados: `ImrResult`, `ImrResumoGeral`, `ImrResultPorTipo`, `ImrSlaCumprimento`, `ImrSlaPorPrioridade`, `ImrAvaliacao`, `ImrPenalidade`

### Validação

- Schemas Zod em `shared/<domain>/*.schemas.ts` (co-localizados por domínio)
- `safeParse()` em todos os handlers — nunca throw em validação
- Tipos compartilhados entre server/client via `shared/`

### UI / Design System

#### Paleta de Cores (`app/globals.css`)

- **Primary**: indigo/blue (`oklch 0.488 0.200 264`) — usado em botões, links, accent stripes e focus rings
- **Sidebar escura**: fundo dark indigo (`oklch 0.175 0.025 265`) com texto claro — contraste forte com o conteúdo principal
- **Background**: levemente azulado (`oklch 0.985 0.002 260`) em vez de branco puro
- Todas as cores do tema possuem leve tint azulado (hue ~260) para coesão visual
- Dark mode: variantes escuras com os mesmos hues, ajustadas para legibilidade

#### Layout do Dashboard

- **Sidebar** (`components/sidebar/sidebar.tsx`): fixa à esquerda, animada com Framer Motion (spring), colapsável via Zustand. Largura: 280px expandida / 72px colapsada
- **Sidebar Content** (`components/dashboard/sidebar-content.tsx`): navegação agrupada por seção (Principal, Chamados, Gestão, Admin), filtrada por role do usuário. Footer com avatar + logout
- **Dashboard Shell** (`components/dashboard/dashboard-shell.tsx`): header desktop fixo com `backdrop-blur-xl` + sino de notificações; conteúdo com `max-w-7xl` centralizado
- **Mobile Header** (`components/dashboard/mobile-header.tsx`): sticky com backdrop blur, menu hamburger abre Sheet lateral com a mesma `SidebarContent`

#### Padrões de Componentes

- **Cards**: `rounded-2xl`, `border-border/50`, hover com `shadow-lg` + `-translate-y-0.5` (micro lift)
- **Accent stripe**: barra de 3px no topo dos cards com gradiente colorido, opacidade 60%→100% no hover
- **Icon containers**: `rounded-xl`, cores por contexto (sky, amber, emerald, etc.), `scale-105` no hover
- **KPI Card** (`components/dashboard/kpi-card.tsx`): componente reutilizável para métricas com título, valor, helper text e ícone
- **PageHeader** (`components/dashboard/header.tsx`): título + subtítulo + slot opcional `actions`
- **Botões primários**: gradiente `from-indigo-600 to-blue-600` com shadow colorida (`shadow-indigo-500/20`)
- **Inputs do login**: `rounded-xl` com ícone à esquerda e transição de borda no focus

## Variáveis de Ambiente

### App (`/.env.local`)

- `MONGODB_URI`, `AUTH_SECRET`, `AUTH_COOKIE_NAME`
- `SOCKET_INTERNAL_SECRET`, `SOCKET_EMIT_URL` — comunicação Next→Socket
- `NEXT_PUBLIC_SOCKET_URL` — URL pública do socket para o browser
- `BOOTSTRAP_TOKEN` — protege endpoint `/api/bootstrap`

### LDAP/AD (opcional — `/.env.local` ou `.env` na VPS)

- `LDAP_URL` — URL do servidor LDAP (ex: `ldaps://ad.empresa.com:636`)
- `LDAP_BASE_DN` — Base DN para busca (ex: `DC=empresa,DC=com`)
- `LDAP_BIND_DN` — DN da conta de serviço para busca
- `LDAP_BIND_PASSWORD` — Senha da conta de serviço
- `LDAP_USER_SEARCH_FILTER` — Filtro de busca (padrão: `(sAMAccountName={{username}})`)
- `LDAP_TLS_REJECT_UNAUTHORIZED` — `false` para certificados auto-assinados/CA interna
- `LDAP_DEBUG` — `true` para logs detalhados de autenticação

### Socket Server (`socket-server/.env`)

- `SOCKET_PORT`, `SOCKET_CORS_ORIGIN`, `APP_URL`
- `SOCKET_INTERNAL_SECRET` (deve coincidir com app principal)
- `SOCKET_TRUSTED_PROXIES` — trustar IPs privados (Docker/proxy)

## Referência Rápida para Tarefas Comuns

| Tarefa                   | Arquivos-chave                                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Novo tipo de serviço     | `shared/chamados/new-ticket.schemas.ts` (TIPO_SERVICO_OPTIONS), `app/(dashboard)/meus-chamados/_components/new-ticket.utils.ts` (buildTypeIdByTipo), `app/(dashboard)/meus-chamados/_components/NewTicketDialog.tsx` (ícone/cor), `scripts/seed.js` (seed de tipo, subtipos e catálogo) |
| Novo evento Socket.IO    | `shared/socket.ts`, `socket-server/src/index.ts`, `lib/realtime-emit.ts`                                                                                                                                                                                                                |
| Novo status de chamado   | `shared/chamados/chamado.constants.ts`, `models/Chamado.ts`                                                                                                                                                                                                                             |
| Novo role gate           | `lib/dal.ts` (adicionar `requireXxx()`)                                                                                                                                                                                                                                                 |
| Nova prioridade SLA      | `models/Chamado.ts`, `shared/sla/sla-config.schemas.ts`, `lib/sla-utils.ts`                                                                                                                                                                                                             |
| Novo schema de validação | `shared/<domain>/*.schemas.ts` com Zod                                                                                                                                                                                                                                                  |
| Config de expediente     | `lib/expediente-config.ts` + API `/config/expediente`                                                                                                                                                                                                                                   |
| Relatório IMR            | `lib/imr-service.ts`, `app/(dashboard)/relatorios/imr/page.tsx`, `_components/imr-sections.tsx`, `_components/imr-tipo-servico-tabs.tsx`                                                                                                                                                |
| Novo indicador IMR       | `lib/imr-service.ts` (facet em `unifiedFacets()`, extração em `extractPerType()` e `buildResumoGeral()`), seção UI em `imr-sections.tsx`                                                                                                                                                |
| Alterar paleta/tema      | `app/globals.css` (variáveis CSS `:root` e `.dark`)                                                                                                                                                                                                                                     |
| Novo card de dashboard   | Seguir padrão `MetricCard`/`StatCard` nos `_components/Dashboard*Content.tsx` (rounded-2xl, accent stripe, hover lift)                                                                                                                                                                  |
| Alterar sidebar          | `components/sidebar/sidebar.tsx` (container), `components/dashboard/sidebar-content.tsx` (conteúdo/nav), `components/dashboard/nav.ts` (itens de menu)                                                                                                                                  |
| Alterar layout dashboard | `components/dashboard/dashboard-shell.tsx` (shell + header desktop), `components/dashboard/mobile-header.tsx` (mobile), `app/(dashboard)/layout.tsx`                                                                                                                                    |
| Deploy Docker (VPS)      | `DOCKER_PRODUCAO.md`, `docker-compose.yml`, `Dockerfile`, `socket-server/Dockerfile`, `nginx/default.conf`, `deploy.sh`, `scripts/seed.js`                                                                                                                                              |
| Backup MongoDB           | `scripts/backup-mongodb.sh` (backup), `scripts/restore-mongodb.sh` (restore), `DOCKER_PRODUCAO.md` seção 9                                                                                                                                                                              |
| CI/CD                    | `.github/workflows/ci.yml` (lint + build), `.github/workflows/deploy.yml` (deploy via self-hosted runner)                                                                                                                                                                               |
| Configurar LDAP/AD       | `lib/ldap.ts` (cliente), `auth.ts` (fluxo authorize), `.env.example` (variáveis), `docker-compose.yml` (repassar env)                                                                                                                                                                   |
| Alterar fluxo de login   | `app/(auth)/login/actions.ts` (Server Action), `app/(auth)/login/page.tsx` (formulário), `auth.ts` (authorize)                                                                                                                                                                          |
| Debug autenticação       | `LDAP_DEBUG=true` no `.env`, logs via `docker logs severino-next-app-1 -f`                                                                                                                                                                                                              |

## CI/CD

- **CI** (GitHub Actions): lint + build (Next.js e socket-server) em todo push/PR na `main` (`.github/workflows/ci.yml`)
- **CD** (GitHub Actions): deploy automático na VPS via **self-hosted runner** após CI passar (`.github/workflows/deploy.yml`)
- **Self-hosted runner**: instalado na VPS em `/opt/actions-runner`, roda como usuário `github-runner` com acesso ao Docker
- **Fluxo**: push na `main` → CI (GitHub) → Deploy (VPS) → `git pull` + `docker compose up -d --build`

## Deploy

### Docker (VPS) — Recomendado

Documentação completa em `DOCKER_PRODUCAO.md`. Resumo:

- **VPS**: `/opt/severino` — 4 containers: next-app, socket-server, mongodb, nginx
- **Nginx** como proxy reverso na porta 80 (`/` → Next, `/socket.io/` → Socket)
- **Deploy automático**: push na `main` dispara CI/CD (ver seção CI/CD acima)
- **Deploy manual**: `cd /opt/severino && git pull origin main && docker compose up -d --build`
- **Seed**: `docker exec -i severino-mongodb-1 mongosh manutencao < scripts/seed.js`
- **Re-semear**: limpar collections antes (seed usa `insertMany` ordered, para no primeiro duplicado)
- **Variáveis**: `.env` na raiz (não versionado) — `AUTH_SECRET`, `SOCKET_INTERNAL_SECRET`, `NEXT_PUBLIC_SOCKET_URL`, `SOCKET_CORS_ORIGIN`, `AUTH_URL`

### PM2 (alternativa sem Docker)

- `ecosystem.config.cjs` sobe Next (3000) e Socket (3001)
- Requer Node.js e MongoDB instalados diretamente no servidor

### Vercel

- Socket-server precisa de host Node separado (Vercel não suporta WebSocket)

## Testes

- **Unitários**: Vitest (preferido para Next.js 16) ou Jest
- **E2E**: Playwright
- Padrão: Arrange-Act-Assert
- Cobertura mínima: 80%

## Convenções

- Testes unitários em `__tests__/` ou `*.test.ts` ao lado dos arquivos
- Testes E2E em `e2e/` na raiz
- Mocks de banco em `tests/mocks/`
- Fixtures Playwright em `e2e/fixtures/`
