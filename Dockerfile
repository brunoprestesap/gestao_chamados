# --- Estágio de build ---
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Variáveis necessárias apenas durante o build (não conecta de fato)
ENV MONGODB_URI="mongodb://placeholder:27017/build"
ENV AUTH_SECRET="build-secret-placeholder"
ENV SOCKET_INTERNAL_SECRET="build-secret-placeholder"
ENV SOCKET_EMIT_URL="http://placeholder:3001/emit"

# NEXT_PUBLIC_* é embutido no bundle JS durante o build — precisa do valor real
ARG NEXT_PUBLIC_SOCKET_URL="http://sigma.ap.trf1.gov.br"
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

RUN npm run build

# --- Estágio de produção ---
FROM node:24-alpine AS runner

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
