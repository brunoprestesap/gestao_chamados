# Socket Server (realtime)

Servidor Socket.IO em processo separado (porta 3001 por padrão).

## Variáveis de ambiente

- `SOCKET_PORT`: porta (default: 3001)
- `SOCKET_INTERNAL_SECRET`: segredo para proteger POST /emit (obrigatório em produção)
- `SOCKET_CORS_ORIGIN`: origin CORS (default: http://localhost:3000). **Em produção troque para o host real** (ex: https://meuapp.empresa.local)
- `AUTH_SECRET`: mesmo segredo do app Next.js (sessão JWT)
- `AUTH_COOKIE_NAME`: nome do cookie de sessão (default: session)

## Autenticação

O handshake valida o cookie de sessão do app (AUTH_SECRET + AUTH_COOKIE_NAME). Se autenticado, o socket entra na room `user:<userId>`.

## POST /emit

- **Não deixe este endpoint acessível pela internet.** Em on-prem, use apenas localhost (127.0.0.1) ou proteja com header.
- Header obrigatório: `x-internal-secret: <SOCKET_INTERNAL_SECRET>`
- Body: `{ "room": "user:<userId>", "event": "ticket:assigned", "payload": { ... } }`

## Desenvolvimento

```bash
cd socket-server
pnpm install
pnpm dev   # tsx src/index.ts
```

## Build e produção (PM2)

```bash
cd socket-server
pnpm install
pnpm build
pnpm start  # node dist/index.js
```

Ou a partir da raiz do projeto: `pnpm --filter socket-server build` (se configurado workspace).
