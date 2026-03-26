# --- Estágio de build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Variáveis necessárias apenas durante o build (não conecta de fato)
ENV MONGODB_URI="mongodb://placeholder:27017/build"
ENV AUTH_SECRET="build-secret-placeholder"
ENV SOCKET_INTERNAL_SECRET="build-secret-placeholder"
ENV SOCKET_EMIT_URL="http://placeholder:3001/emit"
ENV NEXT_PUBLIC_SOCKET_URL="http://placeholder:3001"

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
