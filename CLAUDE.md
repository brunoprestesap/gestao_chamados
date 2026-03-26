# CLAUDE.md — Severino

Sistema de gerenciamento de chamados (tickets) com controle de SLA, catálogo de serviços, notificações em tempo real e dashboards por perfil de usuário.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5** (strict)
- **MongoDB** via **Mongoose** (sem Prisma)
- **NextAuth v5** (beta) — estratégia Credentials com JWT em cookie HTTP-only
- **Socket.IO** — servidor separado em Express (porta 3001) para notificações em tempo real
- **Tailwind CSS v4** + **shadcn/ui** (estilo New York) + **Radix UI** + **Lucide** icons
- **Zustand** (estado do sidebar), **React Hook Form** + **Zod** (formulários/validação)
- **Framer Motion** (animações), **Sonner** (toasts)
- **PM2** para produção (`ecosystem.config.cjs`)
- React Compiler habilitado (`next.config.ts`)

## Estrutura do Projeto

```
app/
  (auth)/login/          — Página de login
  (dashboard)/           — Rotas protegidas (dashboard, chamados, gestão, config, etc.)
  api/                   — REST API routes
components/              — Componentes React (ui/, sidebar/, realtime/, providers/, etc.)
lib/                     — Utilitários e lógica de negócio (dal.ts, db.ts, sla-*.ts, etc.)
models/                  — Schemas Mongoose (Chamado, User, SlaConfig, Notification, etc.)
shared/                  — Tipos, schemas Zod e constantes compartilhadas
socket-server/           — Servidor Socket.IO separado (Express, porta 3001)
```

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

## Variáveis de Ambiente (.env.local)

- `MONGODB_URI` — URI do MongoDB
- `AUTH_SECRET` — Segredo do NextAuth
- `NEXT_PUBLIC_SOCKET_URL` — URL pública do socket-server
- `SOCKET_INTERNAL_SECRET` — Segredo para comunicação interna Next→Socket

## Arquitetura e Padrões

### Autenticação & Autorização
- Login por `username` (matrícula) + senha, hash com bcryptjs
- JWT em cookie seguro, sessão de 7 dias
- DAL centralizada em `lib/dal.ts`: `verifySession()`, `requireSession()`, `requireManager()`, `requireTechnician()`, `requireAdmin()`
- 4 roles: **Admin**, **Preposto**, **Solicitante**, **Técnico**

### Server Actions
- Definidas em `app/(dashboard)/*/actions.ts`
- Validação com Zod, verificação de sessão, emissão de eventos Socket.IO
- Principais: `createTicketAction`, `assignTicketAction`, `submitEvaluationAction`

### API Routes (REST)
- Padrão GET/POST/PATCH/DELETE com auth checks e validação Zod
- Respostas de erro consistentes com status codes

### Notificações em Tempo Real
- `lib/realtime-emit.ts` → emite para socket-server via `emitToRoom()`
- Socket-server valida sessão antes de entregar eventos
- Eventos: `ticket:assigned`, `ticket:new`, `ticket:execution_registered`, `ticket:closed`
- Fallback para MongoDB (model Notification) se socket offline

### SLA
- Configurado por prioridade (BAIXA, NORMAL, ALTA, EMERGENCIAL)
- Cálculo respeita horário de expediente e feriados (`lib/sla-timezone.ts`)
- Snapshot imutável capturado no momento da classificação do chamado
- `lib/sla-utils.ts` — lógica de cálculo de SLA

### Modelos Principais (Mongoose)
- **Chamado** — Ticket com ciclo de vida completo (aberto → validado → em atendimento → concluído → fechado/encerrado)
- **User** — Usuários com roles e especialidades (técnicos)
- **ChamadoHistory** — Trilha de auditoria de todas as ações
- **SlaConfig** — Configuração de SLA por prioridade
- **ServiceCatalog/ServiceType/ServiceSubType** — Catálogo hierárquico de serviços
- **Notification** — Notificações persistentes
- **Unit** — Unidades/departamentos
- **Holiday/BusinessCalendar** — Feriados e horário de expediente

### Validação
- Schemas Zod em `shared/` para todas as entidades
- `safeParse()` em todos os handlers
- Path alias: `@/*` mapeia para raiz do projeto

## Testes

Não há framework de testes configurado (sem Jest, Vitest ou Cypress).

## Lint & Formatação

- ESLint 9 com plugins: `typescript-eslint`, `unused-imports`, `simple-import-sort`
- `console.log` proibido (apenas `warn`/`error` permitidos)
- Prettier para formatação
- `eqeqeq` enforced

## Deploy

- **PM2**: `ecosystem.config.cjs` sobe Next (3000) e Socket (3001)
- **Docker**: documentado em `DOCKER_PRODUCAO.md`
- Socket-server precisa de host Node separado se deploy no Vercel
