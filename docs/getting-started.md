# Getting started

## Requirements

- [Bun](https://bun.sh/) (current stable release)
- Git
- A supported database. SQLite/libSQL is the default; a networked libSQL/Turso database works too.
- A backend adapter. Use the built-in **Mock** adapter to explore the panel without a game hosting backend, or connect **Calagopus** with a panel URL and API token.

For a container-based install, you only need Docker with the Compose plugin. See [Deployment](deployment.md).

## Local development

```bash
git clone https://github.com/neoactyl/panel.git
cd panel
bun install
cp .env.example .env
```

Set the required values in `.env`:

```dotenv
DATABASE_URL=file:local.db
ORIGIN=http://localhost:5173
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
```

Create the schema on a fresh database:

```bash
bun run db:push
```

Then start the development server:

```bash
bun run dev
```

Open <http://localhost:5173>.

> `db:push` is for development. Existing installations use the migrations in `drizzle/` through `bun run db:migrate` or `bun run db:migrate:prod`.

## First run

When the database contains no users, Neoactyl redirects you to `/setup`.

The setup form creates the first account and makes it an administrator. It also sets:

- **Application name, description, and logo** — used for branding.
- **Adapter** — `Mock` for development, or `Calagopus`.
- **Panel URL and API token** — required for Calagopus, ignored by Mock.

After setup you are signed in and taken to the admin panel. Everything else is configured from `/admin`:

- Storefront plans
- Credits and renewal pricing
- Quotas and default server resources
- Navigation and feature flags
- Stripe and Discord integration
- AFK, rewards, and invite settings

Settings are stored in the database, so changing `.env` is not required for normal configuration changes. See [Configuration](configuration.md).

## Mock adapter vs. Calagopus

| Adapter   | When to use it                                                                 |
| --------- | ------------------------------------------------------------------------------ |
| Mock      | UI development, demos, and testing without a real backend. Data is simulated. |
| Calagopus | A real game hosting deployment. Requires a panel URL and an API token.         |

You can switch the adapter later from the admin settings. If Calagopus is selected without a valid URL and token, Neoactyl falls back to Mock.

## Common commands

| Command                   | Purpose                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `bun run dev`             | Start Vite in development mode with hot reload                       |
| `bun run build`           | Build the production server and client bundles                       |
| `bun run start`           | Run the built app                                                      |
| `bun run check`           | Run `svelte-check` and TypeScript checks                              |
| `bun run test`            | Run the Vitest suite                                                   |
| `bun run db:push`         | Push the current Drizzle schema to the database (development)         |
| `bun run db:generate`     | Generate a new SQL migration from schema changes                      |
| `bun run db:migrate`      | Apply checked-in migrations with drizzle-kit                          |
| `bun run db:migrate:prod` | Apply checked-in migrations with runtime dependencies only            |
| `bun run db:studio`       | Open Drizzle Studio                                                   |
| `bun run bot`             | Run the Discord invite bot as a separate process                      |
| `bun run stripe:forward`  | Forward Stripe webhook events to the local dev server                 |

## Next steps

- [Configure the panel](configuration.md)
- [Understand the architecture](architecture.md)
- [Write an adapter](adapters.md)
- [Deploy with Docker](deployment.md)
