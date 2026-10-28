#!/usr/bin/env bun
/**
 * Standalone runner for the Discord invite bot.
 *
 * The same bot also starts inside the SvelteKit web process (shard 0 by
 * default). Use this entrypoint to host additional shards on separate machines:
 *
 *   # web process (keeps shard 0 embedded)
 *   DISCORD_SHARD_COUNT=4 DISCORD_SHARD_IDS=0
 *
 *   # separate workers
 *   DISCORD_SHARD_COUNT=4 DISCORD_SHARD_IDS=1 bun run bot
 *   DISCORD_SHARD_COUNT=4 DISCORD_SHARD_IDS=2 bun run bot
 *
 * Set DISCORD_EMBED_BOT=false on the web process when it should not host any
 * gateway session at all. Every process must use the same bot token, the same
 * DISCORD_SHARD_COUNT and the same DATABASE_URL. Discord requires all shards to
 * be online together.
 */

type BunModuleLoader = () => {
  loader: "object";
  exports: Record<string, string | undefined>;
};

type BunBuild = {
  module(specifier: string, loader: BunModuleLoader): void;
};

type BunRuntime = {
  plugin(plugin: { name: string; setup(build: BunBuild): void }): void;
};

const runtime = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun;

if (!runtime) {
  console.error(
    "This entrypoint must be run with Bun: bun scripts/discord-bot.ts",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(
    "[discord] DATABASE_URL is not set. The bot reads settings and invite rewards from the panel database.",
  );
  process.exit(1);
}

// A separate process does not have SvelteKit's virtual `$app/env/private`
// module. The bot does not use the web session/auth configuration, so provide
// harmless placeholders for the two shared values it does not need. The bot
// token is read from DISCORD_BOT_TOKEN or from the encrypted database setting;
// in the latter case SETTINGS_ENCRYPTION_KEY (or the same BETTER_AUTH_SECRET
// used by the web process) must be available to decrypt it.
const environment: Record<string, string | undefined> = { ...process.env };

environment.ORIGIN ??= "http://localhost:5173";
environment.BETTER_AUTH_URL ??= environment.ORIGIN;
environment.BETTER_AUTH_SECRET ??= "standalone-discord-bot-placeholder-secret";

if (!environment.SETTINGS_ENCRYPTION_KEY && !process.env.BETTER_AUTH_SECRET) {
  console.warn(
    "[discord] Neither SETTINGS_ENCRYPTION_KEY nor BETTER_AUTH_SECRET is set. " +
      "Stored secrets (including discord.botToken) cannot be decrypted unless DISCORD_BOT_TOKEN is provided directly.",
  );
}

runtime.plugin({
  name: "sveltekit-private-env",
  setup(build) {
    build.module("$app/env/private", () => ({
      loader: "object",
      exports: environment,
    }));
  },
});

// Imported dynamically so the shim above is registered before the bot's
// dependency on `$app/env/private` is evaluated.
const { startDiscordBot, stopDiscordBot } = await import(
  "../src/lib/server/discord/bot.ts"
);

let stopping = false;

const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;

  console.info(`[discord] Received ${signal}; shutting down.`);

  await stopDiscordBot().catch((cause) => {
    console.error("[discord] Unable to stop cleanly.", cause);
  });

  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

const client = await startDiscordBot();

if (!client) {
  console.error(
    "[discord] The standalone bot could not start. Check DISCORD_BOT_TOKEN, " +
      "the invite tracking setting, the guild IDs, and DISCORD_SHARD_IDS/DISCORD_SHARD_COUNT.",
  );
  process.exit(1);
}
