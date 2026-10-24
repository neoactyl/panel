<script lang="ts">
	import { page } from '$app/state';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import AccountFooter from '#lib/components/app/AccountFooter.svelte';
	import PanelIcon from '#lib/panel/PanelIcon.svelte';
	import type { PanelPage } from '#lib/adapter/sdk.ts';
	import IconArrowLeft from '@tabler/icons-svelte/icons/arrow-left';
	import IconTerminal from '@tabler/icons-svelte/icons/terminal-2';
	import IconFolder from '@tabler/icons-svelte/icons/folder';
	import IconNetwork from '@tabler/icons-svelte/icons/network';
	import IconDatabase from '@tabler/icons-svelte/icons/database';
	import IconArchive from '@tabler/icons-svelte/icons/archive';
	import IconClock from '@tabler/icons-svelte/icons/clock';
	import IconRocket from '@tabler/icons-svelte/icons/rocket';
	import IconUsers from '@tabler/icons-svelte/icons/users';
	import IconHistory from '@tabler/icons-svelte/icons/history';
	import IconPuzzle from '@tabler/icons-svelte/icons/puzzle';
	import IconSettings from '@tabler/icons-svelte/icons/settings';

	let {
		server,
		user,
		pages = [],
		features = {}
	}: {
		server: { id: string; name: string; node: string };
		user: { name: string | null; email: string; role?: string | null };
		pages?: PanelPage[];
		features?: Record<string, boolean>;
	} = $props();

	const groups = $derived(
		[
			{
				label: 'Managing',
				items: [
					{ slug: '', label: 'Console', icon: IconTerminal },
					{ slug: 'filemanager', label: 'File Manager', icon: IconFolder },
					{ slug: 'databases', label: 'Databases', icon: IconDatabase },
					{ slug: 'allocations', label: 'Allocations', icon: IconNetwork },
					{ slug: 'backups', label: 'Backups', icon: IconArchive },
					{ slug: 'schedules', label: 'Schedules', icon: IconClock },
					{ slug: 'addons', label: 'Addons', icon: IconPuzzle }
				]
			},
			{
				label: 'Configure',
				items: [
					{ slug: 'startup', label: 'Startup', icon: IconRocket },
					{ slug: 'subusers', label: 'Subusers', icon: IconUsers },
					{ slug: 'activities', label: 'Activities', icon: IconHistory },
					{ slug: 'settings', label: 'Settings', icon: IconSettings }
				]
			}
		]
			.map((group) => ({
				...group,
				items: group.items.filter(
					(item) => features[item.slug || 'console'] !== false
				)
			}))
			.filter((group) => group.items.length > 0)
	);

	const base = $derived(`/server/${server.id}`);
	const active = $derived.by(() => {
		const rest = page.url.pathname.slice(base.length).replace(/^\/+|\/+$/g, '');
		return rest.split('/')[0] || 'console';
	});
	const hrefFor = (slug: string) => (slug ? `${base}/${slug}` : base);

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

	const pageHref = (path: string) => `${base}/${path.replace(/^\/+|\/+$/g, '')}`;
	const pageActive = (path: string) =>
		page.url.pathname.replace(/\/+$/, '') === pageHref(path).replace(/\/+$/, '');
</script>

<Tooltip.Provider>
	<Sidebar.Root collapsible="icon" class="border-sidebar-border">
		<Sidebar.Header class="shrink-0 border-b border-sidebar-border px-2 py-2">
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="All servers" class="gap-2.5 px-1.5">
						{#snippet child({ props })}
							<a href="/server" {...props}>
								<span
									class="flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/5"
								>
									<IconArrowLeft class="h-4 w-4 text-white/60" />
								</span>
								<span class="grid flex-1 text-left leading-tight">
									<span class="truncate text-[13px] font-semibold text-white">{server.name}</span>
									<span class="truncate font-mono text-[10px] text-white/40">{server.node}</span>
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
							{#each group.items as item (item.slug)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton
										isActive={active === (item.slug || 'console')}
										tooltipContent={item.label}
										class="h-9 gap-3 px-3 text-[13px] text-white/60 data-active:bg-indigo-500/10! data-active:text-white"
									>
										{#snippet child({ props })}
											<a href={hrefFor(item.slug)} {...props}>
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
										isActive={pageActive(item.path)}
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
