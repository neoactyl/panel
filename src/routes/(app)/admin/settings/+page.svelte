<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import IconDeviceFloppy from '@tabler/icons-svelte/icons/device-floppy';
	import IconPhoto from '@tabler/icons-svelte/icons/photo';
	import IconWorld from '@tabler/icons-svelte/icons/world';
	import IconServer from '@tabler/icons-svelte/icons/server';
	import IconCpu from '@tabler/icons-svelte/icons/cpu';
	import IconLayout from '@tabler/icons-svelte/icons/layout';
	import IconAdjustments from '@tabler/icons-svelte/icons/adjustments';
	import IconCoins from '@tabler/icons-svelte/icons/coins';
	import IconBrandDiscord from '@tabler/icons-svelte/icons/brand-discord';
	import IconShieldLock from '@tabler/icons-svelte/icons/shield-lock';
	import logo from '#lib/assets/logo.svg';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type SettingsTab = 'general' | 'infrastructure' | 'economy' | 'integrations' | 'security';

	let activeTab = $state<SettingsTab>('general');

	const { enhance: settingsEnhance, message: settingsMessage, submitting: saving } = superForm(
		data.settingsForm,
		{ id: 'settings' }
	);

	const tabs: Array<{ id: SettingsTab; label: string; icon: typeof IconWorld }> = [
		{ id: 'general', label: 'General', icon: IconWorld },
		{ id: 'infrastructure', label: 'Infrastructure', icon: IconServer },
		{ id: 'economy', label: 'Economy', icon: IconCoins },
		{ id: 'integrations', label: 'Integrations', icon: IconBrandDiscord },
		{ id: 'security', label: 'Security', icon: IconShieldLock }
	];

	const input =
		'w-full border border-white/10 bg-[#121212] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-indigo-500/60 focus:outline-none';
	const label = 'mb-1.5 block text-[11px] font-semibold tracking-wider text-white/50 uppercase';
	const section =
		'border border-white/10 bg-[#1a1a1a] p-5 sm:p-6';
	const sectionTitle = 'flex items-center gap-2 text-sm font-bold text-white';
	const toggleRow =
		'flex items-center justify-between gap-4 border border-white/10 bg-[#121212] px-3 py-2.5';
	const checked = (key: string) => data.current[key] === 'true';
</script>

<svelte:head>
	<title>Settings - {data.branding.name}</title>
</svelte:head>

