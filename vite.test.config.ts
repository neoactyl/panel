import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { afkWebSocketPlugin } from './src/lib/server/afk/vite-plugin.ts';

export default defineConfig({
	plugins: [
		tailwindcss(),
		afkWebSocketPlugin(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	optimizeDeps: {
		include: ['@tabler/icons-svelte']
	}
});
