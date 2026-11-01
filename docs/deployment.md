# Deployment

Neoactyl must run as a long-lived Node/Bun process. The AFK WebSocket gateway attaches to the same HTTP server, and background jobs run inside the process, so serverless and edge runtimes are not supported.

## Docker Compose

The repository includes `Dockerfile` and `docker-compose.yml`.

```bash
cp .env.example .env
```

Edit `.env` and set at least:

```dotenv
ORIGIN=https://panel.example.com
BETTER_AUTH_URL=https://panel.example.com
BETTER_AUTH_SECRET=<32 or more random characters>
SETTINGS_ENCRYPTION_KEY=<32 or more random characters>
```

Build and start:

```bash
docker compose up -d --build
```

The panel listens on port `3000` by default. Open <http://localhost:3000> and complete `/setup`.

Useful commands:

```bash
docker compose logs -f panel
docker compose ps
docker compose restart panel
docker compose down
```

### Container layout

| Path      | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `/data`   | Persisted data directory. Compose bind-mounts `./data` from the host.   |
| `/app`    | Application code, build output, migrations, and production dependencies. |

The Compose file overrides `DATABASE_URL` to `file:/data/neoactyl.db`, so the SQLite database survives container rebuilds. If you use an external libSQL/Turso database, replace that value with your connection string and remove the volume if it is no longer needed.

On start, the container:

1. Applies the checked-in Drizzle migrations (`bun scripts/migrate.ts`).
2. Starts the production server (`bun server.ts`).
3. Creates any remaining operational tables on the first request.

### Ports

Change the host port without editing the compose file:

```bash
PANEL_PORT=8080 docker compose up -d
```

The container always listens on `3000` internally.

## Running without Docker

```bash
bun install
cp .env.example .env
# edit .env
bun run build
bun run db:migrate:prod
bun run start
```

The production entry point is `server.ts`, which loads the adapter-node build and attaches the AFK gateway. `PORT` defaults to `3000`. Bun loads `.env` automatically; with plain Node, pass `--env-file=.env`.

Run the app under a process supervisor (systemd, another container runtime, or a platform that supports long-lived processes). Do not run multiple independent copies against the same SQLite file.

## Reverse proxy

Terminate TLS at a reverse proxy and forward to Neoactyl. Set `ORIGIN` (and usually `BETTER_AUTH_URL`) to the public `https://` URL.

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name panel.example.com;

    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # AFK uses a WebSocket at /api/afk/ws
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
    }
}
```

When running behind a proxy, also give the app the proxy headers so rate limiting and generated URLs behave correctly. In Compose:

```yaml
environment:
  ADDRESS_HEADER: X-Forwarded-For
  XFF_DEPTH: "1"
  PROTOCOL_HEADER: X-Forwarded-Proto
  HOST_HEADER: X-Forwarded-Host
```

`XFF_DEPTH` is the number of trusted proxies between the client and the app. Adjust it if you have more than one proxy layer.

`BODY_SIZE_LIMIT` defaults to `512M` in `server.ts` because the file manager streams uploads through the app. Keep the proxy's body limit at least as large.

## Integrations

### Stripe

Add the webhook endpoint in the Stripe dashboard:

```text
https://panel.example.com/api/auth/stripe/webhook
```

Subscribe to at least:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, or configure them in admin settings. Admin settings take precedence over environment variables.

For local development:

```bash
bun run stripe:forward
```

### Discord

The Discord bot can run inside the web process (default) or as a separate process.

To run it separately:

1. Set `DISCORD_EMBED_BOT=false` for the web process.
2. Run `bun run bot` with the same `DATABASE_URL`, `BETTER_AUTH_SECRET`, and Discord configuration.

For multiple shards, every bot process must use the same token, the same `DISCORD_SHARD_COUNT`, and different, non-overlapping `DISCORD_SHARD_IDS`. Discord requires all shards to be online together.

With Docker, the image entrypoint starts the web server. To run the bot as a separate container, override the entrypoint:

```bash
docker run -d --name neoactyl-bot \
  --env-file .env \
  -e DISCORD_EMBED_BOT=false \
  -e DATABASE_URL=file:/data/neoactyl.db \
  -v "$PWD/data:/data" \
  neoactyl:latest \
  bun scripts/discord-bot.ts
```

The web container must also have `DISCORD_EMBED_BOT=false` when the separate bot owns the gateway connection.

## Backups

For the default SQLite deployment, back up the `data/` directory, or at minimum `data/neoactyl.db`. SQLite may also create `-wal` and `-shm` files while the app is running; stop the container before copying files for a consistent snapshot:

```bash
docker compose stop panel
cp -r data "backup-$(date +%Y%m%d)"
docker compose start panel
```

For a hosted libSQL/Turso database, use the provider's backup tooling. Back up `.env` separately and securely; losing `SETTINGS_ENCRYPTION_KEY` makes stored panel tokens unreadable.

## Upgrades

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on container start. Before a major upgrade, take a database backup and read the release notes or commit history for manual steps.

## Health checks and logs

- The image defines a health check against `/`; `docker compose ps` shows the container health.
- Application logs go to stdout, so `docker compose logs -f panel` shows startup, adapter, AFK, Discord, and renewal messages.
- Operational events and errors are also available in `/admin` under Logs and System Health.
- If the panel becomes unreachable, check that `ORIGIN` matches the URL in the browser and that the reverse proxy forwards WebSocket upgrade headers for `/api/afk/ws`.
