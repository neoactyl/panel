import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { afkWebSocketPlugin } from "./src/lib/server/afk/vite-plugin.ts";

export default defineConfig({
  plugins: [
    tailwindcss(),
    afkWebSocketPlugin(),
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
