# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@1.1.1 create --template minimal --types ts --add tailwindcss="plugins:none" drizzle="database:sqlite+sqlite:libsql" better-auth="demo:password" --install bun neoactyl
```

## Adding features

Add features to your project with `sv add`:

```sh
npx sv add
```

For example, to add Tailwind CSS:

```sh
npx sv add tailwindcss
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## AFK earning over WebSockets

AFK credits are awarded by a WebSocket gateway that runs **inside the same
SvelteKit/Vite HTTP server**. 

1. `POST /api/afk/session` checks the signed-in user and returns a short-lived,
   HMAC-signed, single-use ticket plus the socket URL.
2. The browser opens `/api/afk/ws?ticket=…`. The gateway validates the ticket,
   origin, optional IP/user-agent binding and per-IP session cap.
3. The browser sends presence heartbeats. The gateway measures every interval
   itself, rejects gaps outside the configured bounds, and posts the eligible
   seconds to `POST /api/afk/internal/ingest` with an HMAC signature.
4. Only that internal endpoint writes credits. A browser can never submit an
   amount of time or credits directly.
5. Random interactive presence checks must be answered inside the configured
   window. Missed or impossibly fast answers add strikes and eventually put the
   account on cooldown. The daily cap limits the damage from any automated
   client.

All rules live in **Admin → Settings → Economy → AFK earning & anti-abuse** and
apply on the next heartbeat without a restart. Important values:

| Setting | Purpose |
| --- | --- |
| `heartbeatSeconds` | Presence report cadence (5–120s). |
| `minHeartbeatGapSeconds` / `maxHeartbeatGapSeconds` | Server-measured window that may be credited. |
| `idleTimeoutSeconds` / `minInteractionsPerBeat` | Real input requirement. |
| `challenge*` | Random presence checks, response window and minimum human response time. |
| `maxStrikes` / `cooldownMinutes` | Strike limit and earning lockout. |
| `sessionTicketSeconds` | Ticket lifetime; tickets are single-use. |
| `maxSessionsPerIp` / `bindSessionToIp` / `bindSessionToUserAgent` | Session isolation. |

### Production

`vite build` targets `@sveltejs/adapter-node`. The Vite plugin only covers
`vite dev` and `vite preview`; production uses the `server.ts` entry, which
imports the adapter's HTTP server, attaches the same gateway to it, and keeps
adapter-node's graceful shutdown behaviour:

```sh
bun run build
bun run start
```

`server.ts` reads `BETTER_AUTH_SECRET`, `ORIGIN` (or `BETTER_AUTH_URL`) and the
optional `AFK_INTERNAL_URL` from the environment. Bun loads `.env`
automatically; with plain Node, pass `--env-file=.env` and use a runtime that
can import the TypeScript source.

Serverless platforms (for example Vercel functions) do not keep WebSocket
connections open; the AFK socket needs a long-lived Node process. If the panel
runs behind a reverse proxy, set SvelteKit's `ADDRESS_HEADER` and `XFF_DEPTH`
so the per-IP limits and optional IP binding see the real client address.

## Discord invite bot

The invite bot starts with the web process by default (Discord shard 0). It can
also run as its own process so the bot is not tied to the web server.

```sh
# Default: the web process hosts shard 0 of a single-shard bot, and no extra
# process is needed.
# DISCORD_SHARD_COUNT=1 DISCORD_SHARD_IDS=0

# Option A: keep shard 0 embedded in the web process and host the other shards
# separately. Every process needs the same token, database and shard count, and
# together they must cover every shard id.
# web process env:
DISCORD_SHARD_COUNT=4 DISCORD_SHARD_IDS=0
# bot worker hosts:
DISCORD_SHARD_COUNT=4 DISCORD_SHARD_IDS=1 bun run bot
DISCORD_SHARD_COUNT=4 DISCORD_SHARD_IDS=2 bun run bot
DISCORD_SHARD_COUNT=4 DISCORD_SHARD_IDS=3 bun run bot

# Option B: run the whole bot outside the web process.
# web process env:
DISCORD_EMBED_BOT=false
# bot worker hosts (all shards, or one process per shard):
DISCORD_SHARD_COUNT=1 bun run bot
```

Each Discord guild is served by exactly one shard
(`(guild_id >> 22) % shard_count`), so extra shards only do work when the bot is
in enough guilds. Running a client with a different `DISCORD_SHARD_COUNT` (for
example the unsharded default next to a 4-shard worker) makes it receive the
same guild events as the shard it overlaps. A separate host must also be able to
reach the same database; `file:local.db` is not shared between machines. Use a
networked libSQL/Turso URL and the same `SETTINGS_ENCRYPTION_KEY` (or provide
`DISCORD_BOT_TOKEN` directly).
