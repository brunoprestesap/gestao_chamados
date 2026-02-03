# Severino

Sistema de **gestão de chamados** (tickets) com autenticação por perfis, SLA, notificações em tempo real e avaliação de atendimento. Desenvolvido com Next.js, MongoDB e Socket.IO.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS, Radix UI, Framer Motion, Zustand
- **Backend:** Next.js API Routes, Server Actions, Mongoose
- **Banco:** MongoDB
- **Auth:** NextAuth v5 (Credentials, JWT em cookie)
- **Realtime:** Socket.IO (servidor separado na porta 3001)

## Pré-requisitos

- Node.js 20+
- MongoDB (local ou URI remota)
- Dois terminais para desenvolvimento (Next + socket-server)

## Instalação

```bash
# Clone e entre na pasta
cd severino

# Dependências do app principal
npm install

# Dependências do socket-server
cd socket-server && npm install && cd ..
```

## Variáveis de ambiente

### Raiz do projeto (`.env.local`)

Crie `.env.local` na raiz com:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/manutencao

# NextAuth v5 (sessão)
AUTH_SECRET=seu-segredo-forte-aqui
AUTH_COOKIE_NAME=session
# Em produção com HTTPS, use AUTH_COOKIE_SECURE=true para cookies seguros
# AUTH_COOKIE_SECURE=true

# Bootstrap (opcional, para seed/scripts)
BOOTSTRAP_TOKEN=token-opcional

# Socket: emissão do Next para o socket-server (mesmo segredo do socket-server)
SOCKET_INTERNAL_SECRET=um-segredo-forte-aqui
SOCKET_EMIT_URL=http://127.0.0.1:3001/emit
```

### Socket-server (`socket-server/.env`)

Copie de `socket-server/.env.example` e preencha:

```env
SOCKET_PORT=3001
SOCKET_INTERNAL_SECRET=um-segredo-forte-aqui   # mesmo valor do .env.local da raiz
SOCKET_CORS_ORIGIN=http://localhost:3000
APP_URL=http://127.0.0.1:3000   # URL do app Next.js (validação de sessão em /api/session/verify)

AUTH_SECRET=mesmo-do-next
AUTH_COOKIE_NAME=session
```

**Importante:** `SOCKET_INTERNAL_SECRET` deve ser idêntico no `.env.local` (raiz) e no `socket-server/.env`. Em produção, defina `APP_URL` com a URL pública do app (ex.: `https://seu-dominio.com`).

## Desenvolvimento

É necessário rodar **dois processos**:

**Terminal 1 – Socket-server (notificações em tempo real):**

```bash
npm run socket:dev
# ou: cd socket-server && npm run dev
```

**Terminal 2 – Next.js:**

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). O socket-server fica em `http://localhost:3001`.

## Scripts

| Comando                | Descrição                              |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Sobe o Next.js em modo desenvolvimento |
| `npm run build`        | Build do Next.js                       |
| `npm run start`        | Sobe o Next.js em produção             |
| `npm run socket:dev`   | Sobe o socket-server em modo dev       |
| `npm run socket:build` | Build do socket-server (TypeScript)    |
| `npm run lint`         | Executa o ESLint                       |
| `npm run lint:fix`     | Corrige automaticamente o lint         |
| `npm run format`       | Formata o código com Prettier          |
| `npm run format:check` | Verifica formatação Prettier           |

## Estrutura do projeto (resumo)

```
severino/
├── app/
│   ├── (auth)/          # Login
│   ├── (dashboard)/     # Área logada
│   │   ├── catalogo/    # Catálogo de serviços
│   │   ├── chamados-atribuidos/  # Chamados do técnico
│   │   ├── configuracoes/       # Expediente, feriados
│   │   ├── dashboard/   # Início por perfil
│   │   ├── gestao/      # Gestão de chamados (preposto/admin)
│   │   ├── meus-chamados/  # Abertura e acompanhamento
│   │   ├── relatorios/imr/
│   │   ├── sla/         # Configuração de SLA
│   │   ├── unidades/
│   │   └── usuarios/
│   └── api/             # API Routes
├── components/          # Componentes React (UI, realtime, etc.)
├── lib/                 # Utilitários, DAL, auth, SLA, notificações
├── models/              # Modelos Mongoose
├── shared/              # Schemas Zod, constantes, tipos
├── socket-server/       # Servidor Socket.IO (Express)
└── types/
```

## Funcionalidades principais

- **Perfis:** Admin, Preposto, Solicitante, Técnico (controle por `shared/auth`)
- **Chamados:** Abertura (solicitante), classificação, atribuição, execução, encerramento
- **SLA:** Configuração por prioridade, prazos de resposta e resolução, horário comercial (08–18h, seg–sex)
- **Notificações em tempo real:** Socket.IO; notificações persistidas no MongoDB (ver [NOTIFICACOES_REALTIME.md](./NOTIFICACOES_REALTIME.md))
- **Avaliação:** Após encerramento, apenas o criador do chamado pode avaliar (1–5 e comentário)
- **Catálogo de serviços:** Tipos e subtipos para classificação de chamados
- **Unidades e usuários:** CRUD; feriados e expediente em configurações

## Documentação adicional

- **[NOTIFICACOES_REALTIME.md](./NOTIFICACOES_REALTIME.md)** — Arquitetura do Socket.IO, variáveis de ambiente e fluxo de notificações
- **[DIAGNOSTICO_SLA.md](./DIAGNOSTICO_SLA.md)** — Configuração de SLA, cálculos de prazos e horário comercial

## Verificação — Avaliação de chamados

Cenários manuais para validar o fluxo de avaliação:

### 1. Encerrar chamado sem avaliação

1. Preposto/Admin encerra um chamado (status Concluído → Encerrado).
2. O criador acessa **Meus Chamados** ou o **detalhe** do chamado.
3. **Esperado:** Card "Avaliação" com texto **"Pendente"** e botão **"Avaliar"**; na lista, badge **"Avaliar"**. Usuário que não é o criador não vê o card de avaliação no detalhe.

### 2. Após enviar avaliação

1. O criador abre **"Avaliar Atendimento"**, escolhe rating 1–5 (e opcionalmente comentário) e clica em **"Enviar Avaliação"**.
2. **Esperado:** Modal fecha; card "Avaliação" mostra **"Avaliado"** com "· X/5"; na lista, badge **"Avaliado"**; botão **"Avaliar"** some e não é possível avaliar de novo.

## Produção (PM2)

Após build do Next e do socket-server:

```bash
npm run build
npm run socket:build
pm2 start ecosystem.config.cjs
```

O `ecosystem.config.cjs` sobe o Next na porta 3000 e o socket-server na 3001.

## Deploy (Vercel e outros)

- O Next.js pode ser deployado na [Vercel](https://vercel.com) ou em qualquer host Node.
- **Produção com HTTPS:** defina `AUTH_COOKIE_SECURE=true` no ambiente para que o NextAuth use cookies seguros.
- O **socket-server** precisa de um servidor Node separado (ou outro host que rode Node), com as mesmas variáveis de ambiente descritas em [NOTIFICACOES_REALTIME.md](./NOTIFICACOES_REALTIME.md). Ajuste `SOCKET_EMIT_URL`, `SOCKET_CORS_ORIGIN` e `APP_URL` (URL do app para validação de sessão) para a URL do front em produção.
