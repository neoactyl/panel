# Contributing to Neoactyl

Thanks for taking the time to contribute. Neoactyl is an open-source game hosting panel, and help with code, documentation, bug reports, and testing is genuinely appreciated.

## Project status

Neoactyl is under active development. Internal APIs, database tables, and user-facing screens can change without much notice. Please keep that in mind when building on top of the project, and mention the version or commit you tested against in issues and pull requests.

## Ways to contribute

- Report bugs with clear reproduction steps.
- Suggest features or improvements by opening an issue first.
- Improve documentation, examples, or setup instructions.
- Test changes against the Mock adapter and, when possible, a real backend.
- Submit code changes for bugs, features, or adapters.

For large changes, open an issue before writing a lot of code. It is easier to agree on an approach before the implementation exists.

## Development setup

### Requirements

- [Bun](https://bun.sh/) (use a current stable release)
- Git
- A supported database. SQLite/libSQL is used by default and is the easiest option for development.
- Optional: a Calagopus panel and API token, or use the built-in Mock adapter.

### First-time setup

```bash
git clone https://github.com/neoactyl/panel.git
cd panel
bun install
cp .env.example .env
```

Edit `.env` and set at least:

```dotenv
DATABASE_URL=file:local.db
ORIGIN=http://localhost:5173
BETTER_AUTH_SECRET=<32 or more random characters>
```

Generate a secret with OpenSSL if you like:

```bash
openssl rand -base64 32
```

Create the database schema. For a fresh development database, push the current schema:

```bash
bun run db:push
```

If you are working with the checked-in migration history instead, apply it with:

```bash
bun run db:migrate
```

Do not mix `db:push` and `db:migrate` on the same development database unless you know what you are doing. `db:push` is convenient while iterating; the migrations in `drizzle/` are what production deployments use.

Start the development server:

```bash
bun run dev
```

Open <http://localhost:5173>. On an empty database you are sent to `/setup`, where you create the first administrator account and choose the panel adapter.

### Running with Docker

A production-oriented Docker setup is included:

```bash
cp .env.example .env
# edit .env, especially BETTER_AUTH_SECRET
docker compose up -d --build
```

The panel is then available on <http://localhost:3000>. See [docs/deployment.md](docs/deployment.md) for volumes, reverse proxies, and upgrades.

## Repository layout

| Path                    | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `src/routes`            | SvelteKit routes, pages, and API endpoints                                   |
| `src/lib/components`    | Reusable UI components (including shadcn-svelte components)                  |
| `src/lib/server`        | Server-only code: auth, billing, database, Discord, rewards, AFK, settings   |
| `src/lib/adapter`       | Shared adapter contract and the browser-side adapter client                  |
| `src/lib/server/panel`  | Adapter implementations and adapter selection logic                          |
| `drizzle`               | Checked-in SQL migrations and metadata used in production                    |
| `scripts`               | Standalone scripts such as the Discord bot and production migration runner   |
| `static`                | Static assets served as-is                                                   |
| `docs`                  | Project documentation                                                        |

## Coding guidelines

### General

- Use TypeScript and keep the existing style of the file you are editing (quotes, indentation, naming).
- Keep secrets and privileged logic out of client-side code. Anything that touches tokens, the database, Stripe, Discord, or the panel backend belongs in `src/lib/server`.
- Prefer the existing helpers and patterns over introducing a second way to do the same thing.
- Keep pull requests focused. Unrelated refactors make review harder.

### Svelte and UI

- The project uses Svelte 5 runes mode. Use `$state`, `$derived`, `$effect`, and `$props` rather than legacy stores or `export let` where the file already uses runes.
- Reuse components from `src/lib/components/ui` and the existing panel components before adding new primitives.
- UI is styled with Tailwind CSS and shadcn-svelte. Follow the established component structure and use the existing icon set.
- Make sure pages work on both desktop and mobile layouts, and respect the panel feature flags exposed by settings.

### Server code

- Validate untrusted input with Zod or the existing form helpers.
- Return safe error messages to users. Unexpected errors are logged by the centralized error handling; do not leak stack traces or secrets.
- Use the existing activity and error logging helpers instead of `console.log` for operational events.
- Keep long-running work out of request handlers where possible. Existing background work is started from `src/lib/server/lifecycle.ts`.

### Database changes

The Drizzle schema lives in `src/lib/server/db`. The panel's core auth tables are generated by Better Auth, while many operational tables are created idempotently at startup by `src/lib/server/db/bootstrap.ts`.

When changing the schema:

1. Update the Drizzle schema file.
2. Generate a migration and commit it with your change:

   ```bash
   bun run db:generate
   ```

3. Test the migration against an existing database, not only a fresh one.
4. If you change a table that is created by `bootstrap.ts`, update both the `CREATE TABLE IF NOT EXISTS` statement and the additive migration helper for existing installs.

Production deployments run `bun run db:migrate:prod` before the app starts, which applies the files in `drizzle/` through the Drizzle migrator.

### Working with adapters

Server management backends are implemented as adapters that extend the `Adapter` base class in `src/lib/adapter/sdk.ts`.

- Put backend-specific code under `src/lib/server/panel`.
- Declare capabilities honestly in `capabilities`. The UI uses them to hide unsupported features.
- Implement the required methods and use `unsupported()` for optional ones you genuinely cannot support.
- Return normalized `Server`, `Node`, and other SDK types instead of backend-specific payloads.
- Do not skip ownership checks. Adapters with panel accounts must scope operations to the linked panel user.

See [docs/adapters.md](docs/adapters.md) for the full contract.

## Checks and tests

Run these before opening a pull request:

```bash
bun run check      # SvelteKit sync + svelte-check
bun run test       # Vitest
bun run build      # Production build
```

`bun run test:watch` runs Vitest in watch mode. Add tests for new pure logic, especially parsing, calculations, quotas, renewals, rewards, and adapter normalization. Tests live next to the code as `*.test.ts`.

If you change Docker files, try `docker compose build` and `docker compose up` locally when Docker is available.

## Commits and pull requests

There is no strict commit format, but short, descriptive commit messages are appreciated. For example:

```text
Add Pterodactyl adapter skeleton
Fix renewal reminder timezone handling
Document Docker deployment
```

A good pull request:

- Explains the problem and the approach.
- Links the related issue, if there is one.
- Includes tests or a clear manual test plan.
- Mentions any migrations, new environment variables, or settings.
- Contains screenshots for visible UI changes.
- Keeps generated files and unrelated formatting changes out of the diff.

## Reporting bugs

Include:

- What you expected to happen and what actually happened.
- Steps to reproduce, with the smallest example you can manage.
- The commit or version you tested.
- The adapter you used (Mock, Calagopus, or another).
- Relevant logs or error references from `/admin` logs. Remove secrets, tokens, and personal data first.

## Security

Please do not open a public issue for a security vulnerability. Report it privately to the maintainers, for example through the repository's private security advisory feature, and include enough detail to reproduce the problem. Give the project time to fix the issue before disclosing it publicly.

## License

By contributing, you agree that your contributions are licensed under the same **Creative Commons Attribution (CC BY)** license as the rest of the project. See the [README](README.md#license) for details.
