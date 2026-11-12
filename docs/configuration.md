# Configuration

Neoactyl has two kinds of configuration:

1. **Environment variables** for infrastructure and secrets.
2. **Panel settings** stored in the database and edited from `/admin`.

Environment variables are described in [`.env.example`](../.env.example) and validated at startup by `src/lib/server/config/env.ts`.

## Environment variables

### Required

| Variable             | Description                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | libSQL connection string. Use `file:local.db` for SQLite or a `libsql://`/`https://` URL. Aliased by `TURSO_DATABASE_URL`. |
| `ORIGIN`             | Public base URL of the panel, for example `https://panel.example.com`.                                                     |
| `BETTER_AUTH_SECRET` | Secret used to sign sessions and tokens. Use at least 32 random characters in production.                                  |

Generate a secret with:

```bash
openssl rand -base64 32
```

Empty values are treated as unset. Builds do not require the runtime secrets above: environment validation is relaxed during `vite build` and enforced when the server starts. This means a fresh `.env` copied from `.env.example` can still build, but the app will refuse to start until `ORIGIN` and `BETTER_AUTH_SECRET` are filled in.

### Using Turso

Neoactyl uses [libSQL](https://github.com/tursodatabase/libsql), the database engine behind [Turso](https://turso.tech/), so a hosted Turso database is a drop-in replacement for a local SQLite file. Create a database and collect its credentials with the Turso CLI:

```bash
turso db create neoactyl
turso db show neoactyl --url
turso db tokens create neoactyl
```

Then set the values in `.env`:

```dotenv
DATABASE_URL=libsql://neoactyl-your-org.turso.io
DATABASE_AUTH_TOKEN=replace-with-the-token
```

The Turso-native names work too, which is convenient when a hosting integration injects them automatically:

```dotenv
TURSO_DATABASE_URL=libsql://neoactyl-your-org.turso.io
TURSO_AUTH_TOKEN=replace-with-the-token
```

`DATABASE_URL` and `DATABASE_AUTH_TOKEN` take precedence when both names are set. Apply the migrations once before the first start:

```bash
bun run db:migrate:prod
```

Remote databases work with every `drizzle-kit` command (`db:push`, `db:generate`, `db:migrate`, and `db:studio`) because `drizzle.config.ts` detects `libsql://`, `https://`, and `wss://` URLs automatically. Use `db:push` only for development; production installations should apply the migrations in `drizzle/`.

Turso's embedded replicas (a local file kept in sync with a remote primary) are not configured by Neoactyl. Use the direct `libsql://` URL so every web process and bot shard sees the same database.

### Recommended

| Variable                  | Description                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`         | Base URL used by Better Auth. Defaults to `ORIGIN`. Set it separately only if they should differ.             |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts panel API tokens at rest with AES-256-GCM. 32+ random characters. Falls back to the auth secret.     |
| `DATABASE_AUTH_TOKEN`     | Auth token for a networked libSQL/Turso database. Not needed for local SQLite. Aliased by `TURSO_AUTH_TOKEN`. |

Use a dedicated `SETTINGS_ENCRYPTION_KEY` in production. Changing it after panel tokens have been stored makes those tokens unreadable.

### Optional integrations

| Variable                | Description                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`     | Stripe secret key for credit top-ups. The value in admin settings takes precedence.              |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/auth/stripe/webhook`. The value in admin settings takes precedence.     |
| `DISCORD_CLIENT_ID`     | Discord OAuth client ID. Leave unset to disable "Sign in with Discord".                          |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret.                                                                     |
| `DISCORD_BOT_TOKEN`     | Discord bot token override. The embedded bot also reads its token from admin settings.           |
| `DISCORD_GUILD_ID`      | Primary Discord guild ID override.                                                               |
| `DISCORD_EMBED_BOT`     | `true` (default) starts the bot in the web process. Set `false` when running the bot separately. |
| `DISCORD_SHARD_COUNT`   | Total number of gateway shards. Must match across every bot process.                             |
| `DISCORD_SHARD_IDS`     | Comma-separated shard IDs handled by this process. Defaults to `0`.                              |

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

| Group               | Examples                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Branding            | Panel name, description, logo                                                                           |
| Adapter             | Mock, Calagopus or Pterodactyl, panel URL, API token, optional Pterodactyl client token, node countries |
| Authentication      | Registration, account linking, panel account creation                                                   |
| Quotas and defaults | Per-user CPU/memory/disk limits, default server resources, maximum servers per user                     |
| Navigation          | Show or hide AFK, storefront, rewards, invites, and J4R pages                                           |
| Features            | Console, file manager, databases, allocations, backups, schedules, startup, subusers                    |
| Credits             | Currency name, creation cost, renewal pricing and intervals, top-up options                             |
| AFK                 | Enablement, coins per minute, daily cap, heartbeat and anti-cheat rules                                 |
| Discord             | OAuth credentials, bot token, guild IDs, J4R and invite rewards                                         |
| Monitoring          | Slow request threshold                                                                                  |

Defaults are defined in `src/lib/server/config/settings.ts`. New settings should be given a sensible default there so existing installations keep working.

## Email and SMTP

Outgoing email is configured from `/admin/email`. The SMTP password is stored as an encrypted secret, and the rest of the connection details live in the normal settings table.

- Enable **outgoing email** after entering the host, port, sender address and credentials.
- Use **Test connection** to verify the SMTP handshake, then **Send a test** to check delivery.
- Pick which events send email: verification, password reset, server expiring, suspension, deletion warning, deletion, renewal failure, renewal, successful top-up, gifts, vouchers, referrals and Discord rewards. In-app notifications are always recorded even when the matching email is turned off.
- **Require verified email** additionally blocks sign-in until the address is confirmed. Verification emails are always sent while this is enabled, even if the optional verification event is off.
- Every message uses the editable **Base layout** plus a per-event subject and HTML body. Placeholders such as `{{userName}}`, `{{actionUrl}}` and `{{serverId}}` are listed in the editor; `{{content}}` in the layout is replaced with the message body. **Restore default** brings back the built-in template.

Customised templates are stored as JSON on disk, never in the database. The file is written next to the SQLite database when `DATABASE_URL` uses a `file:` URL (for example `/data/email-templates.json` in the Docker setup), otherwise to `data/email-templates.json`. Set `EMAIL_TEMPLATES_FILE` to choose another path. Only templates that differ from the built-in defaults are stored, so back up that file if you want to keep your edits across container rebuilds. The process needs write access to the directory.

Email is sent through `nodemailer`. The app supports implicit TLS (usually port 465), STARTTLS upgrade, and unauthenticated relays.
