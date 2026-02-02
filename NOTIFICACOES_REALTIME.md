# Notificações em tempo real

Sistema de notificações realtime (Socket.IO) + persistência (MongoDB).

## Arquitetura

- **Next.js** (porta 3000): App principal; Server Action `assignTicketAction` atualiza o Mongo, cria notificação e chama o socket-server via POST /emit.
- **Socket-server** (porta 3001): Express + Socket.IO; autentica via cookie de sessão do app; emite eventos para rooms `user:<userId>`.

## Variáveis de ambiente

### Raiz do projeto (.env.local)

```env
# Já existentes (sessão)
AUTH_SECRET=...
AUTH_COOKIE_NAME=session

# Socket (emit do Next para o socket-server)
SOCKET_EMIT_URL=http://127.0.0.1:3001/emit
SOCKET_INTERNAL_SECRET=um-segredo-forte-aqui
```

### Socket-server (socket-server/.env ou mesmo .env na raiz se carregado)

```env
SOCKET_PORT=3001
SOCKET_INTERNAL_SECRET=um-segredo-forte-aqui   # mesmo valor da raiz
SOCKET_CORS_ORIGIN=http://localhost:3000       # em produção: https://seu-host
AUTH_SECRET=...                                # mesmo do Next
AUTH_COOKIE_NAME=session
```

### Frontend (opcional)

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001   # em produção: wss ou URL do socket
```

## Build e execução

### Comandos exatos

**Instalar dependências do socket-server:**

```bash
cd socket-server
npm install
```

**Desenvolvimento (socket-server):**

```bash
cd socket-server
npm run dev
```

(usa `tsx src/index.ts`)

**Build do socket-server (TypeScript):**

```bash
cd socket-server
npm run build
```

**Produção (PM2):**

```bash
npm run build
cd socket-server && npm run build
pm2 start ecosystem.config.cjs
```

Ou a partir da raiz (scripts do package.json): `npm run socket:dev` e `npm run socket:build`.

### Desenvolvimento (dois terminais)

1. **Terminal 1 – socket-server:** `cd socket-server && npm run dev`
2. **Terminal 2 – Next:** `npm run dev`

## Como testar manualmente

1. **Dois navegadores** (ou uma janela anônima + uma normal):
   - Navegador A: faça login como **Preposto** (ou Admin).
   - Navegador B: faça login como **Técnico**.

2. No navegador do **Preposto**, vá em Gestão de Chamados, escolha um chamado com status "Validado" e **atribua** a um técnico (pode ser o técnico do navegador B).

3. No navegador do **Técnico**, deve aparecer um **toast** em tempo real: "Chamado #XXX atribuído a você" com botão "Abrir chamado".

4. **Notificação persistida**: no navegador do técnico, abra `GET /api/notifications` (ex.: DevTools > Network ou acesse via fetch). Deve retornar a notificação criada (com `readAt: null` até marcar como lida).

5. **Marcar como lida**: `POST /api/notifications/<id>/read` (com sessão do técnico).

## Componentes opcionais

- **NotificationsBell** (`components/realtime/NotificationsBell.tsx`): contador de não lidas. Já inserido no `MobileHeader`; para desktop, pode ser adicionado no header/sidebar conforme necessário.

## Segurança

- **POST /emit**: aceita apenas requisições de localhost (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`); demais IPs retornam 403. Exige header `x-internal-secret` = `SOCKET_INTERNAL_SECRET` (401 se ausente/inválido). Allowlist de eventos (ex.: `ticket:assigned`) e room no formato `user:<id>`.
- **SOCKET_INTERNAL_SECRET**: defina um valor forte e use o mesmo no Next e no socket-server. O server não loga secrets.

---

## Checklist rápido de teste local

1. **Subir socket-server**
   - `cd socket-server && npm install && npm run dev`
   - Deve exibir "listening on port 3001" (ou similar).

2. **Subir Next**
   - Na raiz: `npm run dev`
   - App em http://localhost:3000.

3. **Logar em 2 navegadores**
   - Navegador A: login como **Preposto** (ou Admin).
   - Navegador B: login como **Técnico**.

4. **Atribuir chamado e ver toast**
   - No Preposto: Gestão → chamado "Validado" → Atribuir ao técnico do navegador B.
   - No navegador do Técnico deve aparecer o **toast** em tempo real com "Abrir chamado" (navegação SPA).

5. **Confirmar que /emit recusa requests fora de localhost e sem secret**
   - Sem header: `curl -X POST http://localhost:3001/emit -H "Content-Type: application/json" -d "{\"room\":\"user:123\",\"event\":\"ticket:assigned\",\"payload\":{}}"` → esperado **401**.
   - Com secret mas de IP não local (ex.: de outra máquina na rede): → esperado **403** (se o server estiver acessível).
   - Com secret correto e de localhost: Next ao atribuir chamado deve emitir com sucesso (toast no técnico).
