<script lang="ts">
	import IconCoin from '@tabler/icons-svelte/icons/coin';
	import IconCreditCard from '@tabler/icons-svelte/icons/credit-card';
	import IconReceipt from '@tabler/icons-svelte/icons/receipt';
	import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Automatically executes inside the browser when form values mutate
	$effect(() => {
		if (form?.success && form?.target) {
			window.location.href = form.target;
		}
	});

	const formatPrice = (cents: number, currency: string) => {
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: currency.toUpperCase()
			}).format(cents / 100);
		} catch {
			return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
		}
	};

	const formatDate = (value: Date | string | null) =>
		value ? new Date(value).toLocaleString() : '—';
</script>

<svelte:head>
	<title>Credits - {data.settings.creditName}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-[10px] font-semibold tracking-[0.2em] text-indigo-300 uppercase">Balance</p>
			<h1 class="mt-1 text-xl font-extrabold tracking-tight text-white">
				Buy {data.settings.creditName}
			</h1>
			<p class="mt-1 text-sm text-white/45">
				Top up your balance with Stripe to pay for servers, upgrades and renewals.
			</p>
		</div>
		<div class="flex items-center gap-3 border border-white/10 bg-[#1a1a1a] px-5 py-3">
			<IconCoin class="size-5 text-amber-300/80" />
			<div>
				<p class="text-lg font-semibold text-white">{data.balance.toLocaleString()}</p>
				<p class="text-[10px] tracking-widest text-white/40 uppercase">{data.settings.creditName}</p>
			</div>
		</div>
	</div>

	{#if data.notice}
		<div class="border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
			{data.notice}
		</div>
	{/if}
	{#if data.checkoutError}
		<div class="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
			{data.checkoutError}
		</div>
	{/if}
	{#if form?.error}
		<div class="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
			{form.error}
		</div>
	{/if}

	<section class="space-y-4">
		<div class="flex items-center gap-2">
			<IconCreditCard class="size-4 text-white/50" />
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
				Top-up options
			</h2>
		</div>

		{#if !data.settings.purchasesAllowed}
			<div class="flex items-start gap-3 border border-white/10 bg-[#1a1a1a] px-4 py-4 text-sm text-white/50">
				<IconAlertTriangle class="mt-0.5 size-4 shrink-0 text-amber-300/70" />
				<p>Credit purchases are currently disabled by an administrator.</p>
			</div>
		{:else if !data.settings.stripeConfigured}
			<div class="flex items-start gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
				<IconAlertTriangle class="mt-0.5 size-4 shrink-0" />
				<p>
					Stripe is not connected yet. An administrator needs to add Stripe API keys in
					Settings before credits can be purchased.
				</p>
			</div>
		{:else}
			{#if data.options.length > 0}
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each data.options as option (option.id)}
						<form method="POST" action="?/checkout" class="flex">
							<input type="hidden" name="optionId" value={option.id} />
							<div class="flex w-full flex-col border border-white/10 bg-[#1a1a1a] p-5 transition hover:border-indigo-500/40">
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-[10px] font-semibold tracking-widest text-indigo-300/70 uppercase">
											{option.label}
										</p>
										<p class="mt-2 text-2xl font-extrabold tracking-tight text-white">
											{option.credits.toLocaleString()}
											<span class="text-sm font-medium text-white/40">{data.settings.creditName}</span>
										</p>
									</div>
									{#if option.badge}
										<span class="shrink-0 border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-[9px] font-semibold tracking-widest text-indigo-200 uppercase">
											{option.badge}
										</span>
									{/if}
								</div>

								{#if option.description}
									<p class="mt-3 text-xs text-white/40">{option.description}</p>
								{/if}

								<div class="mt-4 flex-1"></div>

								<button
									type="submit"
									class="mt-4 w-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
								>
									Buy for {formatPrice(option.priceCents, data.settings.currency)}
								</button>
							</div>
						</form>
					{/each}
				</div>
			{:else}
				<div class="border border-dashed border-white/10 bg-[#1a1a1a] px-4 py-8 text-center text-sm text-white/40">
					No credit packages are available right now.
				</div>
			{/if}

			{#if data.settings.customEnabled}
				<form
					method="POST"
					action="?/checkout"
					class="border border-white/10 bg-[#1a1a1a] p-5"
				>
					<h3 class="text-sm font-semibold text-white">Choose your own amount</h3>
					<p class="mt-1 text-xs text-white/40">
						{formatPrice(data.settings.pricePerCredit, data.settings.currency)} per credit ·
						{data.settings.minCredits.toLocaleString()} to
						{data.settings.maxCredits.toLocaleString()} credits
					</p>
					<div class="mt-4 flex flex-wrap items-end gap-3">
						<label class="min-w-48 flex-1">
							<span class="mb-1.5 block text-[10px] font-semibold tracking-widest text-white/40 uppercase">
								Credits
							</span>
							<input
								name="credits"
								type="number"
								min={data.settings.minCredits}
								max={data.settings.maxCredits}
								step="1"
								required
								value={data.settings.minCredits}
								class="w-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
							/>
						</label>
						<button
							type="submit"
							class="border border-indigo-500/40 bg-indigo-500/10 px-5 py-2 text-xs font-semibold tracking-widest text-indigo-200 uppercase transition hover:bg-indigo-500/20"
						>
							Continue to Stripe
						</button>
					</div>
				</form>
			{/if}
		{/if}
	</section>

	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<IconReceipt class="size-4 text-white/50" />
			<h2 class="text-[10px] font-semibold tracking-widest text-white/50 uppercase">
				Purchase history
			</h2>
		</div>

		{#if data.history.length === 0}
			<div class="border border-white/10 bg-[#1a1a1a] px-4 py-6 text-sm text-white/40">
				No credit purchases yet.
			</div>
		{:else}
			<div class="divide-y divide-white/5 border border-white/10 bg-[#1a1a1a]">
				{#each data.history as entry (entry.id)}
					<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div>
							<p class="text-sm font-semibold text-white">
								+{entry.credits.toLocaleString()} {data.settings.creditName}
							</p>
							<p class="text-[11px] text-white/35">{formatDate(entry.createdAt)}</p>
						</div>
						<div class="flex items-center gap-4">
							<span class="text-sm text-white/60">
								{entry.amountCents === null
									? '—'
									: formatPrice(entry.amountCents, entry.currency)}
							</span>
							<span class="border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold tracking-widest text-emerald-300 uppercase">
								Completed
							</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
