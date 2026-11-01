#!/bin/sh
set -eu

# Allow one-off commands, for example running the Discord bot in a separate
# container: docker run ... neoactyl:latest bun scripts/discord-bot.ts
if [ "$#" -gt 0 ]; then
	exec "$@"
fi

# Auth tables come from the checked-in Drizzle migrations. The operational
# tables are created idempotently by the app on the first request.
bun scripts/migrate.ts

exec bun server.ts
