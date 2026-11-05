# --- Estágio de build ---
FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx tsc

# Reinstalar apenas deps de produção
RUN rm -rf node_modules && npm ci --omit=dev

# --- Estágio de produção ---
FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# libaio1 é do Instant Client; curl e unzip só servem para baixá-lo.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libaio1 curl unzip ca-certificates \
    && mkdir -p /opt/oracle \
    && cd /opt/oracle \
    && curl -fsSL -o ic.zip \
       https://download.oracle.com/otn_software/linux/instantclient/2380000/instantclient-basiclite-linux.x64-23.8.0.25.04.zip \
    && unzip -q ic.zip \
    && rm ic.zip \
    && echo /opt/oracle/instantclient_23_8 > /etc/ld.so.conf.d/oracle-ic.conf \
    && ldconfig \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/oracle-config /opt/oracle-config

USER app

EXPOSE 3002

CMD ["node", "dist/index.js"]
