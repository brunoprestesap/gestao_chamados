# Deploy em produção com Docker

Este documento descreve como colocar a aplicação **Severino** em produção usando Docker: arquivos necessários, variáveis de ambiente e passos de uso.

## Visão geral da aplicação

| Componente        | Tecnologia              | Porta |
| ----------------- | ----------------------- | ----- |
| **Next.js**       | App principal (Next 16) | 3000  |
| **socket-server** | Express + Socket.IO     | 3001  |
| **MongoDB**       | Banco de dados          | 27017 |

---

## 1. Alteração no `next.config.ts`

Para o Docker usar o output standalone (build enxuto), adicione `output: 'standalone'`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
};

export default nextConfig;
```

---

## 2. `.dockerignore` (raiz do projeto)

Crie na raiz do projeto para evitar enviar arquivos desnecessários ao build do Next:

```gitignore
# Dependências e build
node_modules
.next
npm-debug.log*

# Socket-server (build separado; evita copiar para o contexto do Next)
socket-server/node_modules
socket-server/dist

# Dev e ambiente
.env*
!.env.example

# Git e IDE
.git
.gitignore
.vscode
*.md
```

---

## 3. Dockerfile do Next.js (raiz do projeto)

Crie o arquivo **`Dockerfile`** na raiz (ao lado de `package.json`):

```dockerfile
# --- Estágio de build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Estágio de produção ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

---

## 4. Dockerfile do socket-server

Crie o arquivo **`socket-server/Dockerfile`** dentro da pasta `socket-server`:

```dockerfile
# --- Estágio de build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Estágio de produção ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER app

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

---

## 5. `docker-compose.yml` (raiz do projeto)

Crie **`docker-compose.yml`** na raiz:

```yaml
services:
  next-app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongodb:27017/manutencao
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_COOKIE_NAME: ${AUTH_COOKIE_NAME:-session}
      AUTH_COOKIE_SECURE: ${AUTH_COOKIE_SECURE:-false}
      SOCKET_INTERNAL_SECRET: ${SOCKET_INTERNAL_SECRET}
      SOCKET_EMIT_URL: http://socket-server:3001/emit
      NEXT_PUBLIC_SOCKET_URL: ${NEXT_PUBLIC_SOCKET_URL:-http://localhost:3001}
    depends_on:
      mongodb:
        condition: service_started
    restart: unless-stopped

  socket-server:
    build:
      context: ./socket-server
      dockerfile: Dockerfile
    ports:
      - '3001:3001'
    environment:
      NODE_ENV: production
      SOCKET_PORT: 3001
      SOCKET_INTERNAL_SECRET: ${SOCKET_INTERNAL_SECRET}
      SOCKET_CORS_ORIGIN: ${SOCKET_CORS_ORIGIN:-http://localhost:3000}
      APP_URL: http://next-app:3000
    depends_on:
      next-app:
        condition: service_started
    restart: unless-stopped

  mongodb:
    image: mongo:7
    ports:
      - '27017:27017'
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: manutencao
    restart: unless-stopped

volumes:
  mongodb_data:
```

---

## 6. Variáveis de ambiente

### Obrigatórias (definir em `.env` na raiz)

| Variável                 | Descrição                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `AUTH_SECRET`            | Segredo do NextAuth (gerar um forte em produção).             |
| `SOCKET_INTERNAL_SECRET` | Mesmo valor no Next e no socket-server; protege POST `/emit`. |

### Opcionais / produção

| Variável                 | Padrão                  | Descrição                                                                                                                            |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_COOKIE_NAME`       | `session`               | Nome do cookie de sessão.                                                                                                            |
| `AUTH_COOKIE_SECURE`     | `false`                 | Use `true` em produção com HTTPS.                                                                                                    |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:3001` | URL pública do Socket (usada no browser). Em produção: domínio real (ex.: `https://seu-dominio.com` se o proxy encaminhar o socket). |
| `SOCKET_CORS_ORIGIN`     | `http://localhost:3000` | Origem do front. Em produção: URL pública do app (ex.: `https://seu-dominio.com`).                                                   |

### Exemplo de `.env` na raiz (desenvolvimento local com Docker)

```env
AUTH_SECRET=um-segredo-forte-aqui
SOCKET_INTERNAL_SECRET=um-segredo-forte-aqui
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
SOCKET_CORS_ORIGIN=http://localhost:3000
```

**Não commitar** o `.env` com valores reais. Use `.env.example` apenas com chaves sem valores sensíveis.

---

## 7. Passos de uso (ordem recomendada)

1. **Alterar `next.config.ts`**  
   Adicionar `output: 'standalone'` (conteúdo na seção 1).

2. **Criar `.dockerignore`** na raiz  
   Conteúdo da seção 2.

3. **Criar `Dockerfile`** na raiz  
   Conteúdo da seção 3.

4. **Criar `socket-server/Dockerfile`**  
   Conteúdo da seção 4.

5. **Criar `docker-compose.yml`** na raiz  
   Conteúdo da seção 5.

6. **Criar `.env`** na raiz  
   Com `AUTH_SECRET` e `SOCKET_INTERNAL_SECRET` (e as demais conforme necessário).

7. **Subir os serviços**  
   Na raiz do projeto:

   ```bash
   docker compose up --build
   ```

   - App: **http://localhost:3000**
   - Socket (para o cliente): padrão `NEXT_PUBLIC_SOCKET_URL=http://localhost:3001`

8. **Produção**  
   Ajustar `.env` com domínio real, HTTPS e `AUTH_COOKIE_SECURE=true`. Garantir que o proxy reverso encaminhe o tráfego do Socket para o serviço `socket-server:3001` e que `NEXT_PUBLIC_SOCKET_URL` e `SOCKET_CORS_ORIGIN` correspondam à URL que o browser usa.

---

## 8. Produção com proxy reverso (HTTPS)

Em produção é comum usar Nginx, Traefik ou Caddy na frente:

- Terminar HTTPS.
- Encaminhar:
  - `https://seu-dominio.com` → **next-app:3000**
  - Socket (por path ou subdomínio) → **socket-server:3001**

Assim, `NEXT_PUBLIC_SOCKET_URL` e `SOCKET_CORS_ORIGIN` ficam alinhados ao domínio acessado pelo usuário.

---

## 9. Observação: POST `/emit` e rede Docker

O socket-server pode restringir o POST `/emit` a `127.0.0.1` / `::1`. No Docker, as requisições partem do container **next-app**, então o IP de origem não será localhost. Se o código do socket-server checar o IP do cliente, será preciso ajustar para aceitar a rede interna do Docker (por exemplo, a rede padrão do Compose) ou confiar apenas no header `x-internal-secret` e não depender só do IP. Verifique em `socket-server/src/index.ts` a rota POST `/emit` e a validação de IP.

---

## 10. MongoDB em produção

Para produção com maior resiliência, considere usar um MongoDB gerenciado (ex.: Atlas) em vez do container. Nesse caso, remova ou não use o serviço `mongodb` no `docker-compose` e defina `MONGODB_URI` no serviço `next-app` com a string de conexão do serviço gerenciado.
