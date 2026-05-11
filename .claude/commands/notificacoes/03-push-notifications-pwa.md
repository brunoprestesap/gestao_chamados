# Push Notifications (PWA)

Prioridade: 3 | Complexidade: Alta | Dependências: VAPID keys, Service Worker funcional

## Objetivo

Implementar Web Push API para enviar notificações nativas do navegador mesmo com a aba fechada. Hoje o projeto já tem Service Worker registrado (`public/sw.js`) com handler de push event, mas falta toda a infraestrutura de subscrição e envio server-side.

## Contexto do Projeto

### PWA existente (parcial)

- **Service Worker**: `public/sw.js` (22 linhas) — handler de `push` event que exibe notificação + handler de `notificationclick` que abre `/dashboard`
- **Registro**: `components/pwa/service-worker-register.tsx` — registra `/sw.js` no mount
- **Manifest**: `app/manifest.webmanifest/route.ts` ou `public/manifest.json` — presente
- **Next.js config**: `next.config.ts` — headers para sw.js com no-cache e CSP
- **Ícones**: `icon-192x192.svg` referenciado no sw.js

### O que falta

- Geração e armazenamento de VAPID keys
- Gestão de subscriptions (PushSubscription) no client e server
- Endpoint server-side para enviar push via web-push library
- UI para solicitar permissão do navegador
- Persistência de subscriptions no MongoDB

### Notificações atuais

- 11 tipos em `models/Notification.ts`
- Entrega via Socket.IO + MongoDB
- `components/realtime/RealtimeProvider.tsx` — toasts e som

### Socket events

- `shared/socket.ts` — 11 payloads tipados
- `lib/realtime-emit.ts` — emitToRoom fire-and-forget

## Tarefas

### Infraestrutura VAPID

1. Instale web-push:

   ```bash
   npm install web-push
   npm install -D @types/web-push
   ```

2. Gere VAPID keys (one-time):

   ```bash
   npx web-push generate-vapid-keys
   ```

3. Adicione ao `.env.example`:

   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=
   VAPID_PRIVATE_KEY=
   VAPID_SUBJECT=mailto:sigma@ap.trf1.gov.br
   ```

4. Crie `lib/push/web-push-config.ts`:

   ```typescript
   import webpush from 'web-push';

   if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
     webpush.setVapidDetails(
       process.env.VAPID_SUBJECT ?? 'mailto:sigma@ap.trf1.gov.br',
       process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
       process.env.VAPID_PRIVATE_KEY,
     );
   }

   export { webpush };
   ```

### Model de Subscription

5. Crie `models/PushSubscription.ts`:
   - `userId` (ObjectId, ref: User, required, indexed)
   - `endpoint` (String, required, unique)
   - `keys` (objeto):
     - `p256dh` (String, required)
     - `auth` (String, required)
   - `userAgent` (String, optional) — identificar dispositivo
   - `isActive` (Boolean, default: true)
   - Timestamps: true
   - Indexes: `{ userId: 1 }`, `{ endpoint: 1 }` unique

### API Routes

6. Crie `app/api/push/subscribe/route.ts`:
   - POST: requireSession()
   - Body: `{ endpoint, keys: { p256dh, auth }, userAgent }`
   - Upsert PushSubscription (userId + endpoint)
   - Retorne 200

7. Crie `app/api/push/unsubscribe/route.ts`:
   - POST: requireSession()
   - Body: `{ endpoint }`
   - Delete PushSubscription por endpoint + userId
   - Retorne 200

8. Crie `app/api/push/vapid-key/route.ts`:
   - GET: retorne `{ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY }`
   - Público (sem auth) — browser precisa da key para registrar

### Serviço de Envio Push

9. Crie `lib/push/send-push.ts`:
   - `sendPushNotification(userId, payload: { title, body, url, icon? })`:
     - Busque todas PushSubscription ativas do userId
     - Para cada subscription:
       ```typescript
       await webpush.sendNotification(subscription, JSON.stringify(payload));
       ```
     - Se retornar 410 Gone (subscription expirada), marque isActive=false
     - Fire-and-forget: erros logados via console.warn
     - Retorne `{ sent: number, failed: number }`

### Atualização do Service Worker

10. Atualize `public/sw.js`:

    ```javascript
    self.addEventListener('push', (event) => {
      const data = event.data?.json() ?? {};
      const title = data.title ?? 'Sigma — Notificação';
      const options = {
        body: data.body ?? '',
        icon: '/icon-192x192.svg',
        badge: '/icon-192x192.svg',
        vibrate: [100, 50, 100],
        data: { url: data.url ?? '/dashboard' },
        tag: data.tag ?? 'sigma-notification',
        renotify: true,
      };
      event.waitUntil(self.registration.showNotification(title, options));
    });

    self.addEventListener('notificationclick', (event) => {
      event.notification.close();
      const url = event.notification.data?.url ?? '/dashboard';
      event.waitUntil(clients.openWindow(url));
    });
    ```

### Componente de Permissão

11. Crie `components/pwa/push-permission-banner.tsx`:
    - Client component
    - Verifica `Notification.permission` no mount
    - Se 'default' (não perguntado): exibe banner discreto no topo:
      "Ative notificações para receber alertas em tempo real" + botão "Ativar"
    - Ao clicar "Ativar":
      - `Notification.requestPermission()`
      - Se 'granted': registre subscription via service worker
        ```typescript
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          body: JSON.stringify(sub.toJSON()),
        });
        ```
      - Exiba toast de sucesso
    - Se 'denied': não exiba nada (respeitou a decisão)
    - Se 'granted' e subscription ativa: não exiba nada
    - Persista estado "banner dismissed" em localStorage

12. Integre o banner no `components/dashboard/dashboard-shell.tsx` ou `app/(dashboard)/layout.tsx`

### Integração nos pontos de criação

13. Em cada Server Action que cria notificações, após NotificationModel.create e emitToRoom:

    ```typescript
    sendPushNotification(userId, {
      title: 'Chamado atribuído',
      body: `Chamado ${ticketNumber} foi atribuído a você`,
      url: `/chamados-atribuidos/${ticketId}`,
    }).catch(() => {});
    ```

    Usar mesmos textos do template de email (reutilizar função de texto) para consistência.

### Integração com Preferências (se command 02 implementado)

14. Antes de enviar push, verifique preferências:
    ```typescript
    const shouldPush = await shouldDeliver(userId, eventType, 'push');
    if (shouldPush) {
      sendPushNotification(userId, payload).catch(() => {});
    }
    ```
    Se command 02 não implementado, enviar sempre.

### Docker

15. Em `docker-compose.yml`, repasse VAPID vars para next-app:
    ```yaml
    environment:
      - NEXT_PUBLIC_VAPID_PUBLIC_KEY
      - VAPID_PRIVATE_KEY
      - VAPID_SUBJECT
    ```

## Regras

- Push é fire-and-forget: falha NUNCA bloqueia operação principal
- Se VAPID keys não configuradas, pule envio silenciosamente
- Limpe subscriptions expiradas (410 Gone) automaticamente
- `tag` no notification options evita duplicatas no mesmo dispositivo
- `renotify: true` força vibração mesmo com tag duplicada
- O sw.js deve ser servido da raiz (`/sw.js`) com scope `/`
- Siga lint: simple-import-sort, sem console.log, eqeqeq
- Rode `npm run lint` ao final
