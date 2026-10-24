<script lang="ts">
	import { page } from '$app/state';
	import logo from '#lib/assets/logo.svg';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import IconLayoutDashboard from '@tabler/icons-svelte/icons/layout-dashboard';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconMoon from '@tabler/icons-svelte/icons/moon';
	import IconPuzzle from '@tabler/icons-svelte/icons/puzzle';
	import IconShoppingBag from '@tabler/icons-svelte/icons/shopping-bag';
	import IconCoin from '@tabler/icons-svelte/icons/coin';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import AccountFooter from '#lib/components/app/AccountFooter.svelte';
	import PanelIcon from '#lib/panel/PanelIcon.svelte';
	import type { PanelPage } from '#lib/adapter/sdk.ts';

	let {
		user,
		pages = [],
		branding = { name: 'Neoactyl', logo: '', description: '' },
		isAdmin = false,
		nav = { afk: true, j4r: true, storefront: true, rewards: true, invites: true }
	}: {
		user: { name: string | null; email: string; role?: string | null };
		pages?: PanelPage[];
		branding?: { name: string; logo: string; description: string };
		isAdmin?: boolean;
		nav?: { afk: boolean; j4r: boolean; storefront: boolean; rewards: boolean; invites: boolean };
	} = $props();

	const items = $derived([
		{ href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard, show: true },
		{ href: '/server', label: 'Servers', icon: IconServer, show: true },
		{ href: '/afk', label: 'AFK', icon: IconMoon, show: nav.afk },
		{ href: '/j4r', label: 'J4R', icon: IconPuzzle, show: nav.j4r },
		{ href: '/rewards', label: 'Rewards', icon: IconCoin, show: nav.rewards },
		{ href: '/invite', label: 'Invite', icon: IconUsers, show: nav.invites },
		{ href: '/storefront', label: 'Storefront', icon: IconShoppingBag, show: nav.storefront }
	].filter((item) => item.show));

	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

	const extensionGroups = $derived.by(() => {
		const groups = new Map<string, PanelPage[]>();

		for (const item of [...pages]
			.filter((entry) => !entry.hidden)
			.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))) {
			const label = item.navGroup ?? 'Extensions';
			groups.set(label, [...(groups.get(label) ?? []), item]);
		}

		return [...groups].map(([label, items]) => ({ label, items }));
	});

	const pageHref = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`;
</script>

<Tooltip.Provider>
	<Sidebar.Root collapsible="icon" class="border-sidebar-border">
		<Sidebar.Header class="h-14 shrink-0 justify-center border-b border-sidebar-border px-2 py-2">
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent={branding.name} class="h-10 gap-2.5 px-1.5">
						{#snippet child({ props })}
							<a href="/dashboard" {...props}>
								<span class="flex size-7 shrink-0 items-center justify-center bg-white/5">
									<img src={branding.logo || logo} alt={branding.name} class="h-4 w-auto" />
								</span>
								<span class="truncate text-[13px] font-bold tracking-[0.2em] text-white uppercase">
									{branding.name}
								</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>

		<Sidebar.Content class="gap-1 px-2 py-3 group-data-[collapsible=icon]:px-0">
			<Sidebar.Group class="gap-1 p-0">
				<Sidebar.GroupLabel class="h-7 px-3 text-[10px] tracking-[0.18em] text-white/35">
					Navigation
				</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu class="gap-0.5">
						{#each items as item (item.href)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									isActive={isActive(item.href)}
									tooltipContent={item.label}
									class="h-9 gap-3 px-3 text-[13px] text-white/60 data-active:bg-indigo-500/10! data-active:text-white"
								>
									{#snippet child({ props })}
										<a href={item.href} {...props}>
											<item.icon class="size-4" />
											<span>{item.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>

			{#if isAdmin}
				<Sidebar.Group class="gap-1 p-0">
					<Sidebar.GroupLabel class="h-7 px-3 text-[10px] tracking-[0.18em] text-white/35">
						Administration
					</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu class="gap-0.5">
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									isActive={isActive('/admin')}
									tooltipContent="Admin"
									class="h-9 gap-3 px-3 text-[13px] text-white/60 data-active:bg-indigo-500/10! data-active:text-white"
								>
									{#snippet child({ props })}
										<a href="/admin" {...props}>
											<IconShieldLock class="size-4" />
											<span>Admin</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/if}

			{#each extensionGroups as group (group.label)}
				<Sidebar.Group class="gap-1 p-0">
					<Sidebar.GroupLabel class="h-7 px-3 text-[10px] tracking-[0.18em] text-white/35">
						{group.label}
					</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu class="gap-0.5">
							{#each group.items as item (item.id)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton
										isActive={isActive(pageHref(item.path))}
										tooltipContent={item.label}
										class="h-9 gap-3 px-3 text-[13px] text-white/60 data-active:bg-indigo-500/10! data-active:text-white"
									>
										{#snippet child({ props })}
											<a href={pageHref(item.path)} {...props}>
												<PanelIcon name={item.icon} />
												<span>{item.label}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/each}
		</Sidebar.Content>

		<AccountFooter {user} />

		<Sidebar.Rail />
	</Sidebar.Root>
</Tooltip.Provider>
