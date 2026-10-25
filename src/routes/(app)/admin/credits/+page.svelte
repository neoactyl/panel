<script lang="ts">
	import IconCreditCard from '@tabler/icons-svelte/icons/credit-card';
	import IconSettings from '@tabler/icons-svelte/icons/settings';
	import IconTrash from '@tabler/icons-svelte/icons/trash';
	import IconCheck from '@tabler/icons-svelte/icons/check';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const input =
		'w-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-indigo-500 focus:outline-none';
	const label = 'mb-1.5 block text-[10px] font-semibold tracking-widest text-white/40 uppercase';
	const section = 'border border-white/10 bg-[#1a1a1a]';

	const formatPrice = (cents: number) => {
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: data.settings.currency.toUpperCase()
			}).format(cents / 100);
		} catch {
			return `${(cents / 100).toFixed(2)} ${data.settings.currency.toUpperCase()}`;
		}
	};
</script>

<svelte:head>
	<title>Credit top-ups - {data.settings.creditName}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-[10px] font-semibold tracking-[0.2em] text-indigo-300 uppercase">Economy</p>
			<h1 class="mt-1 text-xl font-extrabold tracking-tight text-white">Credit top-ups</h1>
			<p class="mt-1 text-sm text-white/45">
				Create the packages users can buy and verify that Stripe is ready to accept payments.
			</p>
		</div>
		<a
			href="/admin/settings"
			class="flex items-center gap-2 border border-white/10 px-3 py-2 text-[10px] font-semibold tracking-widest text-white/60 uppercase transition hover:border-white/20 hover:text-white"
		>
			<IconSettings class="h-3.5 w-3.5" />
			Stripe settings
		</a>
	</div>

	{#if form?.error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
			{form.error}
		</div>
	{/if}
	{#if form?.success}
		<div class="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
			<IconCheck class="h-4 w-4" />
			{form.success}
		</div>
	{/if}

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<div class="{section} p-4">
			<p class="text-[10px] tracking-widest text-white/40 uppercase">Stripe API</p>
			<p class="mt-1 text-sm font-semibold {data.status.configured ? 'text-emerald-300' : 'text-amber-300'}">
				{data.status.configured ? 'Connected' : 'Not configured'}
			</p>
			<p class="mt-1 text-[10px] text-white/30">
				{data.status.configured
					? `Using ${data.status.secretSource === 'settings' ? 'saved settings' : 'environment variables'}`
					: 'Add a secret key in Settings → Economy'}
			</p>
		</div>
		<div class="{section} p-4">
			<p class="text-[10px] tracking-widest text-white/40 uppercase">Webhook</p>
			<p
				class="mt-1 text-sm font-semibold {data.status.webhookConfigured
					? 'text-emerald-300'
					: 'text-amber-300'}"
			>
				{data.status.webhookConfigured ? 'Ready' : 'Not configured'}
			</p>
			<p class="mt-1 font-mono text-[10px] break-all text-white/30">
				/api/auth/stripe/webhook
			</p>
		</div>
		<div class="{section} p-4">
			<p class="text-[10px] tracking-widest text-white/40 uppercase">Purchases</p>
			<p
				class="mt-1 text-sm font-semibold {data.settings.purchasesAllowed
					? 'text-emerald-300'
					: 'text-white/50'}"
			>
				{data.settings.purchasesAllowed ? 'Enabled' : 'Disabled'}
			</p>
			<p class="mt-1 text-[10px] text-white/30">
				Toggle “Allow credit purchases” in Settings → Economy.
			</p>
		</div>
		<div class="{section} p-4">
			<p class="text-[10px] tracking-widest text-white/40 uppercase">Custom amounts</p>
			<p class="mt-1 text-sm font-semibold text-white/70">
				{data.settings.customEnabled ? 'Allowed' : 'Off'}
			</p>
			<p class="mt-1 text-[10px] text-white/30">
				{formatPrice(data.settings.pricePerCredit)} per credit ·
				{data.settings.minCredits.toLocaleString()}–{data.settings.maxCredits.toLocaleString()}
			</p>
		</div>
	</div>

	{#if !data.status.configured || !data.status.webhookConfigured}
		<div class="flex items-start gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
			<IconAlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
			<div class="space-y-1">
				<p class="font-semibold">Stripe is not fully connected.</p>
				<p class="text-amber-200/70">
					Add the secret key and webhook signing secret in Settings → Economy, then create a webhook
					at <span class="font-mono">/api/auth/stripe/webhook</span> for
					<span class="font-mono">checkout.session.completed</span>.
				</p>
			</div>
		</div>
	{/if}

	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<IconCreditCard class="h-4 w-4 text-white/50" />
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
				Add a package
			</h2>
		</div>

		<form method="POST" action="?/create" class="{section} space-y-3 p-4 sm:p-5">
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="sm:col-span-2">
					<label class={label} for="new-label">Package name</label>
					<input
						id="new-label"
						name="label"
						required
						maxlength="80"
						class={input}
						placeholder="Starter pack"
					/>
				</div>
				<div>
					<label class={label} for="new-credits">Credits</label>
					<input
						id="new-credits"
						name="credits"
						type="number"
						min="1"
						step="1"
						required
						class={input}
						placeholder="1000"
					/>
				</div>
				<div>
					<label class={label} for="new-price">Price ({data.settings.currency.toUpperCase()})</label>
					<input
						id="new-price"
						name="price"
						type="number"
						min="0.50"
						step="0.01"
						required
						class={input}
						placeholder="5.00"
					/>
				</div>
				<div>
					<label class={label} for="new-badge">Badge (optional)</label>
					<input
						id="new-badge"
						name="badge"
						maxlength="24"
						class={input}
						placeholder="Best value"
					/>
				</div>
				<div>
					<label class={label} for="new-order">Sort order</label>
					<input id="new-order" name="sortOrder" type="number" step="1" value="0" class={input} />
				</div>
			</div>
			<div>
				<label class={label} for="new-description">Description (optional)</label>
				<input
					id="new-description"
					name="description"
					maxlength="300"
					class={input}
					placeholder="What this package is best for"
				/>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<label class="flex items-center gap-2 text-xs text-white/60">
					<input type="checkbox" name="enabled" checked class="accent-indigo-500" />
					Visible to users
				</label>
				<button
					type="submit"
					class="border border-indigo-500/40 bg-indigo-500/10 px-5 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
				>
					Create package
				</button>
			</div>
		</form>
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
				Packages ({data.options.length})
			</h2>
			<p class="text-[10px] text-white/30">Every field is editable.</p>
		</div>

		{#if data.options.length === 0}
			<div class="{section} px-4 py-8 text-center text-sm text-white/40">
				No credit packages yet. Users can still buy a custom amount if that option is enabled.
			</div>
		{:else}
			<div class="space-y-3">
				{#each data.options as option (option.id)}
					<article class={section}>
						<form method="POST" action="?/update" class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
							<input type="hidden" name="id" value={option.id} />

							<div class="sm:col-span-2">
								<label class={label} for="label-{option.id}">Package name</label>
								<input
									id="label-{option.id}"
									name="label"
									value={option.label}
									required
									maxlength="80"
									class={input}
								/>
							</div>
							<div>
								<label class={label} for="credits-{option.id}">Credits</label>
								<input
									id="credits-{option.id}"
									name="credits"
									type="number"
									min="1"
									step="1"
									required
									value={option.credits}
									class={input}
								/>
							</div>
							<div>
								<label class={label} for="price-{option.id}">
									Price ({data.settings.currency.toUpperCase()})
								</label>
								<input
									id="price-{option.id}"
									name="price"
									type="number"
									min="0.50"
									step="0.01"
									required
									value={(option.priceCents / 100).toFixed(2)}
									class={input}
								/>
							</div>
							<div>
								<label class={label} for="badge-{option.id}">Badge</label>
								<input
									id="badge-{option.id}"
									name="badge"
									maxlength="24"
									value={option.badge}
									class={input}
									placeholder="Optional"
								/>
							</div>
							<div>
								<label class={label} for="order-{option.id}">Sort order</label>
								<input
									id="order-{option.id}"
									name="sortOrder"
									type="number"
									step="1"
									value={option.sortOrder}
									class={input}
								/>
							</div>
							<div class="sm:col-span-2">
								<label class={label} for="description-{option.id}">Description</label>
								<input
									id="description-{option.id}"
									name="description"
									maxlength="300"
									value={option.description}
									class={input}
									placeholder="Optional"
								/>
							</div>
							<div class="flex items-end justify-between gap-3 sm:col-span-2 lg:col-span-4">
								<label class="flex items-center gap-2 text-xs text-white/60">
									<input
										type="checkbox"
										name="enabled"
										checked={option.enabled}
										class="accent-indigo-500"
									/>
									Visible to users
								</label>
								<button
									type="submit"
									class="border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-[10px] font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
								>
									Save changes
								</button>
							</div>
						</form>

						<div class="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-4 py-2.5">
							<div class="flex flex-wrap items-center gap-3 text-[10px] tracking-widest text-white/35 uppercase">
								<span class="text-white/60">{formatPrice(option.priceCents)}</span>
								<span>·</span>
								<span>{option.credits.toLocaleString()} {data.settings.creditName}</span>
								<span
									class="border px-2 py-0.5 {option.enabled
										? 'border-emerald-500/30 text-emerald-300'
										: 'border-white/10 text-white/40'}"
								>
									{option.enabled ? 'Visible' : 'Hidden'}
								</span>
							</div>
							<div class="flex items-center gap-2">
								<form method="POST" action="?/toggle">
									<input type="hidden" name="id" value={option.id} />
									<input type="hidden" name="enabled" value={String(!option.enabled)} />
									<button
										type="submit"
										class="border border-white/10 px-2 py-1 text-[10px] font-semibold tracking-widest text-white/50 uppercase transition hover:border-white/20 hover:text-white"
									>
										{option.enabled ? 'Hide' : 'Show'}
									</button>
								</form>
								<form method="POST" action="?/delete">
									<input type="hidden" name="id" value={option.id} />
									<button
										type="submit"
										class="border border-red-500/20 p-1.5 text-red-300/70 transition hover:border-red-500/40 hover:text-red-300"
										aria-label="Delete {option.label}"
									>
										<IconTrash class="h-3.5 w-3.5" />
									</button>
								</form>
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
