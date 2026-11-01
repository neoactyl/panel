# Configuration

Neoactyl has two kinds of configuration:

1. **Environment variables** for infrastructure and secrets.
2. **Panel settings** stored in the database and edited from `/admin`.

Environment variables are described in [`.env.example`](../.env.example) and validated at startup by `src/lib/server/config/env.ts`.

## Environment variables

### Required

| Variable             | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | libSQL connection string. Use `file:local.db` for SQLite or a `libsql://`/`https://` URL.   |
| `ORIGIN`             | Public base URL of the panel, for example `https://panel.example.com`.                       |
| `BETTER_AUTH_SECRET` | Secret used to sign sessions and tokens. Use at least 32 random characters in production.     |

Generate a secret with:

```bash
openssl rand -base64 32
```

Empty values are treated as unset. Builds do not require the runtime secrets above: environment validation is relaxed during `vite build` and enforced when the server starts. This means a fresh `.env` copied from `.env.example` can still build, but the app will refuse to start until `ORIGIN` and `BETTER_AUTH_SECRET` are filled in.

### Recommended

| Variable                  | Description                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`         | Base URL used by Better Auth. Defaults to `ORIGIN`. Set it separately only if they should differ.        |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts panel API tokens at rest with AES-256-GCM. 32+ random characters. Falls back to the auth secret. |
| `DATABASE_AUTH_TOKEN`     | Auth token for a networked libSQL/Turso database. Not needed for local SQLite.                           |

Use a dedicated `SETTINGS_ENCRYPTION_KEY` in production. Changing it after panel tokens have been stored makes those tokens unreadable.

### Optional integrations

| Variable                | Description                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | Stripe secret key for credit top-ups. The value in admin settings takes precedence.               |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/auth/stripe/webhook`. The value in admin settings takes precedence.      |
| `DISCORD_CLIENT_ID`     | Discord OAuth client ID. Leave unset to disable "Sign in with Discord".                           |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret.                                                                      |
| `DISCORD_BOT_TOKEN`     | Discord bot token override. The embedded bot also reads its token from admin settings.            |
| `DISCORD_GUILD_ID`      | Primary Discord guild ID override.                                                                |
| `DISCORD_EMBED_BOT`     | `true` (default) starts the bot in the web process. Set `false` when running the bot separately.  |
| `DISCORD_SHARD_COUNT`   | Total number of gateway shards. Must match across every bot process.                              |
| `DISCORD_SHARD_IDS`     | Comma-separated shard IDs handled by this process. Defaults to `0`.                               |

### Runtime and proxy

These are read by the production Node server or by `@sveltejs/adapter-node`:

| Variable          | Description                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `PORT`            | Port the production server listens on. Defaults to `3000`.                                        |
| `BODY_SIZE_LIMIT` | Maximum request body. `server.ts` defaults it to `512M` for file uploads.                         |
| `ADDRESS_HEADER`  | Header containing the client address, for example `X-Forwarded-For`, when running behind a proxy. |
| `XFF_DEPTH`       | Number of trusted proxies in front of the app when using `X-Forwarded-For`.                       |
| `PROTOCOL_HEADER` | Header containing the original protocol, for example `X-Forwarded-Proto`.                         |
| `HOST_HEADER`     | Header containing the original host, for example `X-Forwarded-Host`.                              |

Set the proxy variables when TLS terminates at a reverse proxy. Otherwise rate limiting may see the proxy's address and generated URLs may use the wrong scheme.

## Panel settings

Most behavior is configured from `/admin` after setup. Settings are stored in the `settings` table and cached by the server. Important groups include:

| Group                 | Examples                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Branding              | Panel name, description, logo                                                            |
| Adapter               | Mock or Calagopus, panel URL, API token, node countries                                  |
| Authentication        | Registration, account linking, panel account creation                                    |
| Quotas and defaults   | Per-user CPU/memory/disk limits, default server resources, maximum servers per user      |
| Navigation            | Show or hide AFK, storefront, rewards, invites, and J4R pages                            |
| Features              | Console, file manager, databases, allocations, backups, schedules, startup, subusers     |
| Credits               | Currency name, creation cost, renewal pricing and intervals, top-up options              |
| AFK                   | Enablement, coins per minute, daily cap, heartbeat and anti-cheat rules                   |
| Discord               | OAuth credentials, bot token, guild IDs, J4R and invite rewards                          |
| Monitoring            | Slow request threshold                                                                   |

Defaults are defined in `src/lib/server/config/settings.ts`. New settings should be given a sensible default there so existing installations keep working.

## Secrets

- `.env` is ignored by Git. Never commit real secrets.
- Panel API tokens are encrypted at rest with `SETTINGS_ENCRYPTION_KEY` (or `BETTER_AUTH_SECRET` when no dedicated key is set).
- Rotate the auth secret only when you accept that existing sessions will be invalidated.
- If you run the Discord bot as a separate process, it needs the same `DATABASE_URL` and `BETTER_AUTH_SECRET` as the web process.
