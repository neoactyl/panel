# syntax=docker/dockerfile:1

# --- Dependencies -----------------------------------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- Build ------------------------------------------------------------------
# Dependencies are installed with Bun, but the Vite build runs on Node. This
# avoids Bun-specific issues with the current Vite/rolldown toolchain.
FROM node:24-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN node node_modules/vite/bin/vite.js build

# --- Runtime ----------------------------------------------------------------
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# SQLite lives on a volume; create the directory up front so a fresh named
# volume is writable even when it is first mounted by Docker.
RUN mkdir -p /data

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/build ./build
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=build /app/drizzle ./drizzle
# server.ts imports the AFK WebSocket gateway directly, so keep the small set of
# source files it needs at runtime.
COPY --from=build /app/src/lib/server/afk ./src/lib/server/afk

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
