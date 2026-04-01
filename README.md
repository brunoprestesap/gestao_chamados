# Severino

Sistema de gestão de chamados (tickets) com autenticação por perfis, controle de SLA, notificações em tempo real e avaliação de atendimento.

---

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Stack Tecnológica](#stack-tecnológica)
- [Instalação](#instalação)
- [Configuração de Ambiente](#configuração-de-ambiente)
- [Desenvolvimento](#desenvolvimento)
- [Scripts Disponíveis](#scripts-disponíveis)
- [Arquitetura da Aplicação](#arquitetura-da-aplicação)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Funcionalidades](#funcionalidades)
- [Perfis de Usuário](#perfis-de-usuário)
- [Fluxo do Chamado](#fluxo-do-chamado)
- [Produção](#produção)
- [Documentação Complementar](#documentação-complementar)

---

## Pré-requisitos

| Requisito | Versão mínima |
|-----------|---------------|
| Node.js   | 20+           |
| npm       | 9+            |
| MongoDB   | 7+            |

O desenvolvimento exige **dois terminais simultâneos** (aplicação Next.js + servidor Socket.IO).

---

## Stack Tecnológica

| Camada      | Tecnologias                                                            |
|-------------|------------------------------------------------------------------------|
| Frontend    | Next.js 16 (App Router), React 19, Tailwind CSS v4, Radix UI, Framer Motion |
| Backend     | Next.js API Routes, Server Actions, Mongoose                           |
| Banco       | MongoDB                                                                |
| Auth        | NextAuth v5 (Credentials, JWT em cookie HTTP-only)                     |
| Realtime    | Socket.IO (servidor Express separado, porta 3001)                      |
| Estado      | Zustand (sidebar), React Hook Form + Zod (formulários)                 |
| UI          | shadcn/ui (New York), Lucide icons, Sonner (toasts)                    |
| Produção    | PM2 (`ecosystem.config.cjs`) ou Docker Compose                        |

---

## Instalação

```bash
# 1. Clone o repositório
git clone <url-do-repositorio> severino
cd severino

# 2. Instale as dependências da aplicação principal
npm install

# 3. Instale as dependências do socket-server
cd socket-server && npm install && cd ..
```

---

## Configuração de Ambiente

### Aplicação principal — `.env.local` (raiz do projeto)

Crie o arquivo `.env.local` na raiz com as seguintes variáveis:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/manutencao

# NextAuth v5
AUTH_SECRET=<gerar-segredo-forte>
AUTH_COOKIE_NAME=session
# AUTH_COOKIE_SECURE=true       # Habilitar em produção com HTTPS

# Comunicação Next.js → Socket-server
SOCKET_INTERNAL_SECRET=<segredo-compartilhado>
SOCKET_EMIT_URL=http://127.0.0.1:3001/emit

# Bootstrap (opcional — protege endpoint /api/bootstrap para seed)
# BOOTSTRAP_TOKEN=<token-opcional>
```

### Socket-server — `socket-server/.env`

Copie `socket-server/.env.example` (se disponível) ou crie manualmente:

```env
SOCKET_PORT=3001
SOCKET_INTERNAL_SECRET=<mesmo-valor-do-env-local>
SOCKET_CORS_ORIGIN=http://localhost:3000
APP_URL=http://127.0.0.1:3000

AUTH_SECRET=<mesmo-valor-do-env-local>
AUTH_COOKIE_NAME=session
```

> **Importante:** `SOCKET_INTERNAL_SECRET` e `AUTH_SECRET` devem ser idênticos nos dois arquivos de ambiente.

---

## Desenvolvimento

**Terminal 1 — Socket-server:**

```bash
npm run socket:dev
```

**Terminal 2 — Next.js:**

```bash
npm run dev
```

| Serviço        | URL                     |
|----------------|-------------------------|
| Aplicação      | http://localhost:3000    |
| Socket-server  | http://localhost:3001    |

---

## Scripts Disponíveis

| Comando                | Descrição                                    |
|------------------------|----------------------------------------------|
| `npm run dev`          | Inicia o Next.js em modo de desenvolvimento  |
| `npm run build`        | Gera o build de produção do Next.js          |
| `npm run start`        | Inicia o Next.js em modo de produção         |
| `npm run socket:dev`   | Inicia o socket-server em modo de desenvolvimento |
| `npm run socket:build` | Compila o socket-server (TypeScript → JS)    |
| `npm run lint`         | Executa o ESLint                             |
| `npm run lint:fix`     | Executa o ESLint com correção automática     |
| `npm run format`       | Formata o código com Prettier                |
| `npm run format:check` | Verifica a formatação sem alterar arquivos   |

---

## Arquitetura da Aplicação

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│  React 19 + Socket.IO Client + Zustand                  │
└───────────────┬─────────────────────┬───────────────────┘
                │ HTTP/HTTPS          │ WebSocket
                ▼                     ▼
┌───────────────────────┐   ┌────────────────────────────┐
│     Next.js (3000)    │   │   Socket-server (3001)     │
│  ─────────────────    │   │  ──────────────────────    │
│  App Router           │   │  Express + Socket.IO       │
│  API Routes           │──▶│  POST /emit (interno)      │
│  Server Actions       │   │  Validação de sessão       │
│  NextAuth v5 (JWT)    │   │  via GET /api/session/     │
│  Mongoose ODM         │   │  verify (callback)         │
└──────────┬────────────┘   └────────────────────────────┘
           │
           ▼
┌────────────────────────┐
│    MongoDB (27017)     │
│  ────────────────────  │
│  Chamados, Users,      │
│  SLA, Notifications,   │
│  ServiceCatalog, etc.  │
└────────────────────────┘
```

**Fluxo de notificações:** Server Actions emitem eventos para o socket-server via `POST /emit` (autenticado por `x-internal-secret`). O socket-server entrega os eventos aos clientes conectados nas rooms `user:<userId>` ou `managers`. Se o socket-server estiver indisponível, as notificações são persistidas no MongoDB como fallback.

---

## Estrutura do Projeto

```
severino/
├── app/
│   ├── (auth)/                  # Página de login
│   ├── (dashboard)/             # Área autenticada
│   │   ├── catalogo/            #   Catálogo de serviços
│   │   ├── chamados-atribuidos/ #   Chamados do técnico
│   │   ├── configuracoes/       #   Expediente e feriados
│   │   ├── dashboard/           #   Dashboard por perfil
│   │   ├── gestao/              #   Gestão de chamados (Preposto/Admin)
│   │   ├── meus-chamados/       #   Abertura e acompanhamento
│   │   ├── relatorios/imr/      #   Relatórios IMR
│   │   ├── sla/                 #   Configuração de SLA
│   │   ├── unidades/            #   Gestão de unidades
│   │   └── usuarios/            #   Gestão de usuários
│   └── api/                     # API Routes (REST)
├── components/                  # Componentes React
│   ├── ui/                      #   Primitivos (shadcn/ui + Radix)
│   ├── realtime/                #   Listeners Socket.IO
│   ├── sidebar/                 #   Navegação lateral
│   └── providers/               #   Context providers
├── lib/                         # Lógica de negócio e utilitários
│   ├── dal.ts                   #   Data Access Layer (auth guards)
│   ├── db.ts                    #   Conexão MongoDB
│   ├── realtime-emit.ts         #   Emissão de eventos Socket.IO
│   ├── sla-utils.ts             #   Cálculo de SLA
│   └── sla-timezone.ts          #   SLA com timezone e expediente
├── models/                      # Schemas Mongoose
├── shared/                      # Schemas Zod, tipos e constantes
│   ├── auth/                    #   Roles e schemas de login
│   ├── chamados/                #   Schemas de chamados
│   ├── catalog/                 #   Catálogo de serviços
│   ├── sla/                     #   Configuração de SLA
│   └── socket.ts                #   Tipos de eventos compartilhados
├── socket-server/               # Servidor Socket.IO (Express)
├── types/                       # Tipos TypeScript globais
├── ecosystem.config.cjs         # Configuração PM2
├── docker-compose.yml           # Orquestração Docker
└── Dockerfile                   # Build Docker do Next.js
```

---

## Funcionalidades

| Funcionalidade                  | Descrição                                                                 |
|---------------------------------|---------------------------------------------------------------------------|
| Gestão de chamados              | Abertura, classificação, atribuição, execução e encerramento              |
| Controle de SLA                 | Prazos de resposta e resolução por prioridade, respeitando expediente     |
| Notificações em tempo real      | Eventos via Socket.IO com fallback para persistência no MongoDB           |
| Avaliação de atendimento        | Rating 1–5 com comentário opcional, disponível após encerramento          |
| Catálogo de serviços            | Hierarquia de tipos e subtipos para classificação de chamados             |
| Gestão de unidades e usuários   | CRUD completo com controle de perfis e especialidades de técnicos         |
| Configuração de expediente      | Horário comercial, dias úteis e feriados para cálculo de SLA              |
| Dashboards por perfil           | Visões diferenciadas por role do usuário                                  |

---

## Perfis de Usuário

| Perfil         | Permissões principais                                                       |
|----------------|-----------------------------------------------------------------------------|
| **Admin**      | Acesso total: gestão de usuários, unidades, catálogo, SLA, chamados         |
| **Preposto**   | Classificação e gestão de chamados, atribuição de técnicos                  |
| **Técnico**    | Visualização e execução dos chamados atribuídos                             |
| **Solicitante**| Abertura de chamados, acompanhamento e avaliação após encerramento          |

---

## Fluxo do Chamado

```
  Solicitante          Preposto/Admin           Técnico            Solicitante
      │                     │                      │                    │
      │  Abre chamado       │                      │                    │
      │  (aberto)           │                      │                    │
      │────────────────────▶│                      │                    │
      │                     │  Classifica           │                    │
      │                     │  (validado)           │                    │
      │                     │  + snapshot SLA       │                    │
      │                     │─────────────────────▶│                    │
      │                     │  Atribui técnico      │                    │
      │                     │  (em_atendimento)     │                    │
      │                     │                      │  Registra execução │
      │                     │                      │  (concluído)       │
      │                     │  Encerra             │                    │
      │                     │  (encerrado)         │                    │
      │                     │                      │                    │
      │                     │                      │                    │
      │  Avalia (opcional)  │                      │                    │
      │  rating 1–5         │                      │                    │
```

**Status possíveis:** `aberto` → `validado` → `em_atendimento` → `concluído` → `encerrado` | `cancelado`

---

## Produção

### Opção 1 — PM2

```bash
# Build
npm run build
npm run socket:build

# Iniciar com PM2
pm2 start ecosystem.config.cjs
```

O PM2 gerencia dois processos: Next.js (porta 3000) e socket-server (porta 3001).

### Opção 2 — Docker Compose

```bash
# Criar .env na raiz com AUTH_SECRET e SOCKET_INTERNAL_SECRET
docker compose up --build
```

Consulte [DOCKER_PRODUCAO.md](./DOCKER_PRODUCAO.md) para instruções detalhadas, incluindo configuração de proxy reverso e HTTPS.

> **Nota para produção:** Defina `AUTH_COOKIE_SECURE=true` quando servindo via HTTPS. Ajuste `NEXT_PUBLIC_SOCKET_URL`, `SOCKET_CORS_ORIGIN` e `APP_URL` para o domínio público.

---

## Documentação Complementar

| Documento | Descrição |
|-----------|-----------|
| [DOCKER_PRODUCAO.md](./DOCKER_PRODUCAO.md)       | Deploy com Docker Compose, Dockerfiles e proxy reverso |
| [NOTIFICACOES_REALTIME.md](./NOTIFICACOES_REALTIME.md) | Arquitetura do Socket.IO e fluxo de notificações |
| [DIAGNOSTICO_SLA.md](./DIAGNOSTICO_SLA.md)       | Configuração de SLA, cálculos de prazo e expediente |
