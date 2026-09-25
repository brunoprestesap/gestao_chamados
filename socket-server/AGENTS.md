# socket-server: notificações em tempo real

Servidor Socket.IO (Express) em processo separado, na porta 3001. É um pacote à parte, com `package.json`, lockfile e `tsconfig.json` próprios, em ESM (`"type": "module"`). O navegador conecta nele por WebSocket e o app Next fala com ele por HTTP (`POST /emit`, via `lib/realtime-emit.ts`). A suíte Vitest da raiz o ignora (`exclude` em `vitest.config.ts`).

## Arquivos principais

| Arquivo        | O que faz                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `src/index.ts` | Servidor, `ALLOWED_EVENTS`, salas (`user:<id>` e `managers`) e a rota `POST /emit`                  |
| `src/auth.ts`  | Valida a sessão do handshake chamando `GET ${APP_URL}/api/session/verify` com o cookie do navegador |
| `Dockerfile`   | Imagem de produção do container `socket-server`                                                     |

## Comandos

```bash
cd socket-server
npm ci
npm run dev     # tsx src/index.ts
npm run build   # tsc, saída em dist/
npm start       # node --env-file=.env dist/index.js
```

Da raiz do projeto: `npm run socket:dev` e `npm run socket:build`. As variáveis ficam em `socket-server/.env`: `SOCKET_PORT` (3001), `SOCKET_CORS_ORIGIN` (padrão `http://localhost:3000`), `APP_URL` (padrão `http://127.0.0.1:3000`), `SOCKET_INTERNAL_SECRET` e `SOCKET_TRUSTED_PROXIES`.

## Convenções

- O handshake não decodifica o JWT. `src/auth.ts` repassa o header `Cookie` ao app e só aceita resposta `ok` com `userId` e `isActive`. Este pacote não lê `AUTH_SECRET`.
- Todo socket entra em `user:<userId>`. Preposto e Admin entram também em `managers`.
- `POST /emit` aplica quatro barreiras, nesta ordem:
  1. header `x-internal-secret` igual a `SOCKET_INTERNAL_SECRET`; sem o segredo configurado, tudo volta 401;
  2. origem confiável (403): localhost sempre, e as faixas privadas `10/8`, `172.16/12` e `192.168/16` só quando `SOCKET_TRUSTED_PROXIES` está definido; o IP vem do primeiro valor de `x-forwarded-for`, se houver;
  3. evento presente em `ALLOWED_EVENTS` (400 `Event not allowed`);
  4. sala `managers` ou no formato de `ROOM_REGEX` (`user:` mais letras, números, `_` ou `-`), senão 400.

## Gotchas

- `ALLOWED_EVENTS` e o tipo `ServerToClientEvents` são cópias manuais de `shared/socket.ts` (o pacote não importa de `shared/`). Evento novo precisa entrar nos dois lugares. Se faltar aqui, o `/emit` responde 400 e, como o app emite sem esperar o resultado, o aviso some sem quebrar nada.
- `README.md` e o comentário do topo de `src/index.ts` estão desatualizados. Eles falam em validar o cookie com `AUTH_SECRET` e `AUTH_COOKIE_NAME`, em `pnpm` e em `/emit` só para `127.0.0.1`. O código chama `/api/session/verify`, o pacote usa npm e as faixas privadas passam com `SOCKET_TRUSTED_PROXIES`.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
