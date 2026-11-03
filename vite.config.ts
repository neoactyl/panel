import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";
import { afkWebSocketPlugin } from "./src/lib/server/afk/vite-plugin.ts";

/**
 * Production starts background work from `server.ts`. The Vite dev server does
 * not load that entry point, so start the same lifecycle here instead
 * (renewals, the embedded Discord bot and the startup banner).
 */
const lifecyclePlugin: Plugin = {
  name: "neoactyl-lifecycle",
  apply: "serve",
  configureServer(server) {
    server.httpServer?.once("listening", () => {
      void server
        .ssrLoadModule("/src/lib/server/lifecycle.ts")
        .then((module) => (module.initializeServer as () => void)())
        .catch((cause: unknown) => {
          server.config.logger.error(
            `[lifecycle] Unable to start background work: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        });
    });
  },
};

export default defineConfig({
  plugins: [
    tailwindcss(),
    afkWebSocketPlugin(),
    lifecyclePlugin,
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },

      // The AFK WebSocket gateway needs a long-lived Node process, so the app
      // targets adapter-node (see `server.ts` for the production entry point).
      adapter: adapter(),
    }),
  ],
  optimizeDeps: {
    include: ["@tabler/icons-svelte"],
  },
});
