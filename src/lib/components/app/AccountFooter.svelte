<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { authClient } from '#lib/auth-client.ts';
	import IconSettings from '@tabler/icons-svelte/icons/settings';
	import IconLogout from '@tabler/icons-svelte/icons/logout';
	let {
		user
	}: {
		user: { name: string | null; email: string };
	} = $props();

	let signingOut = $state(false);

	const signOut = async () => {
		if (signingOut) return;

		signingOut = true;

		try {
			await authClient.signOut();
			await goto('/auth/login', { invalidateAll: true });
		} catch {
			signingOut = false;
		}
	};

	const displayName = $derived(user.name?.trim() || user.email);
	const initials = $derived(
		(user.name || user.email)
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<Sidebar.Footer class="shrink-0 border-t border-sidebar-border px-2 py-2">
	<Sidebar.Menu>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton size="lg" tooltipContent={displayName} class="gap-3 px-1.5 text-white/70">
				{#snippet child({ props })}
					<a href="/settings" {...props}>
						<span
							class="flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/5 text-[11px] font-bold text-white"
						>
							{initials}
						</span>
						<span class="grid flex-1 text-left leading-tight">
							<span class="truncate text-[13px] font-semibold text-white">{displayName}</span>
							<span class="truncate text-[11px] text-white/40">{user.email}</span>
						</span>
					</a>
				{/snippet}
			</Sidebar.MenuButton>
			<Sidebar.MenuAction showOnHover class="w-6! [&>svg]:size-4!">
				{#snippet child({ props })}
					<a href="/settings" {...props} aria-label="Account settings">
						<IconSettings />
					</a>
				{/snippet}
			</Sidebar.MenuAction>
		</Sidebar.MenuItem>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton
				size="sm"
				tooltipContent="Sign out"
				onclick={signOut}
				class="gap-3 px-1.5 text-[12px] text-white/50 hover:text-red-300"
			>
				<IconLogout class="size-4" />
				<span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
			</Sidebar.MenuButton>
		</Sidebar.MenuItem>
	</Sidebar.Menu>
</Sidebar.Footer>
