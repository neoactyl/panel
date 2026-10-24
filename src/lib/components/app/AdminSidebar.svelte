<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import AccountFooter from '#lib/components/app/AccountFooter.svelte';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconLayoutDashboard from '@tabler/icons-svelte/icons/layout-dashboard';
	import IconSettings from '@tabler/icons-svelte/icons/settings';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconShoppingBag from '@tabler/icons-svelte/icons/shopping-bag';
	import IconPackage from '@tabler/icons-svelte/icons/package';
	import IconListDetails from '@tabler/icons-svelte/icons/list-details';
	import IconCoin from '@tabler/icons-svelte/icons/coin';
	import IconActivity from '@tabler/icons-svelte/icons/activity';

	let {
		user,
		branding
	}: {
		user: { name: string | null; email: string; role?: string | null };
		branding: { name: string };
	} = $props();

	const groups = [
		{
			label: 'Administration',
			items: [
				{ href: '/admin', label: 'Overview', icon: IconLayoutDashboard, exact: true },
				{ href: '/admin/users', label: 'Users', icon: IconUsers, exact: false },
				{ href: '/admin/servers', label: 'Servers', icon: IconServer, exact: false },
				{ href: '/admin/storefront', label: 'Storefront', icon: IconShoppingBag, exact: false },
				{ href: '/admin/economy', label: 'Economy', icon: IconCoin, exact: false },
				{ href: '/admin/software', label: 'Software', icon: IconPackage, exact: false },
				{ href: '/admin/system', label: 'System', icon: IconActivity, exact: false },
				{ href: '/admin/logs', label: 'Logs', icon: IconListDetails, exact: false }
			]
		},
		{
			label: 'Configuration',
			items: [{ href: '/admin/settings', label: 'Settings', icon: IconSettings, exact: false }]
		}
	];

	const isActive = (href: string, exact = false) =>
		exact ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

<Tooltip.Provider>
	<Sidebar.Root collapsible="icon" class="border-sidebar-border">
		<Sidebar.Header class="shrink-0 border-b border-sidebar-border px-2 py-2">
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="Back to panel" class="gap-2.5 px-1.5">
						{#snippet child({ props })}
							<a href="/dashboard" {...props}>
								<span
									class="flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/5"
								>
									<IconArrowLeft class="h-4 w-4 text-white/60" />
								</span>
								<span class="grid flex-1 text-left leading-tight">
									<span class="truncate text-[13px] font-semibold text-white">Administration</span>
									<span class="truncate font-mono text-[10px] text-white/40">{branding.name}</span>
								</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>

		<Sidebar.Content class="gap-1 px-2 py-3 group-data-[collapsible=icon]:px-0">
			{#each groups as group (group.label)}
				<Sidebar.Group class="gap-1 p-0">
					<Sidebar.GroupLabel class="h-7 px-3 text-[10px] tracking-[0.18em] text-white/35">
						{group.label}
					</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu class="gap-0.5">
							{#each group.items as item (item.href)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton
										isActive={isActive(item.href, item.exact)}
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
			{/each}
		</Sidebar.Content>

		<AccountFooter {user} />

		<Sidebar.Rail />
	</Sidebar.Root>
</Tooltip.Provider>