<form method="POST" use:settingsEnhance class="space-y-4">
	{#if $settingsMessage && typeof $settingsMessage !== 'string'}
		<div
			class="border px-3 py-2 text-sm {$settingsMessage.status === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-200'
				: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}"
		>
			{$settingsMessage.text}
		</div>
	{/if}

	<nav class="flex flex-wrap gap-1 border border-white/10 bg-[#1a1a1a] p-1">
		{#each tabs as tab (tab.id)}
			{@const TabIcon = tab.icon}
			<button
				type="button"
				onclick={() => (activeTab = tab.id)}
				aria-current={activeTab === tab.id ? 'page' : undefined}
				class={activeTab === tab.id
					? 'flex items-center gap-2 bg-indigo-500/15 px-3 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase'
					: 'flex items-center gap-2 px-3 py-2 text-[10px] font-semibold tracking-widest text-white/40 uppercase transition hover:bg-white/5 hover:text-white/70'}
			>
				<TabIcon class="h-3.5 w-3.5" />
				{tab.label}
			</button>
		{/each}
	</nav>

	<div class="space-y-4" class:hidden={activeTab !== 'general'}>
	<section class={section}>
		<h2 class={sectionTitle}><IconWorld class="h-4 w-4 text-indigo-300" /> Branding</h2>
		<div class="mt-5 grid gap-4 sm:grid-cols-2">
			<div>
				<label class={label} for="brand.name">App name</label>
				<input id="brand.name" name="brand.name" class={input} value={data.current['brand.name']} required />
			</div>
			<div>
				<label class={label} for="brand.description">Description</label>
				<input
					id="brand.description"
					name="brand.description"
					class={input}
					value={data.current['brand.description']}
				/>
			</div>
		</div>

		<div class="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
			<div class="flex h-[86px] w-[86px] items-center justify-center border border-white/10 bg-[#121212]">
				<img src={data.logoPreview || logo} alt="" class="max-h-14 max-w-14 object-contain" />
			</div>
			<div class="space-y-3">
				<div>
					<label class={label} for="brand.logo">Logo URL</label>
					<div class="relative">
						<IconPhoto class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30" />
						<input
							id="brand.logo"
							name="brand.logo"
							class="{input} pl-9"
							value={data.current['brand.logo']}
							placeholder={data.logoData ? 'Stored upload — leave blank to keep it' : 'https://example.com/logo.png'}
						/>
					</div>
				</div>
				<div class="grid gap-2 sm:grid-cols-2">
					<label class="flex cursor-pointer items-center gap-2 border border-white/10 bg-[#121212] px-3 py-2 text-xs text-white/60">
						<input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp,image/gif" class="max-w-full text-xs" />
					</label>
					<label class="flex items-center gap-2 text-xs text-white/50">
						<Checkbox name="clearLogo" />
						Remove custom logo
					</label>
				</div>
			</div>
		</div>
	</section>

	<section class={section}>
		<h2 class={sectionTitle}><IconLayout class="h-4 w-4 text-indigo-300" /> Navigation &amp; access</h2>
		<div class="mt-5 grid gap-2 sm:grid-cols-2">
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Allow registrations</span>
				<Checkbox name="auth.registration" checked={checked('auth.registration')} />
			</label>
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Show AFK page</span>
				<Checkbox name="nav.afk" checked={checked('nav.afk')} />
			</label>
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Show J4R page</span>
				<Checkbox name="nav.j4r" checked={checked('nav.j4r')} />
			</label>
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Show Storefront page</span>
				<Checkbox name="nav.storefront" checked={checked('nav.storefront')} />
			</label>
		</div>
	</section>
	</div>

	<div class="space-y-4" class:hidden={activeTab !== 'infrastructure'}>
	<section class={section}>
		<h2 class={sectionTitle}><IconServer class="h-4 w-4 text-indigo-300" /> Panel connection</h2>
		<div class="mt-5 grid gap-4 sm:grid-cols-2">
			<div>
				<label class={label} for="panel.adapter">Adapter</label>
				<select id="panel.adapter" name="panel.adapter" class={input}>
					<option value="mock" selected={data.current['panel.adapter'] === 'mock'}>Mock</option>
					<option value="calagopus" selected={data.current['panel.adapter'] === 'calagopus'}>
						Calagopus
					</option>
				</select>
			</div>
			<div>
				<label class={label} for="panel.url">Panel URL</label>
				<input
					id="panel.url"
					name="panel.url"
					class={input}
					value={data.current['panel.url']}
					placeholder="https://panel.example.com"
				/>
			</div>
		</div>
		<div class="mt-4">
			<label class={label} for="panel.token">Panel API token</label>
			<input
				id="panel.token"
				name="panel.token"
				type="password"
				class={input}
				placeholder={data.tokenSet ? 'Leave blank to keep the current token' : 'Required for Calagopus'}
			/>
			{#if data.tokenSet}
				<label class="mt-2 flex items-center gap-2 text-xs text-white/50">
					<Checkbox name="clearPanelToken" />
					Remove the stored token
				</label>
			{/if}
		</div>
		<div class="mt-5 grid gap-2 sm:grid-cols-2">
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Link panel accounts on login</span>
				<Checkbox name="panel.linkAccounts" checked={checked('panel.linkAccounts')} />
			</label>
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Create panel accounts on signup</span>
				<Checkbox name="panel.createAccounts" checked={checked('panel.createAccounts')} />
			</label>
		</div>
	</section>

	<section class={section}>
		<h2 class={sectionTitle}><IconCpu class="h-4 w-4 text-indigo-300" /> Resources &amp; servers</h2>
		<div class="mt-5 grid gap-4 sm:grid-cols-3">
			<div>
				<label class={label} for="quota.cpu">User CPU quota (%)</label>
				<input id="quota.cpu" name="quota.cpu" type="number" min="1" class={input} value={data.current['quota.cpu']} />
			</div>
			<div>
				<label class={label} for="quota.memory">User memory quota (MB)</label>
				<input id="quota.memory" name="quota.memory" type="number" min="1" class={input} value={data.current['quota.memory']} />
			</div>
			<div>
				<label class={label} for="quota.disk">User disk quota (MB)</label>
				<input id="quota.disk" name="quota.disk" type="number" min="1" class={input} value={data.current['quota.disk']} />
			</div>
			<div>
				<label class={label} for="quota.databases">Databases per server (0 = unlimited)</label>
				<input id="quota.databases" name="quota.databases" type="number" min="0" class={input} value={data.current['quota.databases']} />
			</div>
			<div>
				<label class={label} for="quota.allocations">Extra allocations per server (0 = unlimited)</label>
				<input id="quota.allocations" name="quota.allocations" type="number" min="0" class={input} value={data.current['quota.allocations']} />
			</div>
		</div>
		<div class="mt-4 grid gap-4 sm:grid-cols-3">
			<div>
				<label class={label} for="server.default.cpu">Default CPU (%)</label>
				<input id="server.default.cpu" name="server.default.cpu" type="number" min="1" class={input} value={data.current['server.default.cpu']} />
			</div>
			<div>
				<label class={label} for="server.default.memory">Default memory (MB)</label>
				<input id="server.default.memory" name="server.default.memory" type="number" min="1" class={input} value={data.current['server.default.memory']} />
			</div>
			<div>
				<label class={label} for="server.default.disk">Default disk (MB)</label>
				<input id="server.default.disk" name="server.default.disk" type="number" min="1" class={input} value={data.current['server.default.disk']} />
			</div>
		</div>
		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<div>
				<label class={label} for="server.maxPerUser">Max servers per user (0 = unlimited)</label>
				<input id="server.maxPerUser" name="server.maxPerUser" type="number" min="0" class={input} value={data.current['server.maxPerUser']} />
			</div>
			<label class="{toggleRow} mt-5">
				<span class="text-sm text-white/70">Allow users to create servers</span>
				<Checkbox name="server.allowCreate" checked={checked('server.allowCreate')} />
			</label>
		</div>
	</section>

	</div>

	<div class="space-y-4" class:hidden={activeTab !== 'economy'}>
	<section class={section}>
		<h2 class={sectionTitle}><IconCoins class="h-4 w-4 text-amber-300/80" /> Credits &amp; renewals</h2>
		<p class="mt-1 text-xs text-white/40">
			Credits pay for new servers, resource upgrades, and recurring server renewals.
		</p>
		<div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div>
				<label class={label} for="credits.currency">Currency name</label>
				<input
					id="credits.currency"
					name="credits.currency"
					class={input}
					maxlength="30"
					value={data.current['credits.currency']}
				/>
			</div>
			<div>
				<label class={label} for="credits.creationCost">Server creation cost</label>
				<input
					id="credits.creationCost"
					name="credits.creationCost"
					type="number"
					min="0"
					class={input}
					value={data.current['credits.creationCost']}
				/>
			</div>
			<div>
				<label class={label} for="credits.defaultRenewalPrice">Default renewal price</label>
				<input
					id="credits.defaultRenewalPrice"
					name="credits.defaultRenewalPrice"
					type="number"
					min="0"
					class={input}
					value={data.current['credits.defaultRenewalPrice']}
				/>
			</div>
			<div>
				<label class={label} for="credits.intervalDays">Renewal interval (days)</label>
				<input
					id="credits.intervalDays"
					name="credits.intervalDays"
					type="number"
					min="1"
					class={input}
					value={data.current['credits.intervalDays']}
				/>
			</div>
			<div>
				<label class={label} for="credits.retryHours">Retry window before expiry (hours)</label>
				<input
					id="credits.retryHours"
					name="credits.retryHours"
					type="number"
					min="0"
					class={input}
					value={data.current['credits.retryHours']}
				/>
			</div>
			<div>
				<label class={label} for="credits.deleteAfterDays">Delete suspended servers after (days)</label>
				<input
					id="credits.deleteAfterDays"
					name="credits.deleteAfterDays"
					type="number"
					min="0"
					class={input}
					value={data.current['credits.deleteAfterDays']}
				/>
			</div>
		</div>
		<div class="mt-5 grid gap-2 sm:grid-cols-2">
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Enable credits and renewals</span>
				<Checkbox name="credits.enabled" checked={checked('credits.enabled')} />
			</label>
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Charge credits for new servers</span>
				<Checkbox
					name="credits.creationCostEnabled"
					checked={checked('credits.creationCostEnabled')}
				/>
			</label>
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Allow credit purchases (Stripe)</span>
				<Checkbox
					name="credits.allowPurchase"
					checked={checked('credits.allowPurchase')}
				/>
			</label>
			<label class={toggleRow}>
				<span class="text-sm text-white/70">Allow users to earn credits</span>
				<Checkbox name="credits.allowEarn" checked={checked('credits.allowEarn')} />
			</label>
		</div>
	</section>
	</div>

	{#each data.extraSections as extra (extra.title)}
		<section class={section} class:hidden={activeTab !== extra.tab}>
			<h2 class={sectionTitle}><IconAdjustments class="h-4 w-4 text-indigo-300" /> {extra.title}</h2>
			<p class="mt-1 text-xs text-white/40">{extra.description}</p>
			<div class="mt-5 grid gap-4 sm:grid-cols-2">
				{#each extra.fields as field (field.key)}
					{#if field.type === 'boolean'}
						<label class={toggleRow}>
							<span class="text-sm text-white/70">{field.label}</span>
							<Checkbox name={field.key} checked={checked(field.key)} />
						</label>
					{:else}
						<div>
							<label class={label} for={field.key}>{field.label}</label>
							{#if field.type === 'secret'}
								<input
									id={field.key}
									name={field.key}
									type="password"
									class={input}
									placeholder={data.secretSet[field.key]
										? 'Stored - leave blank to keep it'
										: (field.placeholder ?? '')}
								/>
								{#if data.secretSet[field.key]}
									<label class="mt-2 flex items-center gap-2 text-xs text-white/50">
										<Checkbox name={`clear-${field.key}`} />
										Remove the stored value
									</label>
								{/if}
							{:else}
								<input
									id={field.key}
									name={field.key}
									type={field.type === 'number' ? 'number' : 'text'}
									min={field.type === 'number' ? '0' : undefined}
									class={input}
									value={data.current[field.key]}
								/>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/each}

	<section class={section} class:hidden={activeTab !== 'security'}>
		<h2 class={sectionTitle}><IconAdjustments class="h-4 w-4 text-indigo-300" /> Server features</h2>
		<p class="mt-1 text-xs text-white/40">
			Disabled features are hidden from the sidebar and return 404 when visited directly.
		</p>
		<div class="mt-5 grid gap-2 sm:grid-cols-2">
			{#each data.features as feature (feature.key)}
				<label class={toggleRow}>
					<span class="text-sm text-white/70">{feature.label}</span>
					<Checkbox name={feature.key} checked={checked(feature.key)} />
				</label>
			{/each}
		</div>
	</section>

	<div class="sticky bottom-4 flex justify-end">
		<button
			type="submit"
			class="flex items-center gap-2 bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-xl shadow-black/40 transition hover:bg-indigo-400"
		>
			<IconDeviceFloppy class="h-4 w-4" />
			Save settings
		</button>
	</div>
</form>
