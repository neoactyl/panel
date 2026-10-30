<script lang="ts">
	import { page } from '$app/state';
	import GridBackground from '#lib/components/app/GridBackground.svelte';
	import AdminSidebar from '#lib/components/app/AdminSidebar.svelte';
	import AppSidebar from '#lib/components/app/AppSidebar.svelte';
	import ServerSidebar from '#lib/components/app/ServerSidebar.svelte';
	import PanelPromptHost from '#lib/panel/PanelPromptHost.svelte';
	import { feedback } from '#lib/panel/feedback.svelte.ts';
	import type { PanelBlueprint } from '#lib/adapter/sdk.ts';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import IconCoins from '@tabler/icons-svelte/icons/coins';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	type SidebarServer = { id: string; name: string; node: string };

	const server = $derived.by((): SidebarServer | null => {
		if (!/^\/server\/[^/]+(?:\/.*)?$/.test(page.url.pathname)) return null;
		const loaded = page.data.server as SidebarServer | undefined;
		return loaded ?? null;
	});

	const serverPages = $derived(
		(page.data.serverBlueprint as PanelBlueprint | undefined)?.pages ?? []
	);

	const serverFeatures = $derived(
		(page.data.serverFeatures as Record<string, boolean> | undefined) ?? {}
	);
</script>

<GridBackground />

<Sidebar.Provider>
	{#if server}
		<ServerSidebar {server} user={data.user} pages={serverPages} features={serverFeatures} />
	{:else if page.url.pathname.startsWith('/admin')}
		<AdminSidebar user={data.user} branding={data.branding} />
	{:else}
		<AppSidebar
			user={data.user}
			pages={data.appBlueprint.pages}
			branding={data.branding}
			isAdmin={data.isAdmin}
			nav={data.nav}
		/>
	{/if}

	<Sidebar.Inset class="bg-transparent! min-h-svh">
		<header class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
			<Sidebar.Trigger class="-ml-1 text-white/60 hover:bg-white/5 hover:text-white" />
			<span class="text-xs font-semibold tracking-widest text-white/40 uppercase">
				{data.branding.name}
			</span>

			{#if data.credits !== null}
				<a
					href="/credits"
					title="Credits remaining — buy more"
					class="ml-auto flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition hover:bg-white/10"
				>
					<IconCoins class="h-3.5 w-3.5 text-amber-300/70" />
					<span class="font-semibold text-white">{data.credits.toLocaleString()}</span>
					<span class="text-white/45">{data.currency}</span>
				</a>
			{/if}
		</header>

		<main class="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>

{#if feedback.message}
	<div
		class="fixed bottom-4 left-4 z-[70] max-w-sm border border-white/10 bg-[#1a1a1a] px-4 py-2 text-sm text-white/70 shadow-xl"
	>
		{feedback.message}
	</div>
{/if}

<PanelPromptHost />

